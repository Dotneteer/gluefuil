# User-defined components

> Subsystem reference: `<Component>` definitions, their files and
> code-behind, how they compile, and the runtime they use. Describes the code
> as it is. Design and XMLUI comparison:
> [`../plan/poc-14-user-components.md`](../plan/poc-14-user-components.md).
>
> **Last updated:** step 14.

## Writing one

```xml
<!-- components/Counter.pfui -->
<Component name="Counter" method.reset="count = 0">
  <Stack>
    <Text value="{label(count)}"/>
    <Button label="+1" onClick="count++; emitEvent('changed', count)"/>
    <Button label="Reset" onClick="$self.reset()"/>
    <Slot name="footerTemplate" count="{count}"><Text>no footer</Text></Slot>
  </Stack>
</Component>
```

```js
// components/Counter.pfui.xs (code-behind)
var count = 0;
function label(n) { return 'Counter: ' + n; }
```

```xml
<!-- Main.pfui -->
<App var.log="">
  <Counter id="c" onChanged="(n) => log += ' ' + n">
    <property name="footerTemplate"><Text>count is {$count}</Text></property>
  </Counter>
  <Button label="Reset from outside" onClick="c.reset()"/>
</App>
```

| Feature | How |
|---------|-----|
| Name | `[A-Z][A-Za-z0-9_$]*`, not a built-in's name |
| Where | `components/<Name>.pfui`: exactly one `<Component>`, the file named after it. Or inline: any number of top-level `<Component>`s in an app file, beside its one app element, in any order. |
| Properties | `$props.x`: the caller's attribute values, reactive, read-only |
| Private state | `var.x` / `<variable>` on `<Component>`, or code-behind `var`: one set per instance |
| Events | `emitEvent('name', ...args)` calls the caller's `onName` and returns a promise of its result (`undefined` without a handler). `hasEventHandler('name')`. The caller may use any event name. |
| Methods | `method.x="…"` or `<method name="x">…</method>`: handlers in the component's scope. The caller calls them through the element's `id` (`c.reset()`), the component through `$self.x()`. Both return a promise of the result. |
| Slots | `<Slot/>` renders the caller's children; `<Slot name="xTemplate"/>` renders the caller's `<property name="xTemplate">`. The Slot's children are the fallback. Other Slot attributes become context variables (`count="{count}"` gives `$count`) in the caller's content, which renders in the **caller's** scope. |
| Isolation | The body sees its own variables, functions and IDs, `$props`, `$self`, `emitEvent`, `hasEventHandler`, app globals and sandbox globals. Anything of the caller is C001. |
| Code-behind | `<file>.pfui.xs`, also for `Main.pfui` (the app root): top-level `var` (a variable) and `function` (a function in scope; synchronous unless it awaits; it may write variables) |

## Compiling (`compileModule`)

- **`analyzeModule(markup)`** (`module/analyze.ts`) returns the file's
  `kind` (`"app"` or `"component"`), its definitions
  (`UserComponentInfo`: `name`, `slots` with their context variables,
  `methods`), and every component name it references. Tools analyze
  component files first.
- **`compileModule(markup, { userComponents, codeBehind })`:**
  - `userComponents` are the other files' interfaces. The "esm" format
    needs each one's `module`, the import specifier.
  - `codeBehind` is the file's `.xs` source. Its diagnostics come back
    separately as `codeBehindDiagnostics`, with `.xs` positions.

**Generated code:**

```js
const $$v0 = { "count": { init: ($$s) => 0 }, "label": { fn: ($$s) => function label(n) { … } } };
const $$m1 = { "reset": ($$s) => ($$x) => async (...$params) => { … $$s.count = 0; … } };
const $$b2 = { "$count": ($$s) => $$s.count };
function $$U_Counter({ input: $$in }) {
  const $$c = $$useComponent($$in, $$scope, $$v0, $$m1, []);
  return $$h(…, $$h($$Slot, { name: "footerTemplate", bindings: $$b2, scope: $$c }, …fallback));
}
$$U_Counter.displayName = "Counter";
export default $$U_Counter;            // a component file; an app file exports Main
```

- **A use** compiles to
  `$$h($$BoundUser, { type: $$U_Counter, props, bindings, handlers, id, templates, lifecycle, scope })`.
  The caller's content is always passed as **templates** (compiled in the
  caller's scope, with the slot props as context variables): children as
  `$$slot` (`DEFAULT_SLOT`), each `<property>` under its name.
- **The type** is resolved differently per case:
  - inline: the hoisted `$$U_X`;
  - other files, "esm": `import $$U_X from "<module>"`;
  - other files, "function": `$$imports.components["X"]`, looked up at
    render time, so components can refer to each other in cycles.

**Rules and diagnostics:**

