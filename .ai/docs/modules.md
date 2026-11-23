# Compiled modules

> Subsystem reference for `packages/compiler/src/module/`, the runtime's
> `src/render/` and the built-in components. Describes the code as it is.
> Design rationale and XMLUI comparison:
> [`../plan/poc-05-first-app.md`](../plan/poc-05-first-app.md).
>
> **Last updated:** step 8 (component IDs).

## Role

`compileModule` turns a whole `.pfui` document into **one JavaScript module**
whose default export is the root React component. The pipeline is:

```
.pfui text ──parseMarkup──► elements ──per attribute/text: parseInterpolation + compileInterpolation──►
  module code ──(esm: bundler | function: loadModule)──► React component ──► DOM
```

## API

**Compiler** (`@patchfuil/compiler`):

```ts
compileModule(markup, {
  format?: "esm" | "function",          // default "esm"
  components?: Record<string, ComponentMetadata>,  // default: built-in metadata
  runtimeModule?: string,               // default "@patchfuil/runtime"
  componentsModule?: string,            // default "@patchfuil/components"
}): { code: string; diagnostics: Diagnostic[] }
```

Diagnostics include everything found while compiling, sorted by position:
markup (M), script syntax (S), bindings (C) and the module itself (E). All
use file offsets.

**Runtime** (`@patchfuil/runtime`):

| Export | What it does |
|--------|--------------|
| `Bound` | Renders `type` with constant `props`, the current values of `bindings` (evaluated against `scope` in one `useComputed`), and `handlers`: one `HandlerSlot` per handler, with its `policies`/`timeouts`, disposed on unmount (see [async-handlers.md](async-handlers.md)). Re-renders only when a value changes. |
| `createAppScope()` | The root scope: app globals |
| `useScope(parent, definitions)` | A container's scope: creates its variables (`{ init }` binding or `{ value }` constant) once per instance |
| `TextNode` | Text content with bindings: `null`/`undefined` render nothing, other values as text |
| `loadModule(code, { components })` | Instantiates the `"function"` format with `new Function`, passing the runtime itself and `components` |
| `assertBindingValue` | The shared check: a promise as a binding value throws a `BindingError` |
| `createElement`, `Fragment` | Re-exported from React; compiled code never imports React itself |

**Components** (`@patchfuil/components`):

| Component | Props | Renders |
|-----------|-------|---------|
| `App` | | `<div class="pfui-App">` |
| `Text` | `value` | `<span class="pfui-Text">`, showing `value` or the children |
| `Button` | `label`; event `click` | `<button type="button" class="pfui-Button">`, showing `label` or the children. `onClick` is called **without arguments** (no DOM event reaches script). |
| `Stack` | `orientation` (`"horizontal"` or vertical), `gap` | a flex `<div class="pfui-Stack">` |
| `TextBox` | `initialValue`, `placeholder`; event `didChange`; API `value`, `setValue`, `focus` | `<input class="pfui-TextBox">` ([scoping.md](scoping.md)) |

`componentMetadata` (in the React-free `./metadata` entry) lists them as a
`ComponentMetadata` (`description`, `props`, `events`). The compiler resolves element
names against it.

## Generated code

```js
import { createElement as $$h, Bound as $$Bound, TextNode as $$TextNode, createScope as $$createScope, scriptGlobals as $$g, scriptRuntime as $$r } from "@patchfuil/runtime";
import { App as $$C_App, Text as $$C_Text } from "@patchfuil/components";
const $$scope = $$createScope({});
const $$b0 = { "value": ($$s) => 1 + 2 };
function Main() {
  return $$h($$C_App, null, $$h($$Bound, { type: $$C_Text, props: null, bindings: $$b0, scope: $$scope }));
}
export default Main;
```

- **The `"function"` format** replaces the imports with
  `const { … } = $$imports.runtime;` and `… = $$imports.components;`, and
  ends with `return Main;`.
- **Generated names start with `$$`**, which step 3 reserves, so they can't
  collide with names in the source.
- **Bindings read the sandbox objects through imports**, so the `"esm"`
  format needs no `eval`.
- **Static parts stay static:**
  - an element without bindings is a plain `$$h(component, props, …children)`;
  - text without `{…}` is a string child;
  - each element with bindings gets **one hoisted bindings object**
    (stable across renders) and a `Bound` wrapper.
- **The root scope** is the app scope (`$$createAppScope()`): the app
  globals, `delay` for now.
- **Containers.** An element that declares variables compiles to its own
  component:

  ```js
  const $$v0 = { "count": { init: ($$s) => 0 }, "title": { value: "Hello" } };
  const $$e1 = { "onClick": ($$s) => (...$params) => { const $param = $params[0]; $$s.count++; } };
  function $$K2({ $$p }) {
    const $$c = $$useScope($$p, $$v0);
    return $$h($$C_App, null, $$h($$Bound, { type: $$C_Button, props: null, bindings: $$empty, handlers: $$e1, scope: $$c }));
  }
  ```

  - Elements inside a container use `scope: $$c`.
  - A nested container gets `{ $$p: $$c }`.
  - `$$empty` is a shared frozen `{}` for elements that have handlers but
    no bindings.

## Compilation rules

