# Step 24: Inputs

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the second batch of Phase F: `TextBox`,
`PasswordInput`, `TextArea`, `NumberBox`, `Checkbox`, `Switch`, `RadioGroup`
(with `Option`), `Slider`, `ColorPicker`.

## Goal

```xml
<Form data="{ { name: '', bio: '', age: 30, plan: 'free', volume: 5, color: '#2563eb', news: true } }">
  <TextBox bindTo="name" label="Name" required startIcon="user" autoFocus="true"/>
  <PasswordInput bindTo="password" label="Password" showPasswordToggle="true" required minLength="8"/>
  <TextArea bindTo="bio" label="About you" autoSize="true" maxRows="6"/>
  <NumberBox bindTo="age" label="Age" minValue="0" maxValue="130" integersOnly="true"/>
  <RadioGroup bindTo="plan" label="Plan" orientation="horizontal">
    <Option value="free" label="Free"/>
    <Option value="pro" label="Pro"/>
  </RadioGroup>
  <Slider bindTo="volume" label="Volume" minValue="0" maxValue="10"/>
  <ColorPicker bindTo="color" label="Accent"/>
  <Switch bindTo="news" label="Newsletter"/>
</Form>
```

Every input has XMLUI's markup, binds to a form with `bindTo` (step 22: a
`value`/`setValue` API is all a form needs), validates, and takes its look
from theme variables.

## Background

### XMLUI (`website/content/docs/reference/components/*.md`)

- **The text inputs** (`TextBox.md`, `PasswordInput.md`, `TextArea.md`,
  `NumberBox.md`) share: `initialValue`, `placeholder`, `enabled`,
  `readOnly`, `autoFocus`, `required`, `validationStatus` (`none`, `valid`,
  `warning`, `error`), adornments (`startText`, `endText`, `startIcon`,
  `endIcon`), the events `didChange`, `gotFocus`, `lostFocus`, and the API
  `value`, `setValue`, `focus`.
  - **TextBox:** `type` (`text`, `password`, `search`, `email`),
    `showPasswordToggle`, `passwordVisibleIcon`, `passwordHiddenIcon`,
    `maxLength`, `autoComplete`, `autoCapitalize`, `autoCorrect`,
    `spellCheck`. PasswordInput has the same props.
  - **TextArea:** `rows` (2), `autoSize`, `minRows`, `maxRows`, `resize`,
    `enterSubmits` (default **true**: Enter submits the enclosing form),
    `escResets`; the API adds `insert(text)`.
  - **NumberBox:** `minValue`/`maxValue` (limits of the input), `step`,
    `integersOnly`, `zeroOrPositive`, `hasSpinBox` (true); the value is a
    number or undefined.
- **Checkbox and Switch:** `initialValue`, `indeterminate` (Checkbox),
  `readOnly`, `autoFocus`, `validationStatus`; events `click`, `didChange`,
  `gotFocus`, `lostFocus`; API `value`, `setValue`.
- **RadioGroup** (`RadioGroup.md`, `Option.md`): `Option` children, laid out
  in any structure (an `Items` of them too); `orientation`, `initialValue`
  (""), values are strings ("Numbers and booleans are converted to strings").
- **Slider:** `minValue` (0), `maxValue` (10), `step` (1), `initialValue` (a
  number, or an array: a range with two thumbs), `minStepsBetweenThumbs`
  (1), `showValues`, `valueFormat`; events `didChange` and `didCommit` (the
  drag ended); API `value`, `setValue`, `focus`.
- **ColorPicker:** `initialValue` ("#000000"); a popup to pick or type a
  color.
- **Theme variables:** XMLUI shares `*-Input` variables between the text
  inputs, and has long lists per component (`backgroundColor-checked-Switch`,
  `backgroundColor-track-Slider`, `borderColor-RadioGroupOption--default`, …).

### Here

- `TextBox`, `Select`, `Checkbox` are Mantine components through
  `wrapComponent` (step 16, [../docs/mantine.md](../docs/mantine.md)).
- In a form, `wrapComponent` reads and writes the field, reports focus and
  blur, disables the input and shows the error state
  ([../docs/forms.md](../docs/forms.md)).
- **The validation behavior owns `minLength`, `maxLength`, `minValue`,
  `maxValue`** (with messages and severities). A behavior attaches only for
  trigger props the component does not declare itself.

## Design

### Components

