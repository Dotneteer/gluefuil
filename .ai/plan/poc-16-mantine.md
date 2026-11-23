# Step 16: Wrapping React components (Mantine), plus Text and Heading

**Status:** Done

Part of [poc-steps.md](poc-steps.md). It was skipped after step 15 and is
done after step 18, at the user's request. **The scope is reduced:** a few
Mantine components, plus `Text` and `Heading` components that help manual
testing.

## Goal

1. **A lightweight wrapper API** (`wrapComponent`) that makes an existing
   React component usable from markup:
   - props forwarded by default;
   - renames;
   - events;
   - controlled values;
   - exposed methods;
   - templates as render props.
2. **Mantine as the base library** for `Button`, `TextBox` (`TextInput`),
   `Select` and `Checkbox`, inside a `MantineProvider`, styled only through
   our theme variables.
3. **Our own `Text` variants and `Heading` / `H1`–`H6`.**

## Background

- **XMLUI** (`.ai/xmlui/wrapcomponent.md`; `wrapComponent.tsx`):
  - props are forwarded by default and typed from metadata `valueType`;
  - `rename`, `events` (`on` + capitalized name), `stateful`
    (`initialValue` + `didChange` → `value`/`updateState`);
  - `exposeRegisterApi`;
  - `renderers` (templates as render props with context variables);
  - `exclude`.
- **XMLUI references:**
  - `reference/components/Text.md`: 27 variants;
  - `Heading.md`: `level` h1–h6 (also `H1`, `1`), `value`, `maxLines`, and
    the shortcuts `H1`–`H6`;
  - `Button.md`, `TextBox.md`, `Select.md` (`data`, or `Option` children),
    `Checkbox.md` (`initialValue`, `didChange`, `value`/`setValue`).
- **Mantine 9.8.2 (React ≥ 19.2):**
  - per-component CSS is available as `@layer mantine` files
    (`styles/<Name>.layer.css`);
  - some component variables are set inline by its `vars` resolvers
    (`--button-bg`), others by CSS (`--input-bd`).

## Design

### `wrapComponent` (`runtime/src/render/wrap.ts`, React only)

```ts
wrapComponent(Native, {
  props?: Record<string, { valueType?: string }>,   // from the metadata: literals coerced by type
  rename?: { enabled: "disabled" },                // or a function: value → native props
  events?: { didChange: { prop: "onChange", args: (e) => [e.currentTarget.value] } },
  value?: { initial: "initialValue", prop: "value", change: "onChange", read: (e) => …, event: "didChange" },
  api?: (ctx) => ({ focus() {…} }),                // with a ref to the native element
  templates?: { optionTemplate: { prop: "renderOption", context: (arg) => ({ $item: … }) } },
  fixed?: { … },                                    // native props always passed (vars, classNames)
  exclude?: [...],
})
```

- **Every other prop is forwarded unchanged.** Literals (strings from
  markup) are coerced by their metadata `valueType`: `"true"` becomes
  `true`, `"3"` becomes `3`.
- **A controlled value** lives in a signal:
  - `initialValue` is read once;
  - the native change callback sets it and calls `didChange`;
  - the API gets `value` (reactive) and `setValue`.
- **`registerApi`** (from `Bound` with an `id`) publishes the API.
- **Templates** become the native render props: a pfui template renderer
  called with context variables.
- **A template renderer creates a `TemplateInstance`**, a React element.
  That's what Mantine render props return.

### Mantine (`components/src/mantine.tsx`)

- **`App` wraps its content in `MantineProvider`:**
  - `forceColorScheme` = the active tone (deterministic on server and
    client);
  - `cssVariablesSelector` = `.pfui-App` (no global side effects);
  - the Mantine global variables
    (`--mantine-font-family`, `--mantine-color-text`, `--mantine-color-body`,
    `--mantine-primary-color-filled`, `--mantine-radius-default`) are
    redirected to our theme variables on `.pfui-App`.
- **Mantine's CSS:** the `*.layer.css` files of the components used,
  imported with `?inline` and rendered as a React 19 hoisted `<style>` next
  to ours. Every Mantine rule is in `@layer mantine`, so our unlayered rules
  win.
- **Theme mapping:**
  - inline-set variables via the wrapper's fixed `vars` resolver: Button
    `--button-bg/hover/color/bd/radius`, Checkbox `--checkbox-color`;
  - CSS-set ones via our stylesheet: Input
    `--input-bd/bg/color/bd-focus`, Combobox.
- **`Select`'s dropdown stays inside the app**
  (`comboboxProps.withinPortal: false`), so it inherits the theme scope.

| Component | Mantine | pfui props | Events | API |
|-----------|---------|-----------|--------|-----|
| `Button` | `Button` | `label`, `enabled` | `click` | |
| `TextBox` | `TextInput` | `initialValue`, `placeholder`, `enabled` | `didChange` | `value`, `setValue`, `focus` |
| `Select` | `Select` | `options` (strings or `{ value, label }`), `initialValue`, `placeholder`, `enabled`, `searchable`, `clearable`; template `optionTemplate` (`$item`) | `didChange` | `value`, `setValue`, `focus` |
| `Checkbox` | `Checkbox` | `label`, `initialValue`, `enabled` | `didChange` | `value`, `setValue` |

