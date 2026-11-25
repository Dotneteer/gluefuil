# Step 4: Reactivity core

**Status:** Done

Part of [poc-steps.md](poc-steps.md). Decides the open question of
[architecture.md](architecture.md) § "Open question for area 1".

## Goal

Decide how compiled reactivity drives React. Build the same small scenario
two ways, then measure render counts and update cost:

- **(a) signals:** a signal store plus one `useSyncExternalStore`
  subscription per component;
- **(b) plain React state:** `useState` in the declaring component, values
  passed down as props.

## Background (XMLUI)

Sources: `.ai/xmlui/container-state.md`, `.ai/xmlui/rendering-pipeline.md`.

- Each stateful component lives in a **container** with its own
  `useReducer` (Immer). Children receive the parent's state object as a
  prop.
- A handler's writes go through a `Proxy` (`buildProxy`). It dispatches
  `STATE_PART_CHANGED` with the path that changed, so deep mutations such
  as `user.name = 'x'` work.
- `var.x="{expr}"` is re-evaluated **on every render**, until a handler
  assigns to it.
- So a change re-renders the container's subtree, and each child
  re-evaluates its expressions. `React.memo` and shallow-compare layers keep
  that cost down.

## Design: option (a)

### Signal store (`runtime/src/reactivity/signals.ts`)

The architecture says we own the store. It is small, with no dependency:

```ts
signal(value, options?)      // .get() (tracked), .peek(), .set(v)
computed(fn, options?)       // .get(), lazy and cached; `equals` sets when a value counts as unchanged
batch(fn)                    // notifications are delivered once, after the outermost batch
watch(source, callback)      // a leaf subscriber; returns unsubscribe (what useSyncExternalStore needs)
```

- **Auto-tracking.** Every `.get()` during a computation records a
  dependency. Compile-time dependencies (step 3) are not enough on their
  own: a binding can call a code-behind function that reads other
  variables.
- **Push-pull and glitch-free:**
  - a write marks direct observers *dirty* and their observers *check*;
  - a read re-validates by comparing the version of each dependency;
  - so a diamond (`a → b, c → d`) computes `d` once, and `d` never sees a
    mix of old and new values.
- **Equality cutoff.** A computed whose new value `equals` the old one
  keeps its version, so its observers don't update.
- **Only observed computeds are linked to their sources.** An unobserved
  computed revalidates by version when read. A component's computed
  created during a render that never commits leaks nothing.
- **A write inside a computation throws:** bindings are pure.

### React integration (`runtime/src/reactivity/react.ts`)

```ts
useComputed(fn, deps, equals?)   // computed per component + useSyncExternalStore
useSignal(source)                // one signal or computed
```

- A compiled component evaluates all its bindings inside one
  `useComputed`. The result (an array or object of values) is compared
  shallowly, so the component re-renders only when one of its own values
  changes.
- The **scope object** of step 3 (`$$s`) becomes an object of getters over
  signals, created by `createScope`. Compiled binding code is unchanged.

### Option (b), for comparison

The same scenario hand-written as idiomatic React:

- the state lives in the declaring component;
- values are passed down as props;
- it is measured once naive and once with `React.memo` on every child.

## Scenario

```xml
<App var.count="{0}" var.name="{'a'}" var.double="{count * 2}">
  <Text value="{count}"/>                    <!-- reads count -->
  <Text value="{name}"/>                     <!-- independent sibling -->
  <Stack><Stack><Text value="{count + 1}"/></Stack></Stack>  <!-- deep child -->
  <Text value="{double}"/>                   <!-- derived value -->
  <Button onClick="count++; name = 'b'"/>   <!-- batch update -->
</App>
```

There is no markup compiler yet (step 5), so both versions are written by
hand in the shape the compiler would generate. The bindings themselves are
compiled by the step 3 compiler.

## Tests

- **Store conformance table:**
  - laziness and caching;
  - diamond (one evaluation, no glitch);
  - equality cutoff;
  - dynamic dependencies;
  - batch;
  - watch notifications;
  - unobserved computeds;
  - errors;
  - writes during a computation.
- **React (Testing Library):** render counts for the scenario (sibling,
  deep child, derived value, batch). Also StrictMode, unmounting
  (subscriptions released), server rendering, and a compiled step 3 binding
  driving a component.
- **Tearing:** a concurrent render that yields, with a store change in the
  middle. Every component must show the same value.
- **Comparison:** the same render-count table for (b), naive and memoized.
- **Benchmark:** 1,000 rows; update one value, then all values, under (a),
  (b) naive and (b) with memo.

## Things to watch

- `useSyncExternalStore` updates are always **synchronous**: a signal
  write cannot be a transition. Record what that costs.
- **Deep writes** (`user.name = 'x'`) need a decision in step 6. Options:
  a write through a proxy notifies the root signal, or values are updated
  immutably.

## Outcome

**Decision: option (a), signals with a subscription per component.**
Recorded in [architecture.md](architecture.md) and in `AGENTS.md`
*Decisions*. Details: [`../docs/reactivity.md`](../docs/reactivity.md).

**Render counts**, one handler each (`scenario.test.tsx`):

| Handler | (a) signals | (b) React state | (b) + `React.memo` everywhere |
|---------|-------------|-----------------|-------------------------------|
| `count++` | the 3 texts that read `count` | all 10 components | 8 of 10 |
| `name = …` | 1 text | all 10 | n/a |
| both, batched | 4 texts, once each | all 10 | n/a |

Even fully memoized, (b) re-renders the declaring component, every
container (`children` is a new element each time) and every component that
takes a handler (a new closure each time). Avoiding that would mean
generating `useCallback` and stable children everywhere: re-implementing
what signals give for free.

**Update cost**, 1,000 rows in jsdom, including React's render and commit:

| Update | (a) signals | (b) React state | (b) + memo |
|--------|-------------|-----------------|------------|
| one row | 0.15 ms | 2.3 ms | 1.2 ms |
| all rows | 2.3 ms | 2.6 ms | 2.7 ms |

When few values change, which is the common case, signals are 8–15 times
faster. When everything changes, the options are on par.

## Findings

- **Tearing:** under a concurrent render that yields, a component that
  reads external state directly shows mixed values (the control test).
  With `useSyncExternalStore` every component shows the same value.
- **Transitions:** a signal write is always a synchronous update; React
  documents that a store change cannot be a transition. If gfui needs
  transitions (for example, keeping old content while a route loads), that
  must come from React state at that boundary. Revisit with routing
  (step 21).
- **Store bug found by the tests:** when an unobserved computed gained its
  first observer it was left in CHECK. Only a CLEAN node forwards marks, so
  changes stopped propagating (diamond test). Fixed: it revalidates when
  linked.
- **The scope design of step 3 holds:** compiled bindings needed no change.
  `createScope` turns `$$s.count` into a signal read, and auto-tracking
  also covers names read inside called functions.
- **Testing Library's automatic cleanup** needs Vitest globals, which this
  repo does not enable; tests call `afterEach(cleanup)`.

## Open for later steps

- **Deep writes** (`user.name = 'x'`, step 6). Options: notify the root
  variable's signal after a member write through a proxy, or require
  immutable updates. XMLUI routes them through a `Proxy`
  (`container-state.md` § buildProxy).
- **Reactive variables that "follow their expression until assigned"**
  (step 6): a signal whose value is a computed until the first `set`.