| Component | Mantine | New props (besides `initialValue`, `enabled`, `placeholder`) | Events | API |
|-----------|---------|------|--------|-----|
| `TextBox` | `TextInput`, `PasswordInput` for `type="password"` | `readOnly`, `autoFocus`, `type`, `showPasswordToggle`, adornments, `validationStatus`, `autoComplete`, `autoCapitalize`, `autoCorrect`, `spellCheck` | + `gotFocus`, `lostFocus` | (as is) |
| `PasswordInput` | `PasswordInput` | TextBox's; masked; the toggle with `showPasswordToggle` | as TextBox | as TextBox |
| `TextArea` | `Textarea` | `rows`, `autoSize`, `minRows`, `maxRows`, `resize`, `enterSubmits`, `escResets`, `readOnly`, `autoFocus`, `validationStatus` | as TextBox | + `insert(text)` |
| `NumberBox` | `NumberInput` | `minValue`, `maxValue`, `step`, `integersOnly`, `zeroOrPositive`, `hasSpinBox`, adornments, `readOnly`, `autoFocus`, `validationStatus` | as TextBox | value: a number or undefined |
| `Checkbox` | `Checkbox` | + `indeterminate`, `readOnly`, `autoFocus`, `validationStatus` | + `click`, `gotFocus`, `lostFocus` | (as is) |
| `Switch` | `Switch` | `label`, `initialValue`, `readOnly`, `autoFocus`, `validationStatus` | `click`, `didChange`, `gotFocus`, `lostFocus` | `value`, `setValue` |
| `RadioGroup` | `Radio.Group` | `label`, `orientation`, `readOnly`, `validationStatus`; `Option` children | `didChange`, `gotFocus`, `lostFocus` | `value`, `setValue`, `focus` |
| `Option` | `Radio` (in a RadioGroup) | `value`, `label` (or children), `enabled` | | |
| `Slider` | `Slider`, `RangeSlider` | `label`, `minValue`, `maxValue`, `step`, `minStepsBetweenThumbs`, `showValues`, `valueFormat`, `readOnly`, `validationStatus` | `didChange`, `didCommit`, `gotFocus`, `lostFocus` | `value`, `setValue`, `focus` |
| `ColorPicker` | `ColorInput` | `readOnly`, `autoFocus`, `validationStatus` | `didChange`, `gotFocus`, `lostFocus` | `value`, `setValue`, `focus` |

- **`minValue`/`maxValue` on NumberBox and Slider** are the input's own
  limits, as in XMLUI, and in a form also the validation's range rule: a
  prop the component and an attached behavior both declare goes to both
  (a compiler change; before, the behavior's won).
- **`maxLength` on TextBox stays the validation rule** (with its message and
  severity, step 22). Divergence: in XMLUI it limits typing.
- **`readOnly`:**
  - the text inputs take the native attribute;
  - Checkbox, Switch, RadioGroup, Slider and ColorPicker drop changes.

  This is a new `wrapComponent` option, `value.readOnly`.
- **`validationStatus`** shows the state when no form does: `error` is
  Mantine's error state; `warning` and `valid` are a border color (theme
  variables `borderColor-Input--warning`, `--success`). In a form, the
  field's state wins.
- **`gotFocus`/`lostFocus`** call their handlers without arguments, and
  compose with the form's focus tracking.
- **NumberBox** keeps what is typed (`-`, `1.`) while the value is a number
  or undefined: an inner component holds the text.
- **TextArea `enterSubmits`** submits the enclosing `<form>` on Enter
  (Shift+Enter is a new line); outside a form Enter is a new line.
  `escResets` resets the form (`form.reset()`, as XMLUI; `Form` now handles
  a native reset like `reset()`).
