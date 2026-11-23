# Step 14: User-defined components

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

`<Component name="X">` compiles to one React component, used from markup
like a built-in. Covers:

- `$props`;
- private variables;
- `emitEvent` and `hasEventHandler`;
- methods and `$self`;
- the default and named slots, with slot props flowing back as `$item`;
- scope isolation;
- inline `<Component>` in `Main.pfui`, and component files;
- code-behind.

## Background (XMLUI)

Sources:
- `website/content/docs/pages/user-defined-components.md`;
- `pages/scripting.md` § Code-Behind;
- `.ai/xmlui/user-defined-components.md` (internals:
  `CompoundComponent.tsx`, `slotRenderer`, `SlotItem.tsx`).

- **Name:** `[A-Z][A-Za-z0-9_$]*`. A file `components/X.xmlui` holds
  exactly one `<Component name="X">`.
- **`Main.xmlui`** may hold any number of top-level `<Component>`s plus
  one app element, in any order. A file-based component wins over an
  inline one with the same name.
- **`$props`:** the resolved properties. Mutating it doesn't propagate.
- **`emitEvent(name, ...args)`** calls the parent's `on<Name>` handler and
  returns its result. `hasEventHandler(name)` tells whether one exists.
- **Methods:** `method.x="…"` on `<Component>`, or `<method name="x">`.
  They are exposed to the parent through the component's `id`, and inside
  as `$self.x()`.
- **Slots:**
  - `<Slot/>` renders the parent's children; `<Slot name="xTemplate"/>`
    renders the parent's `<property name="xTemplate">`. Named slots must
    end in `Template`.
  - The Slot's children are the fallback.
  - Other Slot attributes become `$`-context variables in the parent's
    content.
  - Slot content renders in the **parent's** scope.
- **Scope isolation:** the component body sees its own names, not the
  parent's. XMLUI forwards `$item`, `$itemIndex`, … unless told otherwise
  (`receivesContextVars`).
- **Code-behind** `X.xmlui.xs`: only top-level `var` and `function`.
  - `var` declares reactive component variables;
  - functions are callable from markup;
  - code-behind wins over inline names.

## Design

### Files and discovery

- **The components folder** sits next to the entry file:
  `src/components/*.pfui` in a Vite app, `components/*.pfui` next to
  `Main.pfui` in standalone mode.
- **The file name must match** the component name (E-diagnostic).
- **Code-behind** is the file's name plus `.xs`: `Main.pfui.xs`,
  `components/X.pfui.xs`. It applies to the file's app root, or to its
  component.
- **The compiler needs every user component's interface before
  compiling** a file that uses it: its existence, its slots and their
  context variables. **`analyzeModule(markup)`** returns the
  `<Component>` definitions (name, slots with slot-prop names, methods)
  and the component names the file references.
  - **The Vite plugin** analyzes all files in the components folder (by
    content hash, cached) and passes the result to `compileModule` as
    `userComponents`. It also calls `addWatchFile`, so editing a component
    re-compiles the files that use it.
  - **Standalone** fetches `components/<Name>.pfui` for each referenced
    name that isn't built-in or inline, recursively, then compiles every
    file with the full table. A 404 means the name really is unknown
    (E001).

### What compiles to what

```js
// <Component name="Counter" method.reset="count = 0"> <variable name="count" value="{0}"/> … </Component>
const $$v0 = { "count": { init: ($$s) => 0 } };
const $$m1 = { "reset": ($$s) => ($$x) => async (...$params) => { … $$s.count = 0; … } };
function Counter($$in) {
  const $$c = $$useComponent($$in, $$scope, $$v0, $$m1, ["box"]);   // ids of the body
  return $$h(…, { scope: $$c });
}
```

- **`useComponent(input, appScope, variables, methods, ids)`** builds the
  instance's scope chain once:
  1. the app scope;
  2. the component scope: `$props`, `$self`, `emitEvent`,
     `hasEventHandler`, plus the slot renderers under a symbol;
  3. the ID scope;
  4. the variables, including code-behind variables and functions.

  It also publishes `$self` (the methods) through `input.registerApi`.
- **A user component used in markup** compiles to `BoundUser`:
  `$$h($$BoundUser, { type, props, bindings, handlers, …, templates, scope })`.
  - It doesn't evaluate the bindings in the parent. It creates a
    **computed** over them, `$props`, and passes it as
    `input.props`. A parent change re-renders only the component's
    elements that read `$props.x`, in one pass, with no effect hop.
  - Events, templates, `id`, `lifecycle`, policies and timeouts work as
    in `Bound` (shared code).
- **`emitEvent` returns the parent handler's result:** `HandlerSlot.call`
  resolves with it. It resolves to `undefined` when the policy drops the
  call or it is cancelled.
- **Methods** are compiled as handlers in the variable scope (writes
  allowed, implicit await). Each runs through its own `HandlerSlot`, so it
  batches and can be cancelled on unmount. `$self.x()` and `id.x()` both
  return a promise of the result.
