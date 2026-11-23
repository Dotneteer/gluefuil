# Step 10: Conditional rendering and templates

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

- **Conditional rendering:** `when` and the responsive `when-*` attributes.
- **Lifecycle:** `onMount`/`onUnmount`.
- **Templates:** `Items` with `$item`, `$itemIndex`, `$isFirst` and
  `$isLast`, and template properties (`<property name="itemTemplate">`).
  This is where component-injected context variables (deferred in step 8)
  arrive.

## Background (XMLUI)

Sources: `website/content/docs/pages/visibility.md`,
`template-properties.md`, `reference/components/Items.md`.

- **`when`:** a falsy value means the component and its subtree are *not
  processed at all*: no rendering, no children, no lifecycle. It is a
  reactive binding.
- **Responsive `when-xs/sm/md/lg/xl/xxl`** (min-width 0, 576, 768, 992,
  1200, 1400), mobile-first:
  - walk down from the current breakpoint; the first defined rule wins;
  - with no rule at or below, use `when` if present;
  - otherwise, the **opposite of the lowest defined rule** (the inferred
    base). The behavior table is in `visibility.md`.
- **`onMount`/`onUnmount`** fire on each `when` transition (`false → true`
  and back), not when `when` starts out false. `onInit`/`onCleanup` are
  aliases.
- **`Items`** renders `data` through its item template, with no wrapper
  element. The template is either its children or
  `<property name="itemTemplate">`. It takes a `reverse` prop and provides
  the context variables `$item`, `$itemIndex`, `$isFirst` and `$isLast`.

## Design

### `when` and `when-*`

- **The wrapper.** An element with `when` or `when-*` compiles to
  `$$h($$When, { test, responsive, scope }, element)`. `When` evaluates its
  conditions in one `useComputed` and renders the element only when
  visible. A hidden element's component never runs: no hooks, no children,
  no lifecycle.
- **Constants:**
  - `when="false"` (or empty) omits the element entirely;
  - `when="true"` adds no wrapper;
  - other constant text is truthy.
- **Evaluation scope:** `when` is evaluated in the **enclosing scope**,
  before the element exists. So it cannot read the element's own
  variables (C001).
- **Responsive rules** resolve with XMLUI's walk and inferred base
  (`resolveVisibility`, a table test).
- **The current breakpoint** is a runtime signal (`breakpoint`), updated
  from `window.innerWidth` on `resize`. This works in jsdom, and
  `matchMedia` isn't needed.

### `onMount` / `onUnmount`

- **Any element** accepts them (with the aliases `onInit` and `onCleanup`),
  as attributes or as `<event name="mount">` / `<event name="unmount">`.
- **When they run:** `Bound` invokes them from an effect, so mount means
  the element was rendered, and `when` transitions follow naturally.
- **StrictMode** simulates an unmount and remount in development. The
  unmount handler is deferred by a microtask and cancelled if the element
  remounts at once, so the handlers fire once per real transition.

### Templates

**Metadata** gains:

- `templates: { itemTemplate: { contextVars: ["$item", "$itemIndex", "$isFirst", "$isLast"] } }`;
- `childrenTemplate: "itemTemplate"`: the element's children are that
  template.

**Compiling a template:**

- Template content compiles to a module-level function
  `function $$T0($$c) { return … }`. It is compiled in a scope frame of
  its context variables, which can be read but not written (C012).
- The element gets `templates: { itemTemplate: $$T0 }`.
- `Bound` turns each template into the component prop `itemTemplate`:
  `(context, key) => ReactNode`. Each call renders a `TemplateInstance`.

**Making context values reactive without remounting items:**

- `TemplateInstance` creates **its scope once** (child of the element's
  scope), with a signal per context variable.
- When its context values change, it updates those signals in a layout
  effect, so the update arrives before paint, and never during render
  (setting a signal during render would update other components while one
  is rendering).
- **Per-item state survives data changes.** Variables in a template
  (`<Stack var.expanded="{false}">`) keep their values when `data` changes
  around them, because scope objects stay stable.

**`<property name="…">`** with markup content is a template property. Any
other `<property>` is E013 for now; non-template property content, such as
`<property name="data"><DataSource/></property>`, comes with `DataSource`
in step 20.

**IDs inside templates** are E014 for now: one `id` per rendered item
needs a template-scoped ID design.

### `Items` (components)

- **Props:** `data`, `reverse`, `itemTemplate`.
- **Rendering:** one `itemTemplate(context)` per item, keyed by index,
  with no wrapper element.

### Diagnostics

| Code | Meaning |
|------|---------|
| E013 | Unknown template property, or a `<property>` that is not a template |
| E014 | `id` inside a template (not supported yet) |
| E015 | Invalid `when-*` breakpoint name |

## Tests

- **Runtime:**
  - the `resolveVisibility` table (XMLUI `visibility.md`);
  - `When` with a reactive condition;
  - the breakpoint signal;
  - mount and unmount ordering, including StrictMode;
  - `TemplateInstance` context updates without remounting.
- **Compiler:** `when` emission and constants, templates and context
  frames, lifecycle handlers, E013–E015, C012/C014.
- **Components (jsdom):**
  - `when` toggling with `onMount`/`onUnmount`;
  - `Items` with data, the context variables, `reverse` and a
    `<property>` template;
  - per-item state surviving data changes;
  - handlers using `$item`.
- **E2E:** a responsive `when` at different viewport sizes; `Items` with
  add and remove.

## Outcome

Implemented as designed. Details:
[`../docs/visibility-templates.md`](../docs/visibility-templates.md).

## Findings

- **A latent step 7 bug fixed.** Handler policies and timeouts were
  emitted as inline objects. Inside a template, every data change
  re-renders the instance, so `Bound` would recreate its handler slots
  and dispose the old ones, which aborts running handlers. Everything
  `Bound` keys on is now hoisted.
- **Template context through signals.** Updating them in a layout effect
  keeps scope objects stable, so per-item variables survive data changes
  (tested: a counter in item 2 survives an append and a rename of item 1).
  The cost is one extra synchronous render of the affected bindings
  before paint.
- **StrictMode and lifecycle handlers.** React's simulated unmount and
  remount would fire `onUnmount`/`onMount` twice in development. A
  deferred unmount, cancelled by an immediate remount, makes them fire
  once.
- **`when` is evaluated in the enclosing scope:** the element's own
  variables don't exist yet. This is a deliberate rule; XMLUI's
  evaluation context for `when` on a variable-declaring element wasn't
  verified.

## Open for later steps

- **IDs inside templates** (E014): an `id` per rendered item.
- **Keying `Items` by a stable key** instead of the index (for reordering
  with per-item state).
- **Non-template `<property>` content**, such as `DataSource` as `data`
  (step 20).
- **`List` and `Table`** (virtualized) use the same template mechanism
  (architecture.md).
