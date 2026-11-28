# Forms

> Subsystem reference: `Form`, inputs bound to it with `bindTo` (the
> `formBinding` and `validation` behaviors), the form store, validation and
> its display, the submit flow, and server errors. Describes the code as it
> is. Design and XMLUI comparison: [`../plan/poc-22-forms.md`](../plan/poc-22-forms.md)
> and [`../plan/poc-22b-forms-submit.md`](../plan/poc-22b-forms-submit.md).
>
> **Last updated:** step 22B (`submitUrl`, `data` as a URL, server errors,
> `cancel()`).

## Using it

```xml
<Form id="signup" data="{ { name: '', address: { city: '' }, role: 'user' } }"
      onSubmit="(data) => saveUser(data)" onSuccess="(result) => …" dataAfterSubmit="reset">
  <TextBox bindTo="name" label="Name" required minLength="2"/>
  <TextBox bindTo="email" label="Email" required pattern="email"
           onValidate="(value) => isTaken(value) ? 'Already registered' : null"/>
  <TextBox bindTo="address.city" label="City" maxLength="10" lengthInvalidSeverity="warning"/>
  <Select bindTo="role" label="Role" data="{['user', 'admin']}"/>
  <Checkbox bindTo="agree" label="I agree" required/>
  <Text>Preview: {$data.name}</Text>
</Form>
<Text>Dirty: {signup.isDirty()}</Text>
```

