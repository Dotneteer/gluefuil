# Step 6: Reactive variables and synchronous handlers

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Add state and interaction:

- **Declarations:** `var.x`, `<variable>`, `global.x` and `<global>`, with
  "follows its expression until assigned" semantics;
- **Handlers:** `on*` attributes and `<event>`, compiled to plain
  JavaScript that writes variables, including deep writes and array
  mutations.

Async handlers are step 7. Component ids and context variables are step 8.

## Background (XMLUI)

Sources: `website/content/docs/pages/markup.md` § Variables, § Global
Variables; `pages/context-variables.md` § Event handlers;
`.ai/xmlui/container-state.md`;
`xmlui/src/components-core/rendering/reducer.ts`; `xmlui/package.json`.

- **`var.x="{expr}"` or `<variable name="x" value="{expr}"/>`:** visible to
  the declaring element (its own attributes too) and its descendants. An
  inner declaration shadows an outer one.
  - A var **follows** its expression until a handler assigns to it. After
    that it holds the assigned value: the `source`/`mirror` example.
  - Variables on one element may refer to each other (`var.source="{0}"
    var.mirror="{source}"`); XMLUI resolves them in two passes.
- **`global.x` / `<global>`:** only on the root element of `Main` (or in
  `Globals.xs`, later); visible everywhere, including in user-defined
  components (step 14).
- **Handlers:**
  - `onClick="count++"` or `<event name="click">…</event>` contain
    statements;
  - the arguments are `$param` (the first) and `$params` (all);
  - a lone arrow is the handler itself (`onItemCreated="item => …"`).
- **Deep writes and in-place mutations work in handlers:**
  `settings.itemSize = value` (`howto/share-a-modaldialog-across-components.md`)
  and `newItems.push(item)` (`reference/components/AutoComplete.md`).
  - XMLUI wraps state in a `Proxy` (`buildProxy`) and applies each change
    with Immer.
  - Immer 9.0.16 freezes the state it produces (`autoFreeze` is on by
    default), so mutating state outside the proxy throws.
- **Name rules:** a variable name starts with a letter or `_`, followed by
  letters, digits and `_`. `$` names are reserved for context variables.

## Design

### Runtime: variables and scopes

- **`variable(init)`:** a signal that **follows** `init` (a computed) until
  `set`, then holds the assigned value. Values are **deep-frozen** (plain
  objects and arrays only), as Immer does in XMLUI.
- **Scope objects get setters.** `createScope(entries, parent)` builds a
  scope object:
  - a `{ variable }` entry gets a getter and a **setter**;
  - the prototype is the parent scope, so names resolve by shadowing and a
    write reaches the declaring scope's setter.

  So handler code writes a variable as plain JavaScript (`$$s.count++`,
  `$$s.count += 1`, `[$$s.a, $$s.b] = [$$s.b, $$s.a]`), with exact
  JavaScript semantics.
- **Path writes** go through new `$$r` helpers that copy along the path
  (structural sharing) and assign the new root through the setter:
  - `setIn(scope, name, path, value)`;
  - `deleteIn(scope, name, path)`;
  - `updateIn(scope, name, path, delta, prefix)` for `++`/`--`;
  - `mutate(scope, name, path, method, args)` for the array mutators
    `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`,
    `fill`, `copyWithin`.
- **`useScope(parent, definitions)`:** a compiled container creates its
  variables once per instance.

### Compiler: declarations

- **Declaring an element makes it a container.** An element declaring
  variables (`var.*`, `global.*`, or `<variable>`/`<global>` children)
  compiles to its own component (`$$K0`), which calls `useScope` and
  renders the element with the container's scope. Nested containers
  receive the parent scope as a prop.
- **Initializers are bindings** against the container's own scope, so
  variables can refer to siblings and outer variables. Evaluation is lazy,
  so declaration order does not matter.
- **A cycle among one container's variables is a compile error (E005).**
  The check uses the dependencies of step 3. A cycle through called
  functions still throws `ReactivityError` at runtime.

### Compiler: handlers

`compileHandler(program, { scope, variables })` returns
`($$s) => handlerFunction`:

| Handler source | Compiles to |
|----------------|-------------|
| A lone arrow or function expression | The function itself |
| A lone reference (`save`, `api.save`) | `(...$params) => save?.(...$params)` |
| Statements | `(...$params) => { const $param = $params[0]; … }` |