| Code | Meaning |
|------|---------|
| E003 | No app element and not exactly one `<Component>`; a second app element |
| E006 | `global.*` on a `<Component>` |
| E013 | An unknown slot in `<property>`, or a `$`-name (reserved) |
| E016 | A definition problem: invalid, missing or duplicate name; a built-in's name; also in a component file; nested `<Component>`; an unknown `<Component>` attribute; the file name doesn't match; an invalid method name; ("esm") a used component without `module` |
| E017 | `<Slot>` outside a component; a named slot not ending in `Template`; an invalid slot-prop name |
| E018 | Children for a component without a default `<Slot/>` |
| E019 | Code-behind: anything but top-level `var`/`function`; destructuring; a name declared twice (markup, code-behind, or an ID) |
| C001 / C014 | A caller's name inside a component; `$props` or a slot's `$`-variable outside its scope |
| C012 | Writing `$props`, `$self` or a code-behind function |

## Runtime (`runtime/src/render/user-components.ts`)

| Export | What it does |
|--------|--------------|
| `BoundUser` | A use. It gives the component `input`: `props` is a **computed** over the caller's bindings (shallow-equal), so a caller change re-renders only what reads the changed `$props` member, in one pass; `events` (`HandlerSlot.call`), `templates`, `registerApi`. Shares `useWiring` with `Bound`. |
| `useComponent(input, appScope, variables, methods, ids)` | Creates the instance scope once: app scope → `$props`, `$self`, `emitEvent`, `hasEventHandler` (and `SLOTS`) → IDs → variables and code-behind functions (`createVariableScope`). Methods run through one `HandlerSlot` each (disposed on unmount); the API is published through `registerApi`. |
| `Slot` | Evaluates the slot props in the component's scope (`useComputed`), finds the caller's renderer through the scope chain (`SLOTS`, so it works inside the component's templates), and renders it with them as context, or else the fallback |
| `HandlerSlot.call(args)` | Like `invoke`, but returns a promise of the result: `undefined` when dropped or cancelled; a handler error rejects it (not reported) |

## Delivery

- **Vite plugin:** `componentsDir` (default `src/components`).
  - Every transform scans the folder (analysis cached by modification
    time), passes the other components with relative `module`
    specifiers, and `addWatchFile`s them, so an interface change recompiles
    the users.
  - Code-behind is read from `<file>.xs` (watched). Its errors fail the
    transform at the `.xs` file.
  - A component or code-behind file appearing or disappearing recompiles
    every `.pfui` module and reloads.
- **Standalone:** see [standalone.md](standalone.md). It fetches
  `components/<Name>.pfui` for each referenced unknown name,
  transitively, with code-behind.

## Files

| File | Contents |
|------|----------|
| `compiler/src/module/analyze.ts` | `analyzeModule`, `analyzeDocument`, `UserComponentInfo`, `DEFAULT_SLOT`, `COMPONENT_NAME` |
| `compiler/src/module/compile-module.ts` | Top-level forms, `componentDefinition`, `scopeEntries` (markup and code-behind names), `slot`, user-component uses |
| `compiler/src/codegen/compile.ts` | `compileFunction` (code-behind functions) |
| `runtime/src/render/user-components.ts` | `BoundUser`, `useComponent`, `Slot`, `SLOTS`, `DEFAULT_SLOT`, `ComponentInput` |
| `runtime/src/render/elements.ts` | `useWiring` (shared with `Bound`), `createVariableScope` (with code-behind `fn` entries) |
| `vite-plugin/src/components.ts` | `ComponentFolder`, `importSpecifier`, `readCodeBehind` |
| `test-apps/hello/src/components/` | The XMLUI examples (`IncButton`, `Counter` with code-behind, `StatusList`, `Panel`); `NameValue` inline in `Main.pfui`; `Main.pfui.xs` |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/user-components.test.ts` | Analysis; file forms and their errors; other files' components (esm, function, missing module); using a component (events, slots, IDs, lifecycle) and its errors; inside a component (isolation, read-only names, slots, methods) and the generated code; code-behind (app and component, functions, every error) |
| `components/tests/user-components.test.tsx` | One test per feature, compiled and rendered in jsdom under StrictMode: `$props` (and re-rendering only the readers), private state per instance, `emitEvent` with arguments and a result, `hasEventHandler`, methods through `id` and `$self`, the default and named slots with slot props and fallbacks, slot content in the caller's scope, components using components and recursion, IDs per instance, code-behind |
| `runtime/tests/render/handlers.test.ts` | `HandlerSlot.call` |
| `vite-plugin/tests/components.test.ts` | Discovery, re-analysis on change, import specifiers, imports and watching, code-behind and its errors, `componentsDir` |
| `standalone/tests/loader.test.tsx` | Fetching components and code-behind, transitively; per-file cache; a missing file (E001); errors naming their file; watching component files, code-behind, and a newly created component |
| `e2e/user-components.spec.ts` (projects `hello-dev`, `hello-build`) | The XMLUI examples in a real browser, in dev and in the prerendered build |
| `e2e/standalone.spec.ts` | A component file with code-behind in standalone mode, cached; editing it updates the open app |