| Markup | Compiles to |
|--------|-------------|
| One root element | `Main`'s return value; anything else at the top level is E003 (comments and whitespace are fine) |
| `<Name …>` with `Name` in the metadata | `$$C_Name`. A namespaced or unknown name is E001; a lowercase name (a helper tag) is E002. |
| `attr="text"` | A constant string prop. Entities are decoded and `\{` is a literal brace. |
| `attr="…{expr}…"` | A binding (step 3 interpolation rules) |
| `attr` with no value | The string `"true"` (as XMLUI) |
| `var.x="…"`, `<variable name="x" value="…"/>` | A variable of the element (which becomes a container). Its value is interpolated: constant or binding. A key-only `var.x` is `"true"`; `<variable>` without `value` is `undefined`. |
| `global.x`, `<global>` | The same, allowed only on the root element (E006). Global visibility in user-defined components is step 14. |
| `onClick="…"` | A handler (`compileHandler`, statements, async: see [async-handlers.md](async-handlers.md)). The event must be in the component's metadata `events` (E004). |
| `handlerPolicy="…"`, `handlerPolicy:onClick="…"`, `handlerTimeoutMs`, `handlerTimeoutMs:onClick` | `policies: { onClick: "queue" }`, `timeouts: { onClick: 500 }` on the `Bound` element. The per-handler form wins. Constants only; unknown policy or non-numeric timeout: E009. |
| `<event name="click">…</event>` | The same. Text or CDATA content, not whitespace-collapsed; components inside are E002. |
| `id="x"` | A file-scoped component ID ([scoping.md](scoping.md)): `Main` creates a file scope (`$$useFileScope`), and the element is a `Bound` with `id: "x"`, so the component receives `registerApi` |
| `method.*`, `event.*`, `when` | E002 (steps 10, 14) |
| Whitespace-only text | Dropped (trivia) |
| Other text | Interpolated. Whitespace runs in literal parts collapse to one space (U+00A0 is kept); expressions are not collapsed. With expressions, it becomes a `Bound` `TextNode`. |
| CDATA | Literal text, without interpolation or collapsing |
| `<script>` | E002 (step 6) |
| Comments | Dropped |

## Diagnostics

| Code | Meaning |
|------|---------|
| E001 | Unknown component |
| E002 | Not supported yet |
| E003 | Not exactly one root element, or content outside it |
| E004 | Unknown event |
| E005 | Reactive cycle between one container's variables (from the bindings' dependencies; shadowing applies to a variable's own initializer, so `var.t="{t + 1}"` is a cycle) |
| E006 | A global declared below the root element |
| E007 | A variable declared twice on one element |
| E008 | Invalid variable name; `<variable>`/`<global>`/`<event>` without a constant `name` |
| E009 | Invalid `handlerPolicy` / `handlerTimeoutMs` |
| E010 | Duplicate `id` in the file |
| E011 | Invalid `id` |
| E012 | A variable named like a component ID |

## Build-time integration (fixture only)

`test-apps/hello/vite.config.ts` contains a minimal Vite plugin:

- it compiles `.pfui` files with `compileModule` (format `"esm"`);
- it fails the transform with `file:line:col` messages on errors.

The real plugin arrives in step 12. The dev server needs Vite's
`--configLoader runner`: the default config loader treats the workspace
packages as external, and Node cannot load their TypeScript source
(extensionless imports).

## Files

| File | Contents |
|------|----------|
| `compiler/src/module/compile-module.ts` | `compileModule` and the `ModuleCompiler` class |
| `compiler/src/module/diagnostics.ts` | `ModuleDiagnostics` |
| `runtime/src/render/elements.ts` | `Bound`, `TextNode`, `BindingFunction` |
| `runtime/src/render/module.ts` | `loadModule` |
| `components/src/basic.tsx` | `App`, `Text`, `Button`, `Stack` |
| `components/src/metadata.ts` | `componentMetadata`, `ComponentMetadata` |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/variables-handlers.test.ts` | Containers, `<variable>`/`<global>`, nesting, handlers and `<event>`, E004–E008, handler and binding diagnostics in markup |
| `compiler/tests/module/compile-module.test.ts` | Module shape (both formats); elements, attributes, constants and bindings; text and whitespace rules; every E code; binding and syntax diagnostics in file positions; extra metadata |
| `runtime/tests/render/elements.test.tsx` | `Bound` (props, re-rendering only on change, children, the promise check); `TextNode`; `loadModule` |
| `components/tests/async-handlers.test.tsx` | Async handlers from markup (see [async-handlers.md](async-handlers.md#tests)) |
| `components/tests/variables-handlers.test.tsx` | Clicks in jsdom: counter, source/mirror, order independence, shadowing, `<variable>`/`<global>`/`<event>`, deep writes, `push`, paths, alias mutation throws, lone arrow and `$param`, batching, per-instance state |
| `components/tests/first-app.test.tsx` | Markup → `compileModule` → `loadModule` → DOM, for the first app and a table of constructs |
| `e2e/async-handlers.spec.ts` | `test-apps/hello`: a slow handler, responsiveness, double-click under each policy |
| `e2e/variables.spec.ts` | `test-apps/hello`: counter and source/mirror with real clicks in Chromium |
| `e2e/first-app.spec.ts` | `test-apps/hello`: `Main.pfui` compiled by the Vite plugin renders in Chromium without errors, with a horizontal `Stack` laid out in a row |