**Writes in handler mode:**

- **Variables:**
  - a variable as the target: `$$s.x` (native, through the setter);
  - a member path rooted at a variable: the `$$r` path helpers;
  - compound operators read the current value first;
  - logical assignments short-circuit as in JavaScript.
- **Other names:**
  - writing a scope name that is not a variable is C012;
  - destructuring into a variable's member is C013 (not supported).
- **Batching:** `Bound` wraps each handler call in `batch()`, so the
  components re-render once per handler.
- **No raw events:** `Button` calls `onClick()` without the DOM event,
  following the sandbox's "no raw platform objects" invariant (step 3).

### Component events

Metadata gains `events` (`Button: { click }`). `onClick` maps to the event
`click`; an unknown event is E004. The React prop name is the attribute
name (`onClick`).

### Diagnostics

| Code | Meaning |
|------|---------|
| E004 | Unknown event |
| E005 | Reactive cycle between variables |
| E006 | A global must be declared on the root element |
| E007 | Duplicate variable declaration on one element |
| E008 | Invalid variable name, or `<variable>`/`<global>`/`<event>` without a valid `name` |
| C012 | A handler can only change variables |
| C013 | Destructuring into a variable's member is not supported |

### Kept strict for now

Bindings still reject every write (C006), even inside a nested arrow that
the binding does not call (`var.inc="{() => count++}"`). XMLUI allows it.
Relax this when callback props arrive (step 15). The signal store already
throws if a binding really writes during evaluation.

## Tests

- **Runtime:**
  - variable semantics (follow, assign, freeze);
  - scopes (shadowing, setters through the prototype chain);
  - the path helpers (structural sharing, freezing, errors).
- **Compiler:**
  - handler shapes and writes;
  - container emission;
  - E004–E008, C012, C013.
- **Components (jsdom):** markup scenarios with clicks:
  - the counter;
  - the `source`/`mirror` example from `markup.md`;
  - shadowing, `<variable>`, `<global>` and `<event>`;
  - deep writes and `push`;
  - `$param`;
  - mutation through an alias throws.
- **E2E:** counter and mirror in the hello app.

## Outcome

Everything in the design is implemented and tested: 34 handler-codegen
cases, 25 module cases, 18 runtime cases, 12 jsdom click scenarios and 2
E2E tests. Details: [`../docs/codegen.md`](../docs/codegen.md) § Handlers,
[`../docs/modules.md`](../docs/modules.md),
[`../docs/reactivity.md`](../docs/reactivity.md) § Variables.

## Findings

- **Scope setters made writes plain JavaScript.** Because the scope object
  has a setter for each variable, `count++`, `x ??= y` and destructuring
  into variables need no special code generation. They keep JavaScript's
  exact semantics, short-circuits included. Only paths *inside* a value
  need helpers.
- **Copy-on-write plus freezing matches XMLUI's behavior.** XMLUI applies
  changes with Immer, which freezes its output. pfui copies along the path
  at compile-time-known write sites, without a runtime proxy. The cost is
  that a mutation through an alias (`const l = items; l.push(x)`) throws a
  `TypeError`. XMLUI would track it through its proxy. It is loud rather
  than silent, and it is tested.
- **`watch` needed a way to see through wrappers:** a variable wraps
  computeds, so store nodes are now exposed under `SIGNAL_NODE`.
- **Self-reference under shadowing:** `<Stack var.t="{t + 1}">` inside a
  scope with an outer `t` is a cycle (E005), because the inner `t` shadows
  in its own initializer. XMLUI's two-pass resolution may read the outer
  `t` here. This is recorded as a possible divergence, to be checked
  against XMLUI if it matters.
- **No DOM event reaches handlers:** `Button` calls `onClick()` without
  arguments. XMLUI documents `click(event: MouseEvent)`. If handlers need
  event data, components will pass a curated payload (as `$param`), never
  the raw event.

## Open for later steps

- Async handlers and implicit `await` (step 7). Handlers run in one `batch`
  today, so a write after an `await` will need its own batch.
- Error handling for handlers: today an exception propagates to `window`
  (React's event-handler behavior). The structured exception model is a
  later Managed React topic.
- Map and Set mutators (`set`, `add`, `delete`) on variable values are not
  intercepted. Those values are not frozen either.
- Writes inside a function defined in a binding (`var.inc="{() => count++}"`)
  are still C006.
