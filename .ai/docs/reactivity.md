# Reactivity

> Subsystem reference for `packages/runtime/src/reactivity/`. Describes the
> code as it is. Design rationale, the comparison with plain React state, and
> the measurements behind the decision:
> [`../plan/poc-04-reactivity.md`](../plan/poc-04-reactivity.md).
>
> **Last updated:** step 7 (segment batches, watchdog, robust delivery).

## Role

Reactive state lives in **signals**, outside React. Each component
subscribes, through `useSyncExternalStore`, to the values its bindings read.
A change re-renders only the components whose own values changed. The
declaring component, its containers and its siblings are not involved.

## API (`@gluefuil/runtime`)

| Export | What it does |
|--------|--------------|
| `signal(value, { equals? })` | A writable value: `.get()` (tracked), `.peek()` (untracked), `.set(v)`. Setting an equal value (`Object.is` by default) does nothing. |
| `computed(fn, { equals? })` | A derived value: lazy, cached, glitch-free. Errors are cached and rethrown. |
| `batch(fn)` | Watchers are notified once, after the outermost batch. Returns `fn`'s value. |
| `startBatch()`, `endBatch()` | A batch that is opened and closed in separate places: handler segments (see [async-handlers.md](async-handlers.md)). It must close within the synchronous run that opened it; the **watchdog** force-closes a leaked one at the next microtask and reports a `ReactivityError`. An unbalanced `endBatch()` is ignored. |
| `isBatching()` | For tests and diagnostics |
| `watch(source, callback)` | A leaf subscriber; returns the function that stops watching. The callback must read the source: a computed that nobody reads stops forwarding changes. |
| `untracked(fn)` | Reads without recording dependencies |
| `observerCount(source)` | For tests and diagnostics |
| `ReactivityError` | A computation wrote state, or a cycle was found |
| `useSignal(source, serverSnapshot?)` | Reads a signal or computed in a component |
| `useComputed(fn, deps, equals = shallowEqual)` | A computed owned by the component. `deps` are its non-reactive inputs (props); a change creates a new computed. Has a server snapshot (below). |
| `inServerView(fn)`, `isServerView()` | The server view (`server-view.ts`): how values look to server rendering and hydration |
| `shallowEqual(a, b)` | Same value, or arrays or plain objects with `Object.is`-equal entries |
| `variable(init)` | A reactive variable: **follows** `init` (a lazy, tracked computed) until `set`, then holds the assigned value. `.assigned` tells which. Values are deep-frozen. |
| `freezeDeep(value)` | Freezes plain objects and arrays recursively; already-frozen subtrees are skipped (as Immer does) |
| `createScope(entries, parent?)` | The `$$s` object compiled code reads and writes. `{ variable }` → getter + **setter**; `{ signal }` → getter; `{ value }` → constant. The prototype is `parent`, so names shadow and a write reaches the declaring scope's setter. Frozen. |
| `SIGNAL_NODE` | The key under which a wrapper (a variable) exposes its store node, so `watch`, `useSignal` and `observerCount` accept it |

## How a compiled component uses it

```tsx
function Text({ value, scope }) {
  // All of the component's bindings, in one computed:
  const [text] = useComputed(() => [value(scope)], [value, scope]);
  return <span>{String(text)}</span>;
}
```

The binding code from step 3 reads `$$s.count`. Through `createScope`, that
is `countSignal.get()`, so the component's computed tracks exactly the
variables the binding touches, including inside called functions.

A compiled handler writes variables through the scope's setters
(`$$s.count++`), or, for a path inside a variable's value, through the
runtime path helpers (see [codegen.md](codegen.md) § Handlers). `Bound`
runs each handler call in `batch()`.

## Variables

- **Follow until assigned** (XMLUI `markup.md`): a variable is a computed
  over `init` until its first `set`; from then on it holds the assigned
  value, and the initializer is no longer read.
- **Deep-frozen values** (plain objects and arrays), as XMLUI's state is
  (Immer 9 auto-freeze). In-place mutation through an alias throws a
  `TypeError` instead of silently skipping a re-render. Changes go through
  assignment or the path helpers, which copy along the path (structural
  sharing).
- **Containers:** `useScope(parent, definitions)` (runtime `render/`)
  creates a container's variables once per component instance.
  Initializers see the new scope, so variables can refer to each other in
  any order.

## Store algorithm (`signals.ts`)

**Push-pull:**

- A write bumps the signal's version and marks its direct observers
  DIRTY. A node that was CLEAN marks its own observers CHECK. Watchers are
  queued and called after the batch.
