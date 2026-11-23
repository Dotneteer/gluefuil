# Scoping and component IDs

> Subsystem reference: how names resolve, at compile time and at runtime,
> and how component IDs expose APIs. Describes the code as it is. Design
> and XMLUI comparison: [`../plan/poc-08-scoping-ids.md`](../plan/poc-08-scoping-ids.md).
>
> **Last updated:** IDs inside templates (after step 19).

## Name resolution (compile time)

A name in a binding or handler resolves to the first match:

| # | Kind | Declared by | Writable in handlers |
|---|------|-------------|----------------------|
| 1 | Local | Parameters, `let`/`const`, functions, catch and `for` heads; handler locals `$param`, `$params`, `$cancel` | Yes (plain JavaScript) |
| 2 | Variable | `var.x` / `<variable>` / `global.x` / `<global>` on the element or an ancestor; the innermost declaration wins | Yes (through scope setters and path helpers) |
| 2a | Context variable | A template the code is inside (`$item`, `$itemIndex`, …: from the component's metadata). They start with `$`, which variable names can't, so the two never collide. | No (C012) |
| 3 | Component ID | `id="x"` **anywhere in the file** | No (C012); use API methods |
| 4 | App global | The runtime (`delay`) | No (C012) |
| 5 | Sandbox global | `Math`, `JSON`, … ([codegen.md](codegen.md)) | No (C010) |

**Inside a `<Component>` body** the same order applies to the component's own
names only:
- code-behind functions resolve like variables, but are read-only (C012);
- `$props`, `$self`, `emitEvent` and `hasEventHandler` come before app globals
  and are read-only.

The caller's names are not visible (C001): isolation. Slot content passed by
a caller is compiled in the caller's scope
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
| `compiler/src/module/compile-module.ts` | `collectIds`, `visibleNames`/`visibleVariables`, the file-scope prologue in `Main`, E010–E012 |
| `compiler/src/codegen/emitter.ts` | `resolve`, `reportUnresolved` (C001/C002/C005/C014) |
| `components/src/mantine.tsx`, `runtime/src/render/wrap.ts` | `TextBox` (and the other components with an API) |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/ids-scoping.test.ts` | ID emission, visibility (siblings in either order, nested containers, inside to outside), E010–E012, IDs are read-only, shadowing, context variables (C014) |
| `runtime/tests/render/component-api.test.tsx` | File scope (undefined until registered, read-only, inheritance), registration and unregistration through `Bound`, reactivity of API reads, frozen APIs |
| `components/tests/ids-scoping.test.tsx` | Typing updates readers before and after the TextBox and in nested containers; IDs inside containers visible outside; API methods from handlers; `onDidChange`/`$param`; `focus()`; shadowing |
| `e2e/ids.spec.ts` | Chromium: a Text before a TextBox follows typing; handlers call `setValue` and `focus` |