**There is no `FormItem`** (the user's decision). Any component with a
`value` and a `setValue` API binds: `TextBox`, `PasswordInput`, `TextArea`,
`NumberBox`, `Checkbox`, `Switch`, `RadioGroup`, `Slider`, `ColorPicker`
(step 24, [inputs.md](inputs.md)), `DateInput`, `TimeInput`, `DatePicker` (step 26, [dates.md](dates.md); a
DateInput's `minValue`/`maxValue` are its own dates, not the range rule),
`Select` and `AutoComplete` (step 25,
[choice.md](choice.md); with several values the field is an array, and
`required` wants one). A native reset of the
`<form>` (TextArea `escResets`) does what `reset()` does.

### Form

| Kind | Name | What it does |
|------|------|--------------|
| Prop | `data` | The initial data, copied and frozen: an object, or a URL ([below](#data-as-a-url)). Later changes are not applied (XMLUI). |
| Prop | `submitUrl`, `submitMethod` | Without `onSubmit`: the data goes there through the data layer ([below](#submitting-to-a-url)). Default URL: `data`'s; method: `put` when `data` is set, else `post`. |
| Prop | `enabled` | false: every bound input and the buttons are disabled. |
| Prop | `saveLabel`, `saveInProgressLabel`, `cancelLabel` | "Save", "Saving...", "Cancel". |
| Prop | `hideButtonRow`; template `buttonRowTemplate` (`$data`) | No buttons; or your own row (call `form.submit()`). |
| Prop | `dataAfterSubmit` | `keep` (default), `reset` (back to the baseline), `clear`. |
| Event | `willSubmit(data, allData)` | After validation. `false` cancels; an object replaces the submitted data. `allData` includes `noSubmit` inputs. |
| Event | `submit(data)` | Submits; wins over `submitUrl`. Its result goes to `success`; a throw is a failed submit. Without it and without a URL, the submit succeeds with `undefined`. |
| Event | `success(result)`, `submitError(error, problem)` | After a submit. `problem` is the server's validation problem (`{ fields, detail }`) or undefined. Without `submitError`, an error that is not a `DataError` is reported (the server's answers are shown in the form). |
| Event | `cancel`, `reset`, `dirtyChanged(dirty)` | The Cancel button (the data stays); a reset (the method, or `dataAfterSubmit` reset/clear only); each dirty transition. |
| API | `reset(data?)` | Back to the baseline; with an object, that becomes the baseline. Other arguments are ignored (XMLUI). |
| API | `update(change)` | Values by path: `update({ name: 'Ann', 'address.city': 'Paris' })`. Marks them dirty. |
| API | `validate()` | A promise of `{ isValid, errors, warnings, data }` (messages by path), after pending checks finish. Shows nothing. |
| API | `getData()`, `isDirty()`, `setDirty(dirty)`, `submit()` | The data to submit; dirty (reactive); mark dirty or clean; submit as Save does. |
| API | `isSubmitting`, `hasErrors`, `cancelled` | Reactive. |
| API | `cancel()` | Stops a running request to a URL: no `success`, no `submitError`, no summary; the data stays. Does nothing to an `onSubmit` handler. |
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

### Translated messages (step 34)

The built-in messages (required, length, range, email, URL, phone, invalid
input), the Save/Cancel/Saving... labels and the warnings dialog are `gfui.*`
keys in the active locale ([i18n.md](i18n.md#framework-strings-decision-d1)). A
`requiredInvalidMessage`, `saveLabel` or similar prop still wins.

## The form store (`runtime/src/forms/`)

| File | Contents |
|------|----------|
| `paths.ts` | `parseFieldPath`, `getAt`, `setAt` (copies along the path, creates missing objects and arrays), `deleteAt` |
| `rules.ts` | `validateRules`, `isEmptyValue`, `PATTERNS`, `parseRegex`, `customResults`, `highestSeverity` |
| `display.ts` | `InteractionFlags`, `INITIAL_FLAGS`, `isShown` |
| `server-errors.ts` | `extractServerProblem`, `ServerProblem`, `ServerFieldError` (step 22B) |
| `store.ts` | `FormStore`, `FormField`, `FieldOptions`, `DEFAULT_FIELD_OPTIONS` |
| `react.ts` | `FormProvider`/`useFormStore`, `FieldBindingProvider`/`useFieldBinding` |

- **`FormStore`:** `values` (a signal of the frozen working copy),
  `fields`, `submitting`, `generalErrors`, `enabledProp`, `loading`,
  `cancelled`, `serverResults`, and the computed `enabled`, `dirty`, `data`
  (`$data`) and `hasErrors`. `applySubmitError`, `dropServerResults`,
  `firstServerInvalid` (step 22B).
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
    and renders `<span class="gfui-Field" data-required>`: the labelled
    input, then `<span class="gfui-Field-messages" aria-live="polite">` with
    one `.gfui-ValidationMessage[data-severity]` per shown result (errors
    first). The messages are outside the `<label>`, so they are not part of
    the input's accessible name.
- **`wrapComponent`** (`runtime/src/render/wrap.ts`): a value component that
  finds a field binding reads and writes the field instead of its own signal.
  - Its `initialValue` goes to `field.setInitial`. Its `value`/`setValue`
    API is the field.
  - Focus and blur reach the field.
  - It is disabled while the form is disabled or submitting.
  - A shown error sets Mantine's `error` (red border, `aria-invalid`). The
    red border works only since step 24: our `--input-bd` redirects had
    overridden Mantine's error color ([inputs.md](inputs.md#theme-variables)).
  - `aria-describedby` points to the messages. It is set on the element
    through the ref, because Mantine's inputs override the prop.
  - It provides `null` to its templates and children, so an input inside
    an option template is not bound.
- **The required mark** is CSS:
  `.gfui-Field[data-required] > .gfui-Label > .gfui-Label-text::after`.

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
- **The element's own attributes** are computed before it renders, so they may
  read a name before its getter exists (`<ModalDialog title="{$param}">`):
  such a read depends on a version signal, bumped in a microtask once the
  getter arrives, and is computed again (step 27).

## In a ModalDialog (step 27)

- The form's dirty state counts as the dialog's (`DialogContext`,
  [overlays.md](overlays.md)): closing a dialog with unsaved edits asks first.
- Cancel fires `cancel`, then closes the dialog (asking if dirty). A
  successful submit closes it unless `keepModalOpenOnSubmit`.
- `inProgressNotificationMessage`, `completedNotificationMessage`,
  `errorNotificationMessage`: a loading toast while submitting, replaced by
  the outcome's (any Form, not only in a dialog).

## Submit

1. Ignored while a submit runs, or while the form is disabled or loading.
2. The previous server results and summary are cleared; every field shows
   its results (`showAll`). `validate()` awaits pending checks. Any error: the
   focus moves to the first invalid input, and it stops there.
3. Warnings don't block, but are confirmed first (step 27, `confirm()`:
   "Are you sure want to move forward?", the warnings listed; "No" stops).
4. `submitting` disables the inputs and the buttons; the Save button says
   `saveInProgressLabel`.
5. `willSubmit`, then `onSubmit`, or the request to the URL.
6. Success: `markClean`, then `success(result)`, then `dataAfterSubmit` (and
   `reset` only when it resets).
7. A cancelled request: `cancelled` is set, nothing else happens.
8. A failure: `applySubmitError` (below), the focus on the first input with a
   server error (after the inputs re-render enabled), then
   `submitError(error, problem)`. The data stays.

## Submitting to a URL

- **Without `onSubmit`,** the URL is `submitUrl`, or `data`'s when it is one.
  The form's own `ApiCaller` (APICall's core, `runtime/src/data/api-call.ts`)
  sends `{ url, method, body: data }`: no retries, a 30 s timeout. After a
  success it invalidates every query (XMLUI's default), so a `DataSource`
  showing the same records refetches. No code is generated (XMLUI builds a
  handler string with the URL interpolated unescaped).
- **Cancelling:** `cancel()` is `ApiCaller.cancel("user")`; unmounting the
  form disposes it (`unmount`). The form's submit starts from a click, not
  from a handler, so no handler's `$cancel` is involved.

## `data` as a URL

- A string `data` that `isDataUrl` accepts (`/…`, `./…`, `../…`, `http(s)://`)
  is loaded through the data layer (`useDataUrlState`, as `Items data="/api/…"`).
  The store's `loading` disables the form and the buttons meanwhile; on the
  server nothing is fetched, so the prerendered form is empty and disabled
  and the takeover is clean.
- **The first value becomes the baseline** (`store.reset(value)`). Later
  values (the refetch after our own save invalidates every query) are
  ignored, as later `data` changes are.
- **A failed load:** "Couldn't load the form's data: <message>" in the
  summary; the form stays disabled.

## Server errors (`runtime/src/forms/server-errors.ts`)

`extractServerProblem(error)`, after XMLUI's `server-error-mapping.ts`:

- **Where:** the error, then its `data`, `body` (a `DataError`'s parsed
  response), `payload`, `problem`, `details`, `response`, `response.data`.
  The first with a recognized shape wins.
- **The shapes, in order:**
  1. RFC 7807 / 9457 `invalid-params` (or `invalidParams`): `[{ name, reason | detail }]`;
  2. Spring `errors: [{ field | objectName, defaultMessage | message | reason }]`;
  3. Laravel `errors: { field: ["msg"] | "msg" }` (the first message);
  4. XMLUI's legacy `details.issues` (or `issues`): `[{ field, message, severity }]` (`warn` is a warning).
- **The result:** `{ fields: [{ name, message, severity }], detail }`
  (`detail`, or the body's `message`); undefined when nothing matched.

`FormStore.applySubmitError(error)`:

- a name that is a bound input's path goes to that input's results
  (`serverResults`, marked `server`), nested paths too;
- a name with no input goes to the summary as `name: message` (XMLUI drops
  it);
- `detail` goes to the summary when nothing else did;
- an unrecognized error: its `message`, or "Couldn't save the form.";
- server results go away when that path is edited, on reset or a clean
  submit, and at the next submit; until then they block a resubmit (XMLUI).

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
- **`submitUrl` doesn't generate code;** server errors match nested paths;
  names with no input reach the summary (step 22B).
- **The warning confirmation lists the warnings as text** (XMLUI shows its
  validation summary in the dialog).
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
| `runtime/tests/forms/server-errors.test.ts` | `extractServerProblem` (each shape, priority, locations, a `DataError`, unusable entries); `applySubmitError` (inputs and nested paths, the summary, the detail, unrecognized errors, clearing, blocking `validate()`); `loading` |
| `components/tests/forms-submit.test.tsx` | Against the mock backend (MSW in Node): `data` as a URL (disabled while held, then filled; saving PUTs back; invalidation refreshes a DataSource; the refetched value not applied), a 422 onto inputs and the focus, a name with no input, a 500 and `submitError`, a POST with a Laravel 422, `onSubmit` winning, `cancel()` while held, a failed load, unmount during a submit |
| `e2e/forms.spec.ts` (projects `forms-dev` 5186, `forms-build` 5187) | `test-apps/forms`: late errors and `aria-describedby`; Save with errors; keyboard only with Enter, Saving..., a warning, clean afterwards; an async check; the select and the required marks. The profile form against the mock backend (a service worker): a 422 on the inputs and the focus, the resubmit and the refreshed list, a held save cancelled, a 500 |
| `e2e/playground-scenarios.spec.ts` (Forms) | The playground's member form: a 422 on the input, the save, the refreshed list; unsaved changes block navigation |