- **Divergences:**
  - `Select` takes an `options` prop; XMLUI's `Option` children and `data`
    come later.
  - `Button`'s `variant` (solid, outlined, ghost) is not declared yet, so
    the step 18 `variant` behavior still applies to Buttons.

### Text and Heading (`components/src/text.tsx`, our own)

- **`Text`:**
  - `value` or nested text;
  - `variant`: `strong`, `em`, `code`, `small`, `sub`, `sup`, `deleted`,
    `inserted`, `keyboard`, `marked`, `sample`, `var`, `abbr`, `cite`,
    `paragraph`, `title`, `subtitle`, `subheading`, `secondary`, `caption`,
    `mono`, `placeholder` (the semantic element where one exists);
  - `maxLines` (a line clamp).

  `Text` now declares `variant`, so the variant behavior skips it.
- **`Heading`:** `value` or nested text, `level` (`h1`…`h6`, `H1`…`H6`,
  `1`…`6`) and `maxLines`.
- **`H1`…`H6`:** shortcuts for `Heading`.
- **Theme variables:** `fontSize-H1`…`H6`, `fontWeight-Heading`,
  `textColor-Heading`, `lineHeight-Heading`; Text variants use tokens.

### The hello app

Its sections get headings (`H2`), and it gains a Mantine section: a
`Select` with an `optionTemplate`, and a `Checkbox`, bound to variables.

## Tests

- **Unit (runtime):** `wrapComponent`, one test per feature (forwarding,
  coercion, rename, events, controlled value with API, methods, templates,
  fixed props).
- **Unit (components):** each Mantine component through compiled markup
  (render, events, API); Text variants; Heading levels and shortcuts.
- **E2E (dev and build):**
  - a typed value round-trips through the Mantine `TextInput` into a
    variable;
  - Select and Checkbox round-trips;
  - the theme still controls Mantine's Button color;
  - takeover stays DOM-stable.

## Outcome

Implemented as designed. Details: [`../docs/mantine.md`](../docs/mantine.md).

- **`Button`, `TextBox`, `Select` and `Checkbox` are Mantine 9.8.2
  components**, wrapped with a few lines of configuration each.
- **Every earlier test passes unchanged against them,** except two step 5
  markup snapshots. The E2E tests cover:
  - the theme's computed Button color;
  - the variant behavior;
  - tooltips and labels;
  - the DOM-stable takeover of prerendered Mantine markup;
  - standalone mode.
- **The hello app has section headings** (`H1`/`H2`), a Mantine section
  (TextInput, Select with an option template, Checkbox, a disabled Button)
  and a text-variants section.
- `npm run check`: 1,916 unit tests in 65 files and 69 E2E tests.

## Findings

- **`@layer mantine` plus unlayered pfui rules** resolves every specificity
  question at once: Mantine's `*.layer.css` files put all its rules in a
  layer, and ours win.
- **Mantine sets some variables inline** (its `vars` resolvers). A fixed
  `vars` prop replaces them, and the inline style shows only our
  redirections (`--button-bg: var(--pfui-backgroundColor-Button)`).
- **`MantineProvider` without its own `<style>` elements**
  (`withCssVariables={false}`, `withGlobalClasses={false}`, plus Mantine's
  static `default-css-variables`) keeps the app's DOM clean. Tests reading
  `textContent` would otherwise see CSS.
- **`data-mantine-color-scheme` on `.pfui-App`** makes Mantine's tone
  selectors work in a server render and inside a `<Theme tone>` scope,
  without waiting for the provider's effect on `<html>`.
- **The sandbox invariant needs care in a wrapper API.** A generic "forward
  every handler" would pass DOM events to script. Unconfigured events are
  therefore called without arguments; configured ones map them
  explicitly.
- **Size:** Mantine roughly doubles the bundle (hello app 251 → 502 KB,
  78 → 144 KB gzipped; `pfui.js` 101 → 174 KB gzipped), mostly because of
  `Select`'s Combobox, Popover and floating-ui.
- **jsdom needs `matchMedia` and `ResizeObserver` stubs** for Mantine
  (`tests/jsdom-setup.ts`).

## Open for later steps

- **`Select`:** `Option` children and `data`, groups, multiple selection.
- **`Button`:** `variant` (solid, outlined, ghost), `themeColor`, `icon`.
- **Mantine's own tone selectors** follow `<html>` (set by the provider), so
  a nested `<Theme tone>` gets pfui's colors but some Mantine-internal tone
  details (such as checkbox borders) stay with the app's tone.
- **Bundle size:** lazy-loading heavier components (the Select dropdown).
- **More Mantine components**, as the app needs them.
