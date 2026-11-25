# Inputs

> Subsystem reference: the input components (step 24 batch, with step 16's
> TextBox and Checkbox). Describes the code as it is. Design and XMLUI
> comparison: [`../plan/poc-24-inputs.md`](../plan/poc-24-inputs.md).
> `Select` and `Button` are in [mantine.md](mantine.md); binding to a form is
> in [forms.md](forms.md).
>
> **Last updated:** step 24.

## The components (`components/src/inputs.tsx`)

| Component | Mantine | Props (besides `initialValue`) | Events | API |
|-----------|---------|-------|--------|-----|
| `TextBox` | `TextInput`; `PasswordInput` for `type="password"` | `type` (`text`, `password`, `search`, `email`), `placeholder`, adornments, password toggle props, text-entry attributes | `didChange`, `gotFocus`, `lostFocus` | `value`, `setValue`, `focus` |
| `PasswordInput` | `PasswordInput` | as TextBox, always masked; the toggle with `showPasswordToggle` | as TextBox | as TextBox |
| `TextArea` | `Textarea` | `rows`, `autoSize`, `minRows`, `maxRows`, `resize`, `enterSubmits`, `escResets`, `placeholder` | as TextBox | + `insert(text)` |
| `NumberBox` | `NumberInput` | `minValue`, `maxValue`, `step`, `integersOnly`, `zeroOrPositive`, `hasSpinBox`, adornments, `placeholder` | as TextBox | `value` (a number or undefined), `setValue`, `focus` |
| `Checkbox` | `Checkbox` | `label`, `indeterminate` | `click`, `didChange`, `gotFocus`, `lostFocus` | `value`, `setValue`, `focus` |
| `Switch` | `Switch` | `label` | `click`, `didChange`, `gotFocus`, `lostFocus` | `value`, `setValue`, `focus` |
| `RadioGroup` | `Radio.Group` | `label`, `orientation`; `Option` children | `didChange`, `gotFocus`, `lostFocus` | `value` (a string), `setValue`, `focus` |
| `Option` | `Radio` | `value`, `label` (or children), `enabled` | | |
| `Slider` | `Slider`, `RangeSlider` | `label`, `minValue` (0), `maxValue` (10), `step` (1), `minStepsBetweenThumbs`, `showValues`, `valueFormat` (code) | `didChange`, `didCommit`, `gotFocus`, `lostFocus` | `value` (a number or `[from, to]`), `setValue`, `focus` |
| `ColorPicker` | `ColorInput` | `label` (its own), `placeholder` | `didChange`, `gotFocus`, `lostFocus` | `value` (hex), `setValue`, `focus` |

Every input also has `enabled`, `readOnly`, `autoFocus` and
`validationStatus`. In a `Form`, any of them binds with `bindTo` and takes
the validation props ([forms.md](forms.md)).

### How they work

- **Each is `wrapComponent`** around a Mantine component, or around a small
  native component of ours that adapts Mantine's (`TextNative`,
  `TextAreaNative`, `NumberNative`, `RadioGroupNative`, `SliderNative`).
  `withLayout` (`layout-wrap.tsx`) applies the layout props to the root.
- **Handlers get no arguments,** except the value events. `gotFocus` and
  `lostFocus` compose with the form's focus tracking.
- **`readOnly`:**
  - the text inputs take the native attribute;
  - Checkbox, Switch, RadioGroup, Slider and ColorPicker drop changes
    (`value.readOnly: "drop"` in `wrapComponent`) and set `aria-readonly`
    where there is an input.
- **`validationStatus`** without a form:
  - `error` is Mantine's error state (`aria-invalid`, a red border);
  - `warning` and `valid` put `data-validation` on the root, and the CSS
    colors the border.

  The colors are `borderColor-Input--error`, `--warning`, `--success`. In a
  form, the field's state wins.
- **Adornments** (`startText`, `endText`, `startIcon`, `endIcon`) are
  Mantine's sections, sized for their content and `aria-hidden`: the label
  wraps the input, and they must not join its accessible name.
- **TextBox `type="password"`** renders PasswordInput; its toggle shows only
  with `showPasswordToggle`. Mantine shows a toggle for an undefined right
  section, so we pass `false`. The icons are `passwordVisibleIcon` and
  `passwordHiddenIcon` (eye and eye-off).
- **TextArea** (XMLUI `TextAreaReact.tsx` 255–267):
  - in a form, Enter submits it (`form.requestSubmit()`); Shift+Enter, or
    `enterSubmits="false"`, makes a new line;
  - Escape resets the form with `escResets` (`form.reset()`, which `Form`
    handles like `reset()`);
  - outside a form both keys are ordinary;
  - `insert(text)` replaces the selection, through the API context's
    `getValue`/`setValue`, in a form too.
- **NumberBox** keeps the typed text (`-`, `1.`) in an inner state, while the
  value is what it parses to (`parseNumberInput`). A different value from
  outside replaces the text. The limits clamp on blur (Mantine's
  `clampBehavior: "blur"`).
- **RadioGroup:**
  - renders its children inside `Radio.Group`, in
    `.gfui-RadioGroup-options[data-orientation]`;
  - `Option` finds the group through Mantine's context and ours (disabled,
    read-only), so Options can be anywhere inside (an `Items`, a stack);
  - values are strings (`radioValue`, as XMLUI);
  - focus and blur count only when the focus enters or leaves the group;
  - `focus()` moves to the checked option, or the first enabled one;
  - an `Option` outside a RadioGroup renders nothing; inside a Select or
    AutoComplete it is data ([choice.md](choice.md)).
