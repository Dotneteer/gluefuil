# Wrapping React components; Mantine; Text and Heading

> Subsystem reference: the `wrapComponent` API, the Mantine-based built-ins
> and their theme mapping, and the `Text`/`Heading` components. Describes the
> code as it is. Design and XMLUI comparison:
> [`../plan/poc-16-mantine.md`](../plan/poc-16-mantine.md).
>
> **Last updated:** step 23 (the display components on Mantine are in [display.md](display.md)). Earlier: step 16 (done after step 18).

## `wrapComponent` (`runtime/src/render/wrap.ts`)

It makes an existing React component usable from markup. `Bound` passes it
resolved values (markup literals are strings), `on*` handlers, template
renderers, and `registerApi` for an element with an `id`.

```ts
export const TextBox = wrapComponent(TextInput, {
  props: componentMetadata.TextBox.props,            // literals coerced by valueType
  rename: { enabled: (v) => ({ disabled: v === false }) },
  value: { prop: "value", change: "onChange", read: (e) => e.currentTarget.value, parse: asText },
  withRef: true,
  api: ({ ref }) => ({ focus: () => ref.current?.focus() }),
  fixed: { className: "gfui-TextBox" },
});
```

| Config | Effect |
|--------|--------|
| (default) | Every prop not handled below is forwarded unchanged |
| `props` | A literal is coerced by its `valueType`: `"true"`/`"false"` become booleans, numeric strings become numbers or integers (`coerceLiteral`) |
| `rename` | A gfui prop becomes another native prop, or native props computed from the value |
| `events` | A gfui event becomes a native callback, with argument mapping |
| an `on*` handler not listed in `events` | Forwarded under its own name, but **called without arguments**: native arguments (DOM events) never reach script (the step 3 sandbox invariant) |
| `value` | A controlled value in a signal: read once from `initialValue` (`parse`d), passed as the native value prop; the change callback sets it (`read`) and fires `didChange`. The API gets a reactive `value` and `setValue` (which doesn't fire `didChange`). |
| `api` | More methods; `ref` is the native component's ref (`withRef`) |
| `templates` | A gfui template becomes a native render prop: `(...args) => renderer(context(...args))`, which returns a `TemplateInstance` element |
| `fixed` | Native props always passed, last (styling hooks) |
| `exclude` | gfui props never forwarded |

- The API is published with `useComponentApi`.
- `children` are passed only when given, so a rename can produce them
  (`label` → `children`).

### An app's own React components

An app module can export React components (wrapped with `wrapComponent`
or written directly). The Vite plugin's **`extensions`** option registers
them with their metadata, and markup then uses them like built-ins
([build-time.md](build-time.md)). See the playground's `ScenarioSource`
(`playground/src/react/ScenarioSource.tsx`, `playground/vite.config.ts`).
Standalone mode can't load them yet.

## The Mantine-based built-ins (`components/src/mantine.tsx`)

| Component | Mantine | Props | Events | API |
|-----------|---------|-------|--------|-----|
| `Button` | `Button` | `label` (→ children), `enabled` | `click` (no arguments) | |
| `TextBox` | `TextInput` | `initialValue`, `placeholder`, `enabled` | `didChange` | `value`, `setValue`, `focus` |
| `Select` | `Select` | `options` (strings or `{ value, label }` → `data`), `initialValue`, `placeholder`, `enabled`, `searchable`, `clearable`; template `optionTemplate` (`$item` = `{ value, label }`, `$checked`) | `didChange` (null when cleared) | `value`, `setValue`, `focus` |
| `Checkbox` | `Checkbox` | `label` (its own), `initialValue`, `enabled` | `didChange` | `value`, `setValue` |

- **`App` wraps its children in `MantineProvider`:**
  - `forceColorScheme` = the active tone;
  - `withCssVariables={false}` and `withGlobalClasses={false}`, so the
    provider renders no `<style>` elements of its own.
- **`.gfui-App` (and a `Theme` with a tone) carry `data-mantine-color-scheme`,**
  so Mantine's tone selectors match below them, also in a server render.
- **Mantine's CSS** (`MANTINE_STYLESHEET`) is the `*.layer.css` files of the
  components used, plus `default-css-variables` and `global`, imported with
  `?inline`.
  - `App` renders it as a React 19 hoisted `<style href="gfui-mantine">`.
    React merges it with `gfui-base` (same precedence) into one element.
  - **Every Mantine rule is in `@layer mantine`,** so our unlayered rules
    win.
- **`Select`'s dropdown** stays inside the app (`withinPortal: false`), so it
  inherits the theme scope.
- **Divergences:**
  - `Select` takes `options`; XMLUI's `Option` children and `data` come
    later.
  - `Button` doesn't declare XMLUI's `variant` (solid, outlined, ghost) yet,
    so the step 18 `variant` behavior still applies to it.

### Theme mapping (Mantine never sees its own theme)

| Where Mantine sets a variable | How it's redirected | Variables |
|-------------------------------|---------------------|-----------|
| Inline, from its `vars` resolvers | The wrapper's fixed `vars` resolver (it replaces Mantine's own values) | Button `--button-bg/hover/color/bd/radius` ← `*-Button`; Checkbox `--checkbox-color/radius` ← `backgroundColor-Checkbox--checked`, `borderRadius-Checkbox`; TextBox and Select `--input-radius` |
| From CSS | `styles.ts` (unlayered) | `.gfui-TextBox` / `.gfui-Select .mantine-Input-input`: `--input-bg/color/bd/bd-focus`; the Select dropdown |
| Globally | `styles.ts` on `.gfui-App` and `.gfui-Theme` | `--mantine-font-family`, `-color-text`, `-color-body`, `-color-dimmed`, `-color-placeholder`, `-color-default-border`, `-primary-color-filled(-hover)`, `-radius-default` ← gfui tokens |

