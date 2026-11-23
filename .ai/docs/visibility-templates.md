# Visibility, lifecycle and templates

> Subsystem reference: `when` and `when-*`, `onMount`/`onUnmount`, template
> properties and `Items`. Describes the code as it is. Design and XMLUI
> comparison: [`../plan/poc-10-conditionals-templates.md`](../plan/poc-10-conditionals-templates.md).
>
> **Last updated:** step 10.

## `when` and `when-*`

| Markup | Compiles to |
|--------|-------------|
| `when="{expr}"`, `when-md="{expr}"` | `$$h($$When, { test: $$wN.test, responsive: $$wN.responsive, scope }, element)`, with the conditions hoisted as `$$wN = { test, responsive: { md } }` |
| `when="false"` or `when=""` (constant, no `when-*`) | Nothing: the element isn't compiled at all |
| `when="true"`, `when` (key-only), other constant text | No wrapper |

- **Breakpoints:** `xs` (0), `sm` (576), `md` (768), `lg` (992), `xl` (1200)
  and `xxl` (1400) px. Another suffix is E015.
- **Evaluation scope:** conditions are evaluated in the **enclosing scope**,
  before the element exists, so they can't read the element's own
  variables (C001).
- **Hiding is real removal.** `When` (runtime) evaluates the conditions in
  one `useComputed` and renders its child only while visible. A hidden
  child's component never runs: no hooks, no children, no handlers.
  Showing it again starts fresh, so the variables inside are recreated.
- **Responsive resolution** (`resolveVisibility`, as in XMLUI):
  1. walk down from the current breakpoint; the first defined rule wins;
  2. otherwise use `when`;
  3. otherwise the opposite of the lowest defined rule.
- **The current breakpoint** is a runtime signal (`breakpoint()`). It is
  created on first use and follows `window.innerWidth` on `resize`; with no
  window it stays at `xs`.
- **`When` reads `currentBreakpoint()`.** In the server view (server
  rendering and hydration), that is the **server breakpoint**
  (`setServerBreakpoint`, which the prerender and `mountApp` set);
  otherwise it is the live signal. The static HTML and the hydrated tree
  agree, and the live breakpoint takes over right after
  ([ssg.md](ssg.md)).

## `onMount` / `onUnmount`

- **Accepted on any element,** as attributes `onMount`/`onUnmount` (aliases
  `onInit`/`onCleanup`) or as `<event name="mount">`/`<event name="unmount">`.
- **Compiled** to `lifecycle: $$lN` (`{ mount, unmount }`) on the `Bound`
  element. They are not passed to the component.
- **`Bound` runs them from an effect,** through handler slots: async, with
  `$cancel`, errors reported. Mount means rendered, so `when` transitions
  fire them; an element that starts hidden doesn't mount.
- **StrictMode** simulates an unmount and remount in development. The
  unmount is deferred by a microtask and cancelled by an immediate
  remount, so each handler fires once per real transition.

## Templates

- **Metadata:**
  - `templates: { itemTemplate: { contextVars: [...] } }` declares template
    props and the context variables their content can read;
  - `childrenTemplate: "itemTemplate"` makes the element's children that
    template.
- **Markup:** `<property name="itemTemplate">markup</property>`, or plain
  children for the `childrenTemplate`.
  - An unknown template, or content besides an explicit
    `childrenTemplate` property, is E013.
  - Non-template `<property>` content is E013 too (for now).
- **Compiled:**
  - the content becomes `function $$TN($$c) { return … }` (several
    elements become a `Fragment`), compiled in a **context frame**: its
    context variables are readable, not writable (C012), and unknown
    elsewhere (C014);
  - the element gets `templates: $$tN` (hoisted `{ itemTemplate: $$TN }`).
- **Runtime:**
  - `Bound` gives the component `itemTemplate = templateRenderer(scope, $$TN)`:
    `(context, key?) => ReactNode`;
  - each call renders a `TemplateInstance`, which creates its scope once:
    a child of the element's scope, with one signal per context variable;
  - new context values update the signals in a layout effect (before
    paint, never during render).
- **Per-item state survives data changes.** Scope objects are stable, so
  variables inside an instance keep their values when the data changes.
  Instances are keyed by index.
- **Nesting:** inner templates see outer context variables through the
  scope chain; an inner `$item` shadows the outer one.
- **IDs inside templates** are E014 for now.

## `Items`

| Part | Details |
|------|---------|
| Props | `data` (array), `reverse` |
| Template | `itemTemplate` (or children) |
| Context | `$item`, `$itemIndex`, `$isFirst`, `$isLast` |
| Output | No wrapper element: one template instance per item |

## Files

| File | Contents |
|------|----------|
| `runtime/src/render/visibility.ts` | `When`, `resolveVisibility`, `breakpoint`, `breakpointIndex`, `BREAKPOINTS` |
| `runtime/src/render/templates.ts` | `TemplateInstance`, `templateRenderer` |
| `runtime/src/render/elements.ts` | `Bound`: `templates`, `lifecycle` (`useLifecycle`) |
| `components/src/items.tsx` | `Items` |
| `compiler/src/module/compile-module.ts` | `visibility`, `template`, `propertyTag`, lifecycle routing, `contextFrames`; `collectIds` skips templates (E014) |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/render/visibility-templates.test.tsx` | The `visibility.md` resolution table, breakpoints, the resize signal, `When` (a hidden child never runs, responsive), template instances (reactive context, no recreation), lifecycle (order, StrictMode, `When` transitions) |
| `compiler/tests/module/conditionals-templates.test.ts` | `when` emission, constants, responsive rules, enclosing-scope evaluation, templates (children, `<property>`, fragments, containers inside), context-variable diagnostics, E013–E015, lifecycle |
| `components/tests/conditionals-templates.test.tsx` | jsdom: toggling with `onMount`/`onUnmount`, hidden state is discarded, responsive `when-*`, `Items` context variables, `reverse`, `<property>` templates, data changes with per-item state, nested `Items` |
| `e2e/conditionals-templates.spec.ts` | Chromium: responsive `when` at three viewport sizes; `Items` add and remove |
