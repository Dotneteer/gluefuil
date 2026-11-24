# Forms

> Subsystem reference: `Form`, inputs bound to it with `bindTo` (the
> `formBinding` and `validation` behaviors), the form store, validation and
> its display, and the submit flow. Describes the code as it is. Design and
> XMLUI comparison: [`../plan/poc-22-forms.md`](../plan/poc-22-forms.md).
>
> **Last updated:** step 22 (client-side forms; `submitUrl` and server
> errors come in step 22B).

## Using it

```xml
<Form id="signup" data="{ { name: '', address: { city: '' }, role: 'user' } }"
      onSubmit="(data) => saveUser(data)" onSuccess="(result) => …" dataAfterSubmit="reset">
  <TextBox bindTo="name" label="Name" required minLength="2"/>
  <TextBox bindTo="email" label="Email" required pattern="email"
           onValidate="(value) => isTaken(value) ? 'Already registered' : null"/>
  <TextBox bindTo="address.city" label="City" maxLength="10" lengthInvalidSeverity="warning"/>
  <Select bindTo="role" label="Role" options="{['user', 'admin']}"/>
  <Checkbox bindTo="agree" label="I agree" required/>
  <Text>Preview: {$data.name}</Text>
</Form>
<Text>Dirty: {signup.isDirty()}</Text>
```

