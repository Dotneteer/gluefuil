# Behaviors

> Subsystem reference: cross-cutting features attached to components by
> trigger props (`label`, `tooltip`, `variant`). Describes the code as it is.
> Design and XMLUI comparison:
> [`../plan/poc-18-behaviors.md`](../plan/poc-18-behaviors.md).
>
> **Last updated:** step 18.

## Using them

```xml
<TextBox label="Name" labelPosition="start" tooltip="Your full name"/>
<Theme backgroundColor-Button-danger="rgb(185, 28, 28)">
  <Button label="Delete" variant="danger"/>
</Theme>
```

| Behavior | Props | Attaches when | Renders |
|----------|-------|---------------|---------|
| `label` | `label`, `labelPosition` (`top` \| `start`) | `label` is set and the component doesn't declare `label` (`Button` does) | `<label class="pfui-Label" data-position>` with `.pfui-Label-text` and the component: an input inside gets the label as its accessible name |
| `tooltip` | `tooltip` | `tooltip` is set | `<span class="pfui-TooltipAnchor">` around the component; on hover or focus, `<span role="tooltip">` linked by `aria-describedby` |
| `variant` | `variant` | `variant` is set and the component has `themeVars` | `<div class="pfui-Variant" style="display: contents">` setting each component variable to `var(--pfui-<name>-<variant>, <default>)` |

- **Order** (`BEHAVIORS`): label innermost, then tooltip, then variant
  outermost, as in XMLUI.
- **Their theme variables:**
  - `textColor-Label`, `fontSize-Label`, `gap-Label`;
  - `backgroundColor-Tooltip`, `textColor-Tooltip`, `borderRadius-Tooltip`,
    `padding-Tooltip`, `fontSize-Tooltip`.
- **Components that own `variant`** (`Text`, since step 16) skip the
  variant behavior. `Button` doesn't declare one yet.
- **Variant values** are theme variables with a variant segment
  (`backgroundColor-Button-danger`, `…-danger--hover`). E025 accepts them
  (`isKnownThemeVariable`).
- **The variant's fallback** is the component's default (references
  resolved), not an inherited override: a CSS variable can't fall back to
  its own inherited value.

## How they attach: at compile time

`attachedBehaviors(metadata, attributes)` (in `@patchfuil/components/metadata`)
is the whole rule:

1. the element sets a trigger prop (literal or bound);
2. the component's contract doesn't declare it;
3. the component isn't `nonVisual` (`Items`, `Theme`);
4. `requiresThemeVars` behaviors need `themeVars`.

`compileModule` then:
- sends the behavior's attributes to it, type-checked against its props
  (E022/E023), never to the component;
- wraps the compiled element in one `Bound` per behavior, innermost first.

```js
$$h($$Bound, { type: $$C_TooltipBehavior, props: null, bindings: $$b3, scope: $$c },
  $$h($$Bound, { type: $$C_Button, props: { "label": "Save" }, bindings: $$empty, handlers: $$e2, scope: $$c }))
```

- **There is no runtime behavior registry** and no per-render
  `canAttach`. Behavior props may be bound.
- **`when` stays outermost**, and `id`, handlers and lifecycle stay on the
  component.
- **`variant` also gets the component's name.**
- **When a behavior doesn't attach,** its props are ordinary props (E020
  if unknown).

## User-defined components (diverges from XMLUI)

**Behaviors attach to UDC tags by the same rule.** A UDC that reads
`$props.tooltip` handles it; one that doesn't, or whose contract is open,
gets the behavior. XMLUI never attaches behaviors to compound components.
`variant` needs `themeVars`, which UDCs don't have, so on a UDC it is an
unknown prop.

## Files

| File | Contents |
|------|----------|
| `components/src/behaviors-metadata.ts` | `BehaviorMetadata`, `BEHAVIORS` (React-free) |
| `components/src/metadata.ts` | `attachedBehaviors`, `isKnownThemeVariable`; `nonVisual`; behavior theme defaults in `componentThemeDefaults` |
| `components/src/behaviors.tsx` | `LabelBehavior`, `TooltipBehavior`, `VariantBehavior`, `variantVariable` |
| `components/src/styles.ts` | `.pfui-Label*`, `.pfui-TooltipAnchor`, `.pfui-Tooltip` |
| `compiler/src/module/compile-module.ts` | `behaviorAttribute`, `withBehaviors` (in `element`) |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/behaviors.test.ts` | Attachment and skips (declared prop, non-visual, missing trigger, `variant` without theme variables), the order, type checks, the generated code, `when` and `id` placement, UDCs, variant theme variable names |
| `components/tests/behaviors.test.tsx` | The label gives the accessible name; the tooltip on hover, focus and leave with `aria-describedby` and bound text; the variant's variables; a UDC tag; the DOM order |
| `e2e/behaviors.spec.ts` (dev and build) | A tooltip on hover; a labeled input found by its label; a variant Button's color from its Theme, and the fallback |