- **`<Slot name? prop="{…}">fallback</Slot>`** (only inside a component
  body) compiles to `$$h($$Slot, { name, bindings, scope }, …fallback)`.
  - The slot props are bindings in the component's scope, named
    `$prop`.
  - `Slot` finds the parent's renderer through the scope chain, so a Slot
    inside a template, such as `Items` in the component, works. It
    renders the renderer with the props as context, or the fallback when
    the parent gave no content.
- **The parent's slot content** is compiled as templates, in the parent's
  scope, with the slot props as context variables:
  - `<property name="xTemplate">` gives template `xTemplate`;
  - plain children give the default slot, template `$$slot`.
- **Names visible in a component body:** locals, its variables, its
  functions, its IDs, `$props`, `$self`, `emitEvent`,
  `hasEventHandler`, then app globals and sandbox globals.
  - A parent's variable is therefore C001, a compile error (isolation).
  - `$props` and `$self` aren't writable (C012).

### Code-behind (`compileModule({ codeBehind })`)

- Top level: `var x = expr;` (a variable, initialized like
  `var.x="{expr}"`) and `function f(…) {…}` (a function in scope). It is
  compiled like a nested function in a handler: synchronous unless it
  contains `await`, and it may write variables. A function that writes
  is called from a binding fails at runtime (writes during a computation
  are refused). Anything else at the top level is an error.
- **Its diagnostics** use offsets into the `.xs` file and are returned
  separately (`codeBehindDiagnostics`). Its code has no source-map
  markers for now.

### Deliberate divergences from XMLUI

- **No implicit context forwarding** (`$item`, …) into components, and
  no `receivesContextVars` yet: isolation is complete.
- **A name declared both inline and in code-behind is an error**, not
  "code-behind wins".
- **An inline and a file component with the same name is an error** (E):
  two definitions are ambiguous.
- **Children given to a component without a default `<Slot/>`** are an
  error, not ignored.
- **Not in this step:**
  - global variables in components (with `Globals.xs`);
  - `<script>` blocks (E002 remains);
  - `updateState`.

## Tests

- **Unit (compiler):** analysis; the file forms (an app with inline
  components, a component file, the errors); each feature's generated
  code and diagnostics: isolation, `$props` read-only, slots, slot
  props, methods, code-behind.
- **Unit (components, jsdom), one test per feature:**
  - `$props` (and its reactivity, re-rendering only the readers);
  - private variables per instance;
  - `emitEvent` with arguments and a result, and `hasEventHandler`;
  - methods through `id` and `$self`;
  - the default slot and fallback;
  - named slots with props (`$item`);
  - slot content in the parent's scope;
  - isolation;
  - code-behind;
  - recursion and a component using a component.
- **Unit (plugin, standalone):** discovery, code-behind, the
  file-name rule, 404 for unknown names.
- **E2E:** the `user-defined-components.md` examples in the hello app
  (component files, an inline component, code-behind), built and in dev,
  prerendered. Standalone with a component file and code-behind.

## Outcome

Implemented as designed. Details: [`../docs/user-components.md`](../docs/user-components.md).

- **The XMLUI examples run** in the hello app (four component files, one
  with code-behind; an inline component; `Main.pfui.xs`), both on the dev
  server and in the prerendered production build. Takeover still changes
  no DOM node.
- **Standalone mode** fetches, compiles and caches a component file with
  code-behind. Editing it updates the open app.
- `npm run check`: 1,732 unit tests in 57 files and 47 E2E tests.

## Findings

- **`$props` as a computed over the caller's bindings** (not values passed
  through React props plus an effect) gives one render pass. A caller
  change re-renders only the elements inside that read the changed member
  (tested: the component body doesn't re-render).
- **Using a component needs its interface at compile time:** its slots and
  their context variables decide how the caller's content compiles.
  - Hence `analyzeModule`, a cheap pass before compiling.
  - In standalone mode the loader follows references transitively.
  - The cache hash includes the interfaces a file was compiled against,
    because content hashing alone would serve stale code after a slot
    changes elsewhere.
- **Render-time lookup in the "function" format**
  (`$$imports.components["X"]`) makes recursion and mutual references
  work without ordering the loads. In ESM, live bindings do the same.
- **`emitEvent` returning results needed `HandlerSlot.call`.** A queued
  call dropped on unmount must still settle, or the emitting handler would
  hang forever. Tested.
- **Code-behind fit the existing compiler:**
  - functions compile like nested handler functions (synchronous unless
    they await, writes allowed);
  - variables are ordinary variables;
  - only the separate diagnostics, positioned in the `.xs` source, are new.
- **Isolation came almost for free** from compile-time name resolution: a
  component body is compiled with fresh frames, so a caller's name is C001.

## Open for later steps

- **Global variables** (`global.*`, `Globals.xs`) inside components.
- **`<script>` blocks** (E002 remains; code-behind covers the use).
- **Context forwarding** (`receivesContextVars`) for wrapper components
  such as table columns.
- **Declared props and events** for user components, with compile-time
  checks of `$props.x`, events and `id.method()`: step 15 (contracts).
- **Source maps for code-behind**, which has no markers yet.
- **IDs inside templates** (E014) remain.