- **RadioGroup** renders its children inside Mantine's `Radio.Group`, in a
  row or a column; `Option` reads the group from Mantine's context, so
  Options can be inside an `Items` or a stack. `label` is the group's own
  (a `<label>` around several radios would label only the first). Outside a
  RadioGroup, `Option` renders nothing (Select's Options are step 25).
- **Slider:** a range when the value is an array; `label` is its own, and
  names the thumbs (`thumbLabel`); `valueFormat` (a function) formats the
  tooltip; `showValues="false"` hides it.
- **The `label` behavior** keeps wrapping TextBox, PasswordInput, TextArea,
  NumberBox and ColorPicker (their input is inside the `<label>`).
- **Theme variables:** like TextBox's for each text input
  (`backgroundColor-`, `textColor-`, `borderColor-`, `borderColor-…--focus`,
  `borderRadius-`), XMLUI's names for the rest: `backgroundColor-checked-Switch`,
  `backgroundColor-checked-RadioGroupOption`, `backgroundColor-track-Slider`,
  `backgroundColor-range-Slider`, `backgroundColor-thumb-Slider`, plus
  `borderColor-Input--error`, `--warning`, `--success`.

### `wrapComponent` additions

- `value.readOnly: "drop"`: with a true `readOnly`, a change is not applied.
- `config.api` also receives `getValue` and `setValue`, which work in a form
  too (TextArea's `insert`).

## Steps

- [x] `wrapComponent`: `readOnly` dropping, `getValue`/`setValue` for the API.
- [x] TextBox additions; PasswordInput; TextArea; NumberBox.
- [x] Checkbox additions; Switch.
- [x] RadioGroup and Option.
- [x] Slider (single and range); ColorPicker.
- [x] Metadata, theme variables, CSS.
- [x] Unit tests; forms with every input.
- [x] Playground: four scenarios (Text inputs, Choice inputs, Input form, Input APIs and theming), E2E tests.
- [x] Docs.

## Verification

- **Unit (jsdom):** each input through compiled markup: initial value,
  change and `didChange`, API, `readOnly`, `enabled`, focus events; each
  bound in a Form (data, validation, reset).
- **E2E:** keyboard input (typing, arrows on NumberBox and Slider, Space
  on a Switch, arrows in a RadioGroup), a password toggle, a TextArea that
  grows and submits on Enter, the color picker, a form with every input
  submitting and resetting.

## Outcome

Reference: [../docs/inputs.md](../docs/inputs.md).

- **Nine inputs and `Option` work** with XMLUI's markup, alone and bound to a
  `Form`:
  - TextBox gained types, adornments, the password toggle, `readOnly`,
    `autoFocus`, `validationStatus` and the focus events;
  - new: PasswordInput, TextArea, NumberBox, Switch, RadioGroup with Option,
    Slider (a value or a range), ColorPicker; Checkbox gained
    `indeterminate`, `readOnly`, `click`.
- **`wrapComponent`:** `value.readOnly: "drop"`; the API context has
  `getValue`/`setValue`.
- **The compiler:** a prop the component and an attached behavior both
  declare goes to both.
- **The playground:** Text inputs, Choice inputs, Input form, and Input APIs
  and theming (`setValue`, `focus`, inputs in sync, Enter in a TextArea,
  icons, theme variables in a scoped `Theme`), each with an E2E test.
- **Evidence:** `npm run check` passes and prints no warnings: 2,743 unit
  tests in 96 files, 198 E2E tests. New: `inputs.test.tsx` (44),
  `wrap.test.tsx` (+2), three E2E tests with real keyboard input.
- **Sizes (hello app):**
  - the entry chunk went from 674 KB to 816 KB (193 → 232 KB gzipped);
  - `gfui.js` went from 923 KB to 1,051 KB (304 KB gzipped).

### Findings

- **Behavior props used to win over the component's own.** Inside a form,
  NumberBox's `minValue` went only to the validation behavior, and the
  input lost its limits. Found by reading the compiled code while writing a
  test; such a prop now goes to both.
- **Mantine's error state never turned an input red.** Our unlayered
  `--input-bd` redirects overrode Mantine's layered error color, in step
  22's forms too (their tests checked only `aria-invalid`). The E2E test of
  `validationStatus` found it; an unlayered error rule fixes it.
- **RangeSlider has its own static class names** (`mantine-RangeSlider-*`),
  so the Slider's theme CSS missed range sliders; ColorInput names its
  picker's parts `mantine-ColorInput-*`. Both found by E2E tests.
- **A popup inside a `<label>` joins the input's accessible name.** The label
  behavior wraps the whole input, so ColorPicker uses its own label. Select
  (step 16) has the same structure: its open dropdown is inside the label.
  Adornments and the color preview are `aria-hidden` for the same reason.
- **`valueFormat` must be code as a literal** (`code: true`), as XMLUI's
  default `"(value) => value.toString()"` shows; it arrived as a string.
- **`borderRadius-<Input>` never applied** (TextBox's since step 16, the new
  inputs' and Select's too): the redirects set Mantine's color variables but
  not `--input-radius`. The "Input APIs and theming" E2E test, which sets
  the radius in a scoped `Theme`, found it; a wrapper rule per input fixes it.
- **Mantine animates border colors (100 ms):** a test that reads a color
  right after a change sees a value halfway through; the tests poll.
- **The bundle keeps growing with every batch** (+142 KB here,
  `react-number-format` alone 36 KB). Every built-in ships in every app.
  Probably the top-level `wrapComponent(...)` calls, which a bundler keeps
  unless marked pure. `/* @__PURE__ */` plus `"sideEffects": false` could let
  unused built-ins drop. Not tried in this step.

### Divergences from XMLUI

| XMLUI | gfui | Why |
|-------|------|-----|
| TextBox `maxLength` limits typing | The validation rule (with message and severity, step 22) | Forms already use it; typing limits can come later |
| `escResets` (form reset) and `enterSubmits` | The same, through `form.reset()` / `requestSubmit()` | — (same behavior) |
| Shared `*-Input` theme variables for the text inputs | TextBox's five per input (`backgroundColor-NumberBox`, …), plus shared `borderColor-Input--error/--warning/--success` | Consistent with step 16 |
| ColorPicker: a label through the form item | Its own `label` prop | The popup must not be inside a `<label>` |
| Many theme variables per component (Switch 20+, Slider 20+) | The ones the components read | As in step 23 |

### Open for later steps

- **Size:** let unused built-ins drop (`@__PURE__`, `sideEffects`).
- **Select's dropdown inside the label** (step 25, with Option children for
  Select).
- **Not done:** `spinnerUpIcon`/`spinnerDownIcon`, `invalidMessages`,
  `verboseValidationFeedback`, `validationIconSuccess`/`Error`, Checkbox
  `inputTemplate`, Slider `rangeStyle`/`thumbStyle`, `gap` on the text
  inputs, a `maxLength` typing limit.
