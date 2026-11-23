# Step 18: Behaviors

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Cross-cutting features attach to any component through **trigger props**,
without the component knowing: `label`, `tooltip`, `variant`. They are
applied in a fixed order. This step also decides whether behaviors apply to
user-defined component tags.

Step 16 (Mantine) is skipped, so the behaviors wrap our own built-ins, and
the E2E tooltip is on a built-in `Button`, not a wrapped component.

## Background (XMLUI)

Source: `.ai/xmlui/behaviors.md` (`components-core/behaviors/*`,
`ComponentAdapter.tsx`).

- **At runtime,** `ComponentAdapter` asks each registered behavior
  `canAttach(context, node, metadata)` and chains `attach(node)`.
  Registration order is innermost to outermost:
  `label → animation → tooltip → variant → bookmark → formBinding → validation`.
- **Never** on compound (user-defined) components or `nonVisual`
  components.
- **`label`** skips components whose metadata declares `label` (they render
  it themselves), and components handled by form binding.
- **`variant`** sets `property-Component` to
  `var(--…-property-Component-<variant>, var(--…-property-Component))`.

## Design

### Attachment is decided at compile time

The compiler sees every attribute, so `canAttach` is a static rule:

1. the element sets a trigger prop (literal or bound); and
2. the component's contract does **not** declare that prop itself (a
   component that declares `label`, like `Button`, renders it); and
3. the component is not `nonVisual` (`Items`, `Theme`); and
4. the behavior's own condition holds: `variant` needs a component with
   `themeVars`.

A behavior that attaches **compiles to an ordinary `Bound` wrapper**
around the element. It evaluates the behavior's props (literal or bound)
in the element's scope:

```js
$$h($$Bound, { type: $$C_TooltipBehavior, props: null, bindings: { tooltip: … }, scope },
  $$h($$Bound, { type: $$C_LabelBehavior, props: { label: "Name" }, bindings: $$empty, scope },
    $$h($$Bound, { type: $$C_TextBox, … })))
```

- **There is no behavior registry at runtime**, no per-render `canAttach`,
  and no change to `Bound`.
- **The component never sees** a behavior's props.
- **`when`** stays outermost (around all behaviors), and `id`, handlers and
  lifecycle stay on the component.
- **The order** is the registration order, innermost first:
  `label → tooltip → variant`, as in XMLUI.

### The behavior metadata (React-free, `components/src/behaviors-metadata.ts`)

```ts
interface BehaviorMetadata {
  name: "label" | "tooltip" | "variant";
  component: string;                       // the wrapper's export: "LabelBehavior"
  triggerProps: string[];
  props: Record<string, PropMetadata>;     // accepted (and type-checked) when it attaches
  requiresThemeVars?: boolean;             // variant
  themeVars?: Record<string, string>;      // its own theme variables (Tooltip, Label)
}
```

When a behavior attaches, its props are valid props of the element
(contracts: no E020, but E022 and E023 apply). When it doesn't attach, they
are ordinary props: unknown ones are E020, as before.

### The behaviors (`components/src/behaviors.tsx`)

| Behavior | Props | Renders |
|----------|-------|---------|
| `label` | `label`, `labelPosition` (`top` \| `start`) | `<label class="pfui-Label">` with the text and the component. A wrapping `<label>` gives an input its accessible name. |
| `tooltip` | `tooltip` | `<span class="pfui-TooltipAnchor">` around the component. On hover or focus it shows `<span role="tooltip">`, linked with `aria-describedby`. |
| `variant` | `variant` | `<div style="display: contents">` that sets each of the component's theme variables to `var(--pfui-<name>-<variant>, <its default>)`. A `<Theme backgroundColor-Button-danger="…">` (or a theme) defines a variant. |

- **The variant fallback** is the component's default, with references
  resolved (`var(--pfui-color-primary-500)`). A CSS variable can't refer to
  its own inherited value.
- **Theme variable names with a variant segment**
  (`backgroundColor-Button-danger`, `…-danger--hover`) are known names
  for E025.

### User-defined component tags: decided

**Behaviors apply to UDC tags**, by the same rule: a UDC that reads
`$props.tooltip` handles it itself; otherwise the behavior wraps the tag.
- **This diverges from XMLUI,** which never attaches to compound
  components. A tooltip or label on any visible element is what an author
  expects. The contract rule ("the component claims the prop, or the
  behavior takes it") is the same for every component.
- **A UDC with an open contract** (it reads `$props[key]`) declares no
  names, so the behavior attaches.
- **`variant`** needs `themeVars`, which UDCs don't have yet, so on a UDC
  it stays an ordinary (unknown) prop.

## Tests

- **Unit, compiler:**
  - attachment (and skip) for each rule;
  - the nesting order;
  - behavior props: bound, type-checked, not passed to the component;
  - `when` outermost;
  - UDCs, both claiming and not claiming the prop.
- **Unit, components:**
  - each behavior's rendering;
  - the label gives the accessible name;
  - the tooltip shows on hover and focus;
  - the variant's variables.
- **E2E (hello app, dev and build):**
  - a tooltip on a Button appears on hover;
  - a labeled TextBox is found by its label;
  - a variant Button takes its variant color from a `<Theme>`;
  - takeover stays DOM-stable.

## Outcome

Implemented as designed. Details: [`../docs/behaviors.md`](../docs/behaviors.md).

- **The hello app has a behaviors section:** a tooltip Button, a labeled
  TextBox, and danger and unknown variants. In Chromium, both on the dev
  server and in the prerendered build:
  - the tooltip shows on hover;
  - the input is found by its label;
  - the variant colors follow the enclosing Theme;
  - takeover remains DOM-stable.
- `npm run check`: 1,870 unit tests in 62 files and 59 E2E tests.

## Findings

- **Compiling makes behaviors almost free.** The attachment rule is a
  static function of the contract and the attributes. A behavior is then
  an ordinary `Bound` wrapper, so behavior props can be bound, and
  `Bound`/`BoundUser` didn't change at all.
- **The contract and the behaviors share one rule:** a prop is the
  component's if its contract declares it, otherwise a behavior's. That
  same rule settles the UDC question without a special case.
- **A wrapping `<label>`** gives inputs their accessible name with no ID
  plumbing (verified with `getByLabel`).
- **A variant can't fall back to the inherited value of the variable it
  redefines,** so it falls back to the component's default. An enclosing
  `<Theme backgroundColor-Button="…">` is therefore ignored for variant
  Buttons. This is documented.

## Open for later steps

- **More behaviors:** animation, bookmark, form binding, validation.
- **`aria-describedby`** belongs on the focusable element, not the
  anchor; that needs wrapped components (step 16) or a ref protocol.
- **Tooltip placement options** and collision handling.
- **Built-in variants** that skip the behavior (XMLUI's Button `solid`,
  `outlined`, …).