- **Slider:**
  - an array value is a `RangeSlider` (`minRange` = `minStepsBetweenThumbs` × `step`);
  - the label is its own, and names the thumbs (`thumbLabel`, or
    `thumbFromLabel` and `thumbToLabel`);
  - `valueFormat` is code even as a literal (`code: true`, as XMLUI);
  - `didCommit` is Mantine's `onChangeEnd`;
  - Slider and RangeSlider have different static class names
    (`mantine-RangeSlider-*`); the CSS covers both.
- **ColorPicker** has its own `label` (Mantine's `<label for>`), not the label
  behavior's wrapper: its popup must not be inside a `<label>`, where it
  would join the input's accessible name. The preview swatch is
  `aria-hidden`, and there is no eye-dropper button. Inside ColorInput, the
  picker's parts are named `mantine-ColorInput-*`.

### A prop both the input and a behavior declare

NumberBox and Slider declare `minValue` and `maxValue`, which the validation
behavior has too. Since step 24 such a prop goes to both: the input limits
itself, and the range rule, with its message and severity, validates
(`compile-module.ts`; [behaviors.md](behaviors.md)). Before, behavior props
won, and the input lost its limits inside a form. `maxLength` stays the
validation rule only (TextBox doesn't declare it). Divergence: in XMLUI
`maxLength` limits typing.

## Theme variables

- Each text input has TextBox's five (`backgroundColor-`, `textColor-`,
  `borderColor-`, `borderColor-…--focus`, `borderRadius-`) with its own name
  (`TEXT_INPUTS` in `styles.ts`).
- `borderColor-Input--error`, `--warning`, `--success`,
  `textColor-adornment-Input`.
- `backgroundColor-checked-Switch`, `backgroundColor-Switch`,
  `backgroundColor-indicator-Switch`.
- `backgroundColor-checked-RadioGroupOption`.
- `backgroundColor-track-Slider`, `backgroundColor-range-Slider`,
  `backgroundColor-thumb-Slider`, `borderColor-thumb-Slider`.
- **The radius:** `borderRadius-<Input>` is Mantine's `--input-radius`, set
  on `.mantine-Input-wrapper` (the input and its sections read it). It was
  missing for every text input and Select until the step 24 theming E2E
  test.
- **Mantine's error state:** our unlayered redirects of `--input-bd`
  overrode Mantine's layered error color, so an input in error was never
  red, in forms too (step 22). `.gfui-App .mantine-Input-input[data-error]`
  sets it again, after the focus rule. Found by the step 24 E2E test.

## Size

| Build | Step 23 | Step 24 |
|-------|---------|---------|
| Hello app, entry chunk | 674 KB (193 KB gzipped) | 816 KB (232 KB gzipped) |
| Hello app, `index.html` (prerendered, CSS inlined) | 177 KB | 223 KB (30 KB gzipped) |
| `gfui.js` | 923 KB (270 KB gzipped) | 1,051 KB (304 KB gzipped) |

The growth (sizes before minification):

- `react-number-format`, NumberInput's dependency: 36 KB;
- Mantine's Slider 27 KB, NumberInput 22 KB, ColorPicker 20 KB, Radio 11 KB.

Every built-in ships in every app; the fixtures' `chunkSizeWarningLimit` is
900 kB.

## Files

| File | Contents |
|------|----------|
| `components/src/inputs.tsx` | Every input, `Option`, `parseNumberInput`, `radioValue`, `sliderValue`, `colorValue`, `enabledToDisabled`, `focusApi` |
| `components/src/layout-wrap.tsx` | `withLayout` |
| `runtime/src/render/wrap.ts` | `value.readOnly`, the API context's `getValue`/`setValue` |
| `compiler/src/module/compile-module.ts` | A prop declared by the component and an attached behavior goes to both |

## Tests

| File | Covers |
|------|--------|
| `components/tests/inputs.test.tsx` | Each input through markup: types, adornments, readOnly, autoFocus, focus events, validation states; TextArea rows, insert, Enter and Escape in a form; NumberBox parsing, partial text, setValue, clamping; Switch and Checkbox; RadioGroup with Options from Items, strings, disabled, readOnly, focus; Slider keys, commit, ranges, readOnly, `valueFormat` as code; ColorPicker; every input bound in a Form (load, submit with types, reset); required on a Switch and a RadioGroup; a shared prop going to both; the radius redirect for each text input and Select |
| `runtime/tests/render/wrap.test.tsx` | `value.readOnly: "drop"`; `getValue`/`setValue` in the API context |
| `e2e/playground-scenarios.spec.ts` (Text inputs, Choice inputs, Input form) | Real typing and keys: read-only, focus events, validation colors (settled after Mantine's 100 ms transition), the password toggle, TextArea insert and auto size, NumberBox arrows, clamping, integers, no negatives; Space on a switch, arrows in a radio group and on sliders, a range's formatted tooltip and theme color, the color picker's popup; a form with every input: errors block, values keep their types, Enter submits, Escape resets |
| `e2e/playground-scenarios.spec.ts` (Input APIs and theming) | `setValue` on every input and the reactive `value`s; `focus()` on a text box, a radio group (the checked option, else the first) and a slider; a Slider and a NumberBox kept in sync; Enter sends and resets a chat form, Shift+Enter, an empty message blocked; `enterSubmits="false"` and `resize`; the password toggle's own icons, adornment icons, `showValues="false"`; theme variables in a scoped `Theme` (checkbox, switch, radio, slider, text box color and radius) |