**There is no `FormItem`** (the user's decision). Any component with a
`value` and a `setValue` API binds: `TextBox`, `Select` and `Checkbox` now,
and every input of steps 24–26.

### Form

| Kind | Name | What it does |
|------|------|--------------|
| Prop | `data` | The initial data (an object), copied and frozen. Later changes are not applied (XMLUI). |
| Prop | `enabled` | false: every bound input and the buttons are disabled. |
| Prop | `saveLabel`, `saveInProgressLabel`, `cancelLabel` | "Save", "Saving...", "Cancel". |
| Prop | `hideButtonRow`; template `buttonRowTemplate` (`$data`) | No buttons; or your own row (call `form.submit()`). |
| Prop | `dataAfterSubmit` | `keep` (default), `reset` (back to the baseline), `clear`. |
| Event | `willSubmit(data, allData)` | After validation. `false` cancels; an object replaces the submitted data. `allData` includes `noSubmit` inputs. |
| Event | `submit(data)` | Submits. Its result goes to `success`; a throw is a failed submit. Without it the submit succeeds with `undefined` (step 22B adds `submitUrl`). |
| Event | `success(result)`, `submitError(error)` | After a submit. Without `submitError`, the error is reported. |
| Event | `cancel`, `reset`, `dirtyChanged(dirty)` | The Cancel button (the data stays); a reset (the method, or `dataAfterSubmit` reset/clear only); each dirty transition. |
| API | `reset(data?)` | Back to the baseline; with an object, that becomes the baseline. Other arguments are ignored (XMLUI). |
| API | `update(change)` | Values by path: `update({ name: 'Ann', 'address.city': 'Paris' })`. Marks them dirty. |
| API | `validate()` | A promise of `{ isValid, errors, warnings, data }` (messages by path), after pending checks finish. Shows nothing. |
| API | `getData()`, `isDirty()`, `setDirty(dirty)`, `submit()` | The data to submit; dirty (reactive); mark dirty or clean; submit as Save does. |
| API | `isSubmitting`, `hasErrors` | Reactive. |
| Context | `$data` | The current values without `noSubmit` inputs, for the attributes and children of the Form. |

### A bound input

| Prop | Behavior | Meaning |
|------|----------|---------|
| `bindTo` | formBinding | The path of the form's data it edits: `name`, `address.city`, `items[0].x`. |
| `noSubmit` | formBinding | Left out of `$data`, `getData()` and the submitted data. |
| `initialValue` (the input's own) | — | The field's value while the data has nothing at the path; written into the data when the input mounts (and after a reset). |
| `required`, `requiredInvalidMessage` | validation | Not empty: `undefined`, `null`, a blank string, `false`, `{}`, `[]` are empty. When it fails, no other rule runs. |
| `minLength`, `maxLength`, `length…Message/Severity` | validation | Strings only. |
| `minValue`, `maxValue`, `range…Message/Severity` | validation | Numbers or numeric strings (each item of an array). |
| `pattern`, `pattern…Message/Severity` | validation | `email`, `url` (http/https), `phone` (XMLUI's built-ins). |
| `regex`, `regex…Message/Severity` | validation | `^\d+$`, or `/^a/i` with flags (`g`/`y` dropped). An invalid expression fails. |
| `matchValue`, `matchInvalidMessage` | validation | `Object.is` equal (a confirmation field). Always an error. |
| `onValidate` | validation (event) | `(value)` → null, a message, `false`, `{ isValid, invalidMessage, severity }`, or an array of them; a promise of one too. |
| `validationMode` | validation | `errorLate` (default), `onChanged`, `onLostFocus`. |
| `customValidationsDebounce`, `validationDisplayDelay` | validation | ms before `onValidate` runs after a change; a slower check shows its result when it settles, even while focused. |

- **Severities:** `error` (default) blocks the submit; `warning` shows and
  doesn't. Empty values pass every rule except `required`.
- **Without `bindTo`** the rule props are unknown props (E020): the
  behaviors attach only with it. Outside a `Form`, a bound input works
  unbound and the problem is reported once.

## When messages show

`isShown(mode, flags)` (`runtime/src/forms/display.ts`), after XMLUI's
`useValidationDisplay` and its form reducer's interaction flags:

| Mode | Shows |
|------|-------|
| `errorLate` | Not before the input is dirty. When it loses the focus invalid. Focused again after that: until the value turns valid. |
| `onChanged` | As soon as it is dirty. |
| `onLostFocus` | Dirty, not focused, and invalid when it lost the focus. |
| (any) | After a submit attempt, until the input is edited. |

- **"Valid" at focus and blur means known valid:** no invalid result *and
  no check running*. XMLUI counts a running check as valid, so a late
  "Already registered" stays hidden unless `validationDisplayDelay` is set.
- **Stale results:** while a new custom check runs, the previous custom
  results stay, marked stale (`data-stale`, half opacity).

## The form store (`runtime/src/forms/`)

| File | Contents |
|------|----------|
| `paths.ts` | `parseFieldPath`, `getAt`, `setAt` (copies along the path, creates missing objects and arrays), `deleteAt` |
| `rules.ts` | `validateRules`, `isEmptyValue`, `PATTERNS`, `parseRegex`, `customResults`, `highestSeverity` |
| `display.ts` | `InteractionFlags`, `INITIAL_FLAGS`, `isShown` |
| `store.ts` | `FormStore`, `FormField`, `FieldOptions`, `DEFAULT_FIELD_OPTIONS` |
| `react.ts` | `FormProvider`/`useFormStore`, `FieldBindingProvider`/`useFieldBinding` |

- **`FormStore`:** `values` (a signal of the frozen working copy),
  `fields`, `submitting`, `generalErrors`, `enabledProp`, and the computed
  `enabled`, `dirty`, `data` (`$data`) and `hasErrors`.
  - `setValue(keys, value)` writes and marks the fields at that path dirty
    (their forced display ends); `writeValue` writes without (initial
    values).
  - `validate()` awaits every field's `settled()`.
  - `markClean()`, `showAll()`, `firstInvalid()`, `reset(data?)`,
    `clear()`.
- **`FormField`:** one per bound input (two inputs may bind one path).
  - `value` is the data at its path, or the input's initial value.
  - `results` are the rules' results plus the custom ones; `severity`, `shown`.
  - `attach()`/`detach()` in a layout effect. Detach keeps the value (XMLUI).
  - **No custom check at mount:** it runs on each change (debounced), and
    `settled()` runs it for an unchecked value. A handler called from a
    layout effect could find its slot not yet reactivated after StrictMode's
    simulated unmount.
  - **A check that throws** is reported and becomes an error result
    ("The check failed: …"), so the field is never stuck pending.
  - `focusTarget`: set by the input, for the focus after a failed submit.

## How an input binds

- **The behaviors** (`components/src/behaviors-metadata.ts`, see
  [behaviors.md](behaviors.md)): both trigger on `bindTo` and need a value
  API (`requiresValueApi`). The order, innermost first: `label`,
  `formBinding`, `validation`, `tooltip`, `variant`.
  - `ValidationBehavior` renders nothing; it provides the rules (and the
    `onValidate` handler) by context.
  - `FormBindingBehavior` creates the field, provides the field binding,
    and renders `<span class="pfui-Field" data-required>`: the labelled
    input, then `<span class="pfui-Field-messages" aria-live="polite">` with
    one `.pfui-ValidationMessage[data-severity]` per shown result (errors
    first). The messages are outside the `<label>`, so they are not part of
    the input's accessible name.
- **`wrapComponent`** (`runtime/src/render/wrap.ts`): a value component that
  finds a field binding reads and writes the field instead of its own signal.
  - Its `initialValue` goes to `field.setInitial`. Its `value`/`setValue`
    API is the field.
  - Focus and blur reach the field.
  - It is disabled while the form is disabled or submitting.
  - A shown error sets Mantine's `error` (red border, `aria-invalid`).
  - `aria-describedby` points to the messages. It is set on the element
    through the ref, because Mantine's inputs override the prop.
  - It provides `null` to its templates and children, so an input inside
    an option template is not bound.
- **The required mark** is CSS:
  `.pfui-Field[data-required] > .pfui-Label > .pfui-Label-text::after`.

## `$data`: context variables without a template

`ComponentMetadata.childContextVars` (`Form`: `["$data"]`):

- The compiler wraps the element in a container that creates a context scope
  (`$$useContextScope($$p, ["$data"])`). It compiles the element's
  attributes and children in it, and passes it to the component as
  `contextScope`.
- The component fills it while it renders (`provideContext(contextScope, {
  $data: () => … })`), before its children render. Server rendering sees it
  too.
- Unlike a template (`Items`), the children are compiled in place: their IDs
  stay file-scoped (`<Form><TextBox id="x"/></Form>` → `x.value` outside).
- Runtime: `runtime/src/render/context-scope.ts` (`createContextScope`,
  `useContextScope`, `provideContext`).

## Submit (part A)

1. Ignored while a submit runs or the form is disabled.
2. Every field shows its results (`showAll`). `validate()` awaits pending
   checks. Any error: the focus moves to the first invalid input, and it
   stops there.
3. Warnings don't block, and nothing asks to confirm them (no modal before
   step 27).
4. `submitting` disables the inputs and the buttons; the Save button says
   `saveInProgressLabel`.
5. `willSubmit`, then `submit`.
6. Success: `markClean`, then `success(result)`, then `dataAfterSubmit` (and
   `reset` only when it resets).
7. A throw: its message goes to the summary at the top (`role="alert"`,
   default "Couldn't save the form."), then `submitError(error)` (or the error
   is reported). The data stays.

## Divergences from XMLUI

- **No `FormItem`, no `FormValidator`:** inputs bind through the behaviors.
- **Empty values pass `minValue`/`maxValue`;** the range messages say "at
  least" and "at most" (XMLUI: "bigger than" for `>=`).
- **`validate()` waits for pending checks;** a submit does too (XMLUI blocks
  the submit while checks run).
- **A throwing `onValidate` is an error result,** not a locked form.
- **A running check is not "valid"** at focus and blur (above).
- **`noSubmit` works on nested paths.**
- **`reset` fires only when the form resets** (XMLUI: after every success).
- **Warnings are not confirmed** (no modal yet).
- **`validator`/`validatorParams` are not supported** (they do nothing in
  XMLUI); `pattern` takes the built-in names.
- **The label wraps only the input;** XMLUI's binding wrapper renders the
  label itself.

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/forms/rules.test.ts` | Tables: emptiness, every rule (messages, severities, empty values), `parseRegex`, `customResults`, `highestSeverity`, `isShown` (every mode and flag), paths |
| `runtime/tests/forms/store.test.ts` | Values by path (frozen), initial values, dirty tracking, `noSubmit`, the errorLate display, `showAll`, a debounced custom check (stale, latest wins), a throwing check, a check running at blur, `validate()`, reset/clear, detach |
| `runtime/tests/forms/binding.test.tsx` | `wrapComponent` with a binding (reads, writes, disabled while submitting; its template and children unbound); the context scope |
| `compiler/tests/module/forms.test.ts` | `$data` inside and outside, IDs inside a Form, rule props and their literal checks, attachment only with `bindTo` and a value API, behavior events (E004), Form's events; the context container and the behavior order in the generated code |
| `components/tests/forms.test.tsx` | Typing and `$data` (nested), initial values, errorLate and the other modes, a submit attempt (focus, no submit), warnings, `willSubmit`, a failing submit, `dataAfterSubmit` and `reset()`, `dirtyChanged` and `update()`, Select and Checkbox, `onValidate` (async, throwing), `validate()`, the required mark and `enabled`, IDs inside, `buttonRowTemplate`, outside a Form |
| `e2e/forms.spec.ts` (projects `forms-dev` 5186, `forms-build` 5187) | `test-apps/forms`: late errors and `aria-describedby`; Save with errors; keyboard only with Enter, Saving..., a warning, clean afterwards; an async check; the select and the required marks |