The E2E tests check it with computed styles: the Mantine `Button` takes
`backgroundColor-Button`, a scoped `<Theme>` override, and a variant.

## Text and Heading (`components/src/text.tsx`, our own)

- **`Text`:**
  - `value` or nested text;
  - **`variant`** (22 of XMLUI's; an enum) renders the semantic element where
    one exists: `strong`, `em`, `code`, `kbd` (keyboard), `del` (deleted),
    `ins` (inserted), `mark` (marked), `samp` (sample), `var`, `abbr`,
    `cite`, `small`, `sub`, `sup`, `p` (paragraph); otherwise a `span`
    with `data-variant` (title, subtitle, subheading, secondary, caption,
    mono, placeholder) styled in `styles.ts`;
  - `maxLines` and, since step 23, the other text-overflow props
    (`overflowMode`, `breakMode`, `ellipses`, `preserveLinebreaks`, `inline`;
    [display.md](display.md#text-overflow-textoverflow-texttsx)).

  `Text` declares `variant`, so the variant behavior skips it.
- **`Heading`:** `value` or nested text, `level` (`h1`…`h6`, `H1`…`H6`, `1`…`6`;
  `headingLevel`), `maxLines`.
  - It renders `<hN class="gfui-Heading" data-level>`.
  - **Its theme variables:** `textColor-Heading`, `fontWeight-Heading`,
    `lineHeight-Heading`, `fontSize-H1` … `fontSize-H6`.
- **`H1`…`H6`:** shortcuts for `Heading`.

## Size

Step 23's sizes (Lucide, six more Mantine components, the Markdown chunk) are
in [display.md](display.md#size). At step 16:

- **Hello app:** 502 KB (144 KB gzipped), up from 251 KB (78 KB) before
  Mantine.
- **`gfui.js`:** 599 KB (174 KB gzipped), up from 326 KB (101 KB).
- **The prerendered `index.html`** now inlines Mantine's CSS: 112 KB
  (14 KB gzipped).

Most of the growth is `Select` (Mantine's Combobox, Popover and
floating-ui).

## Testing note

jsdom has no `matchMedia` or `ResizeObserver`.
`components/tests/jsdom-setup.ts` stubs them (as Mantine's testing guide
recommends), and the components and standalone test projects load it
(`setupFiles`).

## Files

| File | Contents |
|------|----------|
| `runtime/src/render/wrap.ts` | `wrapComponent`, `coerceLiteral`, the config types |
| `components/src/mantine.tsx` | `Button`, `TextBox`, `Select`, `Checkbox`, `MANTINE_STYLESHEET` |
| `components/src/text.tsx` | `Text`, `Heading`, `H1`…`H6`, `headingLevel`, `TEXT_VARIANT_ELEMENTS` |
| `components/src/theme.tsx` | `App` (with `MantineProvider`), `Theme` |
| `components/src/styles.ts` | The Mantine variable redirections, Text variants, Heading |
| `components/src/css.d.ts` | `*.css?inline` |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/render/wrap.test.tsx` | `coerceLiteral`; forwarding and typing; rename (also to children); events (mapped, and argument-free when unconfigured); the controlled value and its API; methods through a ref; templates as render props; fixed props and exclusions |
| `components/tests/mantine.test.tsx` | Each Mantine component through compiled markup: click without arguments, disabled, typing and `didChange`, the API (`value`, `setValue`, `focus`), Select options and its option template, Checkbox, the Button variable redirection |
| `components/tests/text-heading.test.tsx` | Text variants, their elements, `maxLines`, contract errors; Heading levels and the shortcuts |
| `e2e/mantine.spec.ts` (dev and build) | A typed value round-trips into a variable; Select (template, pick, clear); Checkbox; a disabled Button; the theme controls Mantine's Button color; text variants and headings |
