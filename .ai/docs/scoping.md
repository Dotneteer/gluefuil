# Scoping and component IDs

> Subsystem reference: how names resolve, at compile time and at runtime,
> and how component IDs expose APIs. Describes the code as it is. Design
> and XMLUI comparison: [`../plan/poc-08-scoping-ids.md`](../plan/poc-08-scoping-ids.md).
>
> **Last updated:** step 21B (globals in user components).

## Name resolution (compile time)

A name in a binding or handler resolves to the first match:

| # | Kind | Declared by | Writable in handlers |
|---|------|-------------|----------------------|
| 1 | Local | Parameters, `let`/`const`, functions, catch and `for` heads; handler locals `$param`, `$params` (not for events without arguments for statements: `EventMetadata.args`, step 27), `$cancel` | Yes (plain JavaScript) |
| 2 | Variable | `var.x` / `<variable>` / `global.x` / `<global>` on the element or an ancestor; the innermost declaration wins | Yes (through scope setters and path helpers) |
| 2a | Context variable | A template the code is inside (`$item`, `$itemIndex`, …: from the component's metadata). They start with `$`, which variable names can't, so the two never collide. | No (C012) |
| 3 | Component ID | `id="x"` **anywhere in the file** | No (C012); use API methods |
| 3b | Global (in a `<Component>` body only) | `global.*`/`<global>` on the app's root, `Globals.xs` ([below](#globals)) | Yes, unless a name of the component shadows it |
| 4 | App global | The runtime (`delay`) | No (C012) |
| 5 | Sandbox global | `Math`, `JSON`, … ([codegen.md](codegen.md)) | No (C010) |

**Inside a `<Component>` body** the same order applies to the component's own
names only:
- code-behind functions resolve like variables, but are read-only (C012);
- `$props`, `$self`, `emitEvent` and `hasEventHandler` come before app globals
  and are read-only.

The caller's names are not visible (C001): isolation. The app's globals are
the exception: rank 3b, below everything the component declares. Slot content
passed by a caller is compiled in the caller's scope
([user-components.md](user-components.md)).

- **Anything else is a compile error:**
  - a known platform global: C002;
  - a `$`-name: C014 ("context variable … is not available here"); context
    variables exist only inside the template that provides them;
  - otherwise: C001.
- **Variables flow downward:** they are visible to the declaring element
  (its own attributes too) and its descendants, not to its siblings.
- **IDs are file-scoped and order-independent:** the module compiler
  collects them before compiling (`collectIds`).
- **An ID inside a template** (an `Items` row, a `<property>` template, a
  component's slot content) **belongs to the template instance.**
  - It is visible to code inside that instance, including nested
    templates.
  - It is not visible outside (C001): there may be many instances, and each
    `Items` row has its own `box`.
  - The file's IDs stay visible inside.
  - The template function creates the instance's ID scope
    (`const $$i = $$useFileScope($$c, ["box"])`): it runs as part of its
    `TemplateInstance`'s render, so the hook is safe.
  - XMLUI's docs don't specify IDs declared in templates; E014 (an error
    before) is retired.
- **Conflicts:**
  - a variable named like an ID is E012;
  - a duplicate ID is E010, and so is a template ID that reuses an ID
    visible from an enclosing scope;
  - an invalid ID (not a constant identifier, or `$`-prefixed) is E011.

## Scope objects (runtime)

The scope objects form a prototype chain that mirrors compile-time
resolution:

```
app scope (createAppScope: delay)
  └─ file scope (useFileScope: one getter per ID)        — only when the file has IDs
       └─ container scope (useScope: variables, getters + setters)
            └─ nested container scope …
                 └─ template instance scope (TemplateInstance: $item, … as signals)
                      └─ template ID scope (useFileScope in the template function) — only when the template has IDs
                           └─ …
```

- **Every scope object is frozen.**
- **A child sees its ancestors' names**, and inner names shadow outer ones.
- **The file scope** holds a signal per ID (`API_REFS`, a symbol-keyed map
  inherited by nested scopes). Each getter reads its signal, tracked: a
  binding re-evaluates when the component registers or unregisters its
  API, and when a value read through the API (a getter over the
  component's signals) changes.

## Globals

Step 21B ([../plan/poc-21b-globals.md](../plan/poc-21b-globals.md)). XMLUI:
`website/content/docs/pages/scoping.md` § Global variables.

```xml
<App global.likes="{0}">…<LikeButton/></App>     <!-- Main.gui -->
```
```js
// Globals.xs, beside Main.gui
var visitor = 'guest';
function like() { likes++; }
```
```xml
<Component name="LikeButton">                      <!-- components/LikeButton.gui -->
  <Button label="Like" onClick="like(); visitor = 'member'"/>
</Component>
```

- **Declared** only on the app's root (`global.*`, `<global>`; E006
  elsewhere) or as the top-level `var`/`function` declarations of
  `Globals.xs`. Its functions are read-only (C012), as code-behind functions.
- **Compile time:** every file knows the names.
  - The app file collects its own: `analyzeModule(...).globals`, or
    `rootGlobalNames` and `globalsCodeNames`.
  - Every other file gets them through `compileModule`'s `globals` option:
    the Vite plugin reads its `entry` (and the `Globals.xs` beside it), the
    standalone loader its entry file.
  - Inside a `<Component>` body they are rank 3b: the component's own
    variables, code-behind, context variables and IDs shadow them. A global
    shadowed by a read-only name (an ID, a function, `$props`, …) is not
    writable there (C012).
  - The app file's own body sees its globals as ordinary root variables.
    Other app files (the playground's layout pages) don't see the entry's
    globals outside their inline components.
- **The global container:** the root's globals and `Globals.xs` compile to
  a container around the root's own variables, which renders
  `GlobalScope` with its scope:

  ```
  app scope ─ file scope (Main's IDs) ─ global container (globals) ─ root container (var.*, Main.gui.xs) ─ …
                                              │ GlobalScope (React context)
                                              └─ every user component's scope (useComponent) ─ …
  ```

  - A global's initializer sees the other globals and Main's IDs, not the
    root's `var.*` (C001; accepted divergence). `Globals.xs` likewise.
  - The root's `var.*` and `Main.gui.xs` see the globals.
- **Runtime:** `useComponent` takes `useGlobalScope() ?? appScope` as its
  parent (`runtime/src/render/global-scope.ts`). Reads, writes and deep
  writes are the ordinary variable accessors found through the prototype
  chain; a component's own variable of the same name is found first. Each
  mounted app has its own globals.
- **A component rendered by an app that doesn't provide its global**
  (compiled against the entry's globals, used from another app page) reads
  `undefined`, and a write throws (reported as a handler error).
- **Conflicts:**
  - a `var.*` and a `global.*` of one name on the root: E007;
  - a `Globals.xs` name that is also a `global.*`: E019 at `Globals.xs`
    ("declared twice");
  - a `Globals.xs` name that is also a root `var.*` or a `Main.gui.xs` declaration: E007 at
    `Globals.xs`;
  - a global named like an ID: E012.
- **XMLUI** checks names only at run time (an assignment to an undeclared
  name is an error toast), passes `globalVars` down the render tree
  (`xmlui/src/components-core/state/global-variables.ts`) and narrows them
  per node (`ComponentWrapper.tsx`). Here each reader subscribes to the
  signals it reads, so no narrowing is needed.

## Component APIs

| Piece | What it does |
|-------|--------------|
| `Bound` with `id` | Passes the component a `registerApi` prop (from `apiRegistrar(scope, id)`) |
| `useComponentApi(registerApi, api)` | Publishes `api` after mount (frozen) and clears it on unmount |
| `api` | Stable object (`useMemo`); values are getters over the component's signals, methods are plain functions |

- **Not React's `ref`:** a `ref` may be forwarded to a DOM element, and raw
  platform objects must never reach script. `registerApi` is explicit and
  opt-in.
- **Before mount and after unmount** the ID reads `undefined`, so
  `box.value` is `undefined` (optional chaining).
- **Metadata** declares the API (`ComponentMetadata.api`). `box.member` is
  checked against it at compile time (C015, [contracts.md](contracts.md)).

`TextBox` is the reference implementation (since step 16, Mantine's
`TextInput` through `wrapComponent`'s controlled value:
[mantine.md](mantine.md)):

- its text is a signal that drives both the input and `api.value`;
- its API is `value`, `setValue(v)` and `focus()`;
- its event is `didChange` (`$param` is the new text).

## Files

| File | Contents |
|------|----------|
| `runtime/src/render/component-api.ts` | `createFileScope`, `useFileScope`, `apiRegistrar`, `useComponentApi`, `API_REFS`, `RegisterApi` |
| `runtime/src/render/elements.ts` | `Bound` (`id` prop), `useScope` |
| `runtime/src/reactivity/scope.ts` | `createScope` (the prototype chain) |
| `runtime/src/render/app-globals.ts` | `createAppScope` |
| `runtime/src/render/global-scope.ts` | `GlobalScope`, `useGlobalScope` (step 21B) |
| `compiler/src/module/analyze.ts` | `rootGlobalNames`, `globalsCodeNames`, `ModuleAnalysis.globals` |
| `compiler/src/module/compile-module.ts` | `collectIds`, `visibleNames`/`visibleVariables` (with the component globals), `globalContainer`, the file-scope prologue in `Main`, E010–E012 |
| `compiler/src/codegen/emitter.ts` | `resolve`, `reportUnresolved` (C001/C002/C005/C014) |
| `components/src/mantine.tsx`, `runtime/src/render/wrap.ts` | `TextBox` (and the other components with an API) |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/ids-scoping.test.ts` | ID emission, visibility (siblings in either order, nested containers, inside to outside), E010–E012, IDs are read-only, shadowing, context variables (C014) |
| `runtime/tests/render/component-api.test.tsx` | File scope (undefined until registered, read-only, inheritance), registration and unregistration through `Bound`, reactivity of API reads, frozen APIs |
| `components/tests/ids-scoping.test.tsx` | Typing updates readers before and after the TextBox and in nested containers; IDs inside containers visible outside; API methods from handlers; `onDidChange`/`$param`; `focus()`; shadowing |
| `e2e/ids.spec.ts` | Chromium: a Text before a TextBox follows typing; handlers call `setValue` and `focus` |
| `compiler/tests/module/globals.test.ts` | Step 21B tables: `analyzeModule(...).globals`; a component file with the `globals` option (read, write, deep write, methods, templates, shadowing by a var, an ID, a template ID, a code-behind function; C001 without them); an app's own globals (inline components, initializers, E005–E007, E012, the container); `Globals.xs` (visibility, writes, read-only functions, conflicts, its own diagnostics) |
| `components/tests/globals.test.tsx` | In jsdom: a component file writes, Main and another file read; `<global>`; shadowing; a nested component sees the global, not its parent's variable; inline components; one set of globals per mounted app; a missing provider; `Globals.xs` functions and initializers |
| `e2e/globals.spec.ts` (hello app, dev and prerendered build) | `LikeButton` writes a global through a `Globals.xs` function; Main and `LikeCount` read it; a local variable shadows one |