- A read (`refresh`) recomputes a DIRTY node. A CHECK node first refreshes
  its dependencies and compares their versions with the versions it saw;
  it recomputes only if one changed.
- So a diamond computes once per change, never with a mix of old and new
  values.

**Equality cutoff:** a recomputed value that `equals` the previous one
keeps its version, so its observers revalidate without recomputing.

**Linking:**

- A computed adds itself to its sources' observers only while it has
  observers of its own.
- Unobserved, it revalidates by version on every read. A computed created
  during a render that never commits holds no links, so nothing leaks.
- When it gains its first observer, it links its dependencies and
  revalidates, so it starts CLEAN. Only a CLEAN node forwards marks.

**Dynamic dependencies:** each recompute collects a new dependency set and
updates the links.

**Guards:** `set` during a computation throws (bindings are pure); so does
a cycle.

**Delivery** (`flush`):

- every watcher is called even if another throws; errors go to the runtime
  error reporter afterwards;
- a write inside a watcher is picked up by the running loop;
- after 100 rounds of watchers changing state, delivery stops and a
  `ReactivityError` is reported.

## React integration (`react.ts`)

- `useSignal` = `useSyncExternalStore(watch(source), source.peek,
  serverSnapshot ?? source.peek)`.
- **`useComputed`'s server snapshot** is `fn` evaluated untracked in the
  **server view**, cached with `equals` (React requires repeated calls to
  agree). Server rendering and hydration read it; afterwards React
  re-renders only components whose client snapshot differs. Environment
  readers check the server view: so far only `currentBreakpoint()`
  ([ssg.md](ssg.md)).
- `useComputed` creates its computed in `useMemo`. It is linked only when
  React subscribes during commit, which is safe under StrictMode and with
  discarded renders.
- **Tearing-free:** if the store changes during a concurrent render,
  React re-renders synchronously, so all components show the same value
  (tested).
- **Limitation:** updates through `useSyncExternalStore` are always
  synchronous. A signal write cannot be a transition: React falls back to
  a blocking update (react.dev, `useSyncExternalStore` caveats).

## Files

| File | Contents |
|------|----------|
| `runtime/src/reactivity/signals.ts` | The store |
| `runtime/src/reactivity/react.ts` | `useSignal`, `useComputed`, `shallowEqual` |
| `runtime/src/reactivity/scope.ts` | `createScope` |
| `runtime/src/reactivity/variable.ts` | `variable`, `freezeDeep` |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/reactivity/signals.test.ts` | The store: laziness, caching, chains, diamond, equality cutoff, dynamic dependencies, unobserved computeds, errors, writes during computation, cycles, `untracked`, batch, watchers that write, unlinking, relinking |
| `runtime/tests/reactivity/scenario.tsx`, `scenario.test.tsx` | The step 4 scenario under signals and under plain React state (naive and memoized): render counts per component for each handler |
| `runtime/tests/reactivity/react.test.tsx` | Re-render only on change, shallow cutoff, props as inputs, unmount releases links, StrictMode, error boundary, server rendering, a compiled binding driving a component, tearing (with a control that does tear) |
| `runtime/tests/reactivity/batching.test.ts` | `startBatch`/`endBatch`, the watchdog, a throwing watcher, the ping-pong guard |
| `runtime/tests/reactivity/variable.test.ts` | Variables (follow, assign, laziness, freezing), scopes (shadowing, setters through the prototype chain, tracking), the path helpers (structural sharing, results, errors) |
| `runtime/bench/reactivity.bench.tsx` | 1,000 rows: update one or all, under (a), (b) and (b) with memo |

## Measured

Render counts for the scenario, one handler each:

| Handler | (a) signals | (b) React state | (b) + `React.memo` everywhere |
|---------|-------------|-----------------|-------------------------------|
| `count++` | the 3 texts that read `count` | all 10 components | 8 of 10: the declaring component, both stacks (new `children`), the 3 texts and the 3 buttons (new closures) |
| `name = …` | 1 text | all 10 | n/a |
| both, batched | 4 texts, once each | all 10 | n/a |

Update cost, 1,000 rows in jsdom (`npm run bench`), including React's render
and commit:

| Update | (a) signals | (b) React state | (b) + memo |
|--------|-------------|-----------------|------------|
| one row | 0.15 ms | 2.3 ms | 1.2 ms |
| all rows | 2.3 ms | 2.6 ms | 2.7 ms |
