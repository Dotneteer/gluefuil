# Steps 22 and 22B: Forms

**Status:** Step 22 (part A) done, awaiting review; step 22B (part B) next

Part of [poc-steps.md](poc-steps.md). Builds on step 20 (the HTTP gate,
`APICall`, structured errors, the mock backend) and step 21B (globals, which
a form's dirty flag can use).

## Goal

```xml
<Form id="userForm" data="{ { name: '', email: '', address: { city: '' } } }"
      submitUrl="/api/users" submitMethod="post"
      onSuccess="(user) => toastMessage = 'Saved ' + user.name">
  <TextBox bindTo="name" label="Name" required minLength="2"/>
  <TextBox bindTo="email" label="Email" required pattern="email"
           onValidate="async (value) => (await isTaken(value)) ? 'Already registered' : null"/>
  <TextBox bindTo="address.city" label="City" maxLength="20" lengthInvalidSeverity="warning"/>
  <Select bindTo="role" label="Role" options="{['user', 'admin']}"/>
  <Checkbox bindTo="agree" label="I agree" required/>
  <Text>Preview: {$data.name} from {$data.address.city}</Text>
</Form>
```

- **No `FormItem`.** An input joins its form through behaviors, as XMLUI's
  `formBinding` and `validation` behaviors do for an input with `bindTo`:
  any component with a `value`/`setValue` API (`TextBox`, `Select`,
  `Checkbox` now, every input of step 24 later) binds one path of the
  form's data (`bindTo`, dotted paths too). `$data` shows the current
  values to everything inside the form.
- **Validation is declarative,** with severities (an error blocks submit,
  a warning doesn't), and errors show at the moment XMLUI shows them (late,
  by default), not on every keystroke.
- **Submit** sends the data to `submitUrl` through the step 20 HTTP gate,
  or calls `onSubmit`. A server's validation errors land on the right
  inputs; anything else goes to a summary at the top of the form.
- **Dirty tracking, reset and cancel** behave as in XMLUI, so an app can
  guard navigation with `userForm.isDirty()` (step 21).

## Background

### XMLUI

Researched from the docs and the source; the details are in the files below.

- **Docs:** `website/content/docs/pages/forms.md`,
  `reference/components/Form.md`, `FormItem.md`,
  `.ai/xmlui/form-infrastructure.md`,
  `pages/managed-react/forms-validation-discipline.md`.
- **Source:**
  - `xmlui/src/components/Form/FormReact.tsx`: a reducer holding the
    subject, the per-field flags and validation results; the submit flow.
  - `xmlui/src/components/FormItem/FormItemReact.tsx`: `FormItem`, one input per `type` (not taken here).
  - `xmlui/src/components/FormItem/Validations.ts`: the rules and the
    display timing.
  - `xmlui/src/components-core/behaviors/FormBindingBehavior.tsx`: a plain
    input with `bindTo` binds to the form without a `FormItem`.
  - `xmlui/src/components-core/forms/server-error-mapping.ts`: server
    errors mapped onto fields.

**What XMLUI does (the parts we reproduce):**

- **Form** (`Form.tsx` 31–348, `FormReact.tsx`):
  - **Props:** `data`, `submitUrl`, `submitMethod` (`put` when `data` is
    set, else `post`), `saveLabel`, `saveInProgressLabel`, `cancelLabel`,
    `hideButtonRow`, `buttonRowTemplate`, `enabled`, `itemLabelPosition`,
    `dataAfterSubmit` (`keep`/`reset`/`clear`).
  - **Events:**
    - `willSubmit(data, allData)`: `false` cancels; an object replaces the
      payload (806–823).
    - `submit(data)`: its result becomes `success`'s argument.
    - `success`, `cancel`, `reset`, `dirtyChanged`, `submitError`.
  - **Methods:** `reset(data?)`, `update(change)`, `validate()`,
    `getData()`, `isDirty()`, `setDirty()`, `cancel()`.
  - **Context:** `$data` (the values without `noSubmit` fields).
- **Inputs bind through two behaviors** (`components-core/behaviors/`;
  registered after label, tooltip and variant,
  `components/ComponentProvider.tsx` 903–910). We take these; `FormItem`
  (`components/FormItem/`) we leave out.
  - **`formBinding`** (`FormBindingBehavior.tsx`):
    - **Attaches** when `bindTo` is set and the component's metadata has
      both a `value` and a `setValue` API (not a `FormItem`).
    - **Props:** `bindTo` (a lodash path), `initialValue` (used when
      `data` has nothing at the path), `noSubmit`.
    - **Rendering:** it wraps the input in `FormBindingWrapper`, which also
      renders the label itself. The `label` behavior steps aside for a bound
      input (`LabelBehavior.tsx` 86–92).
  - **`validation`** (`ValidationBehavior.tsx`): same trigger and condition.
    - **Rules:** `required`; `minLength`/`maxLength`; `minValue`/`maxValue`;
      `pattern` (email, url, phone); `regex`; `matchValue`. Each has a
      message prop, and all but `required` and `matchValue` have a
      severity prop.
    - **Custom check:** `onValidate`, synchronous or asynchronous,
      returning null, a string, a boolean, or `{ isValid, invalidMessage,
      severity }` (or an array of them).
    - **Timing:** `validationMode` (`errorLate` default, `onChanged`,
      `onLostFocus`), `customValidationsDebounce`, `validationDisplayDelay`,
      `verboseValidationFeedback`.
    - **Rendering:** it wraps the input in `ValidationWrapper` (the messages).
  - **The protocol** (`FormBindingWrapper.tsx` 169–178): the wrapper gives
    the input its value, an `updateState` setter, focus and blur handlers,
    `enabled`, and the validation status and messages.
- **When errors show** (`Validations.ts` 613–731):
  - `errorLate`: not before the field is dirty. They show on blur, then
    live while the field is focused again, until the value is valid.
  - A submit attempt shows every field's result; an edit hides that field's
    again.
- **Submit** (`FormReact.tsx` 591–964), in order:
  1. Validate.
  2. If there are warnings, confirm them in a modal.
  3. Run the cross-field `FormValidator`s.
  4. `willSubmit`, then `submit`.
  5. Mark the form clean.
  6. `success`, then `dataAfterSubmit`.

  The whole form is disabled while it submits.
- **Server errors:** four shapes, tried in order:
  1. RFC 7807 `invalid-params`;
  2. Spring `errors: [...]`;
  3. Laravel `errors: { field: [msg] }`;
  4. `details.issues`.

  Named entries go to the fields; `detail`/`message` goes to the summary.
  Unrecognized errors become one general message.

**XMLUI bugs and doc/source disagreements we don't copy** (from the
research; line numbers in the files above):

1. **`validator`/`validatorParams` do nothing.** They never reach the rule
   set (`ValidationBehavior.tsx` 234–253).
2. **`submitPolicy`/`submitDropped` are unreachable.** The guard runs after
   the `isEnabled` early return, which is false while submitting
   (`FormReact.tsx` 602–611).
3. **The `submitUrl` handler is a generated code string** with the URL
   interpolated unescaped (`FormReact.tsx` 1389).
4. **Pending async checks block submit without being awaited.** The docs
   say the form waits; `validate()` is documented as async but is
   synchronous.
5. **A throwing `onValidate` locks the form:** the field stays pending, and
   Save stays disabled.
6. **`noSubmit` and server errors use top-level keys only:** `address.zip`
   doesn't work (`FormReact.tsx` 227, 377–387).
7. **An empty value fails `minValue`** (`Number("")` is 0), and the
   message says "bigger than" for `>=`.
8. **`reset` fires after every successful submit,** even with
   `dataAfterSubmit="keep"`.
9. **The `validationDisplayDelay` default** is 400 in the docs, 0 in the
   code.
10. **`FormValidator`** runs only on submit, and `bindTo` is ignored there,
    contrary to its docs.

### Here

- **Inputs:** `TextBox`, `Select` and `Checkbox` (Mantine, through
  `wrapComponent`). Each holds a controlled value in a signal created from
  `initialValue` and exposes `value`/`setValue` (`runtime/src/render/wrap.ts`).
  `NumberBox`, `TextArea`, `PasswordInput`, `Switch` and `RadioGroup` come
  in step 24.
- **Behaviors** (step 18, `components/src/behaviors-metadata.ts`) attach
  at compile time when a trigger prop is set and the component doesn't
  declare it. The compiler wraps the element in the behavior's component,
  innermost first (`label`, `tooltip`, `variant`). The wrapper receives the
  compiled element as its children. Behaviors have props only, no events,
  and no condition on the component's API yet.
- **The `label` behavior** renders `<label class="pfui-Label">` around an
  input.
- **Data** (step 20) gives `submitUrl` its HTTP gate. Errors are a frozen
  `{ category, status, body, … }` (category `validation` for 400/422).
  The mock backend can answer anything, with faults and holds.
- **Context variables** come from templates (`Items`' `childrenTemplate`).
  IDs inside a template belong to the instance, which is wrong for a form:
  `<Form><TextBox id="x"/></Form><Text>{x.value}</Text>` must work, as in
  XMLUI.
- **No `ModalDialog`** before step 27, so there is nothing to confirm
  warnings with.

## Options considered

**The form state:**

1. **`@tanstack/form-core` bridged to our signals** (as `query-core` in step
   20). It has field metadata, sync and async validators with debounce, and
   arrays. But it has no severities (warnings), its validation triggers
   (`onChange`/`onBlur`/`onSubmit` validators) differ from XMLUI's display
   timing, and the server-error mapping, path binding and bound inputs stay
   ours anyway. We would adapt more than we reuse.
2. **Recommended: our own form store on signals**
   (`runtime/src/forms/`, React-free).
   - The values are one frozen object in a signal, written by path. Each
     field's state (touched, dirty, focused, results) is a signal too.
   - Every reader re-renders only for what it reads, which XMLUI gets with
     context selectors.
   - The rules, the display timing and the server-error mapping are pure
     functions, tested by tables.

**How a bound input gets its value:**

1. **A prop on the input.** The behavior's wrapper receives a compiled
   `Bound` element as its children, not the input. Passing a prop through
   would need a compiler change for every behavior. Rejected.
2. **Recommended: a field context, read by `wrapComponent`.** The
   `formBinding` wrapper provides a field binding (value, setter,
   focus/blur, status) to exactly the input it wraps. `wrapComponent`'s
   value support uses it instead of its own signal, then provides "none" to
   whatever the input renders inside (`Select`'s option templates), so a
   nested input never binds by accident. The binding is never reachable
   from markup.

## Design

### Runtime: the form store (`runtime/src/forms/`)

- **`createFormStore({ data })`:**
  - `values` is a signal holding a frozen object, the working copy;
    `baseline` holds what `reset()` returns to.
  - `fields` maps a path to `{ touched, dirty, focused, results, pending,
    showAll }`, created when a bound input registers and removed when it
    unmounts. The value stays (XMLUI).
  - `get(path)` and `set(path, value)` write by path, copy on write, using
    the step 6 path helpers.
- **Rules** (`rules.ts`):

  ```
  validate(value, rules) → { severity, message, rule }[]
  ```

  - Order: `required` first (if it fails, nothing else runs), then length,
    range, `pattern`, `regex`, `matchValue`. XMLUI's emptiness counts:
    `undefined`, `null`, a blank string, `false`, `{}`, `[]`.
  - Empty values pass every rule except `required` (**fixes bug 7**).
  - Default messages are XMLUI's wording, corrected where it is wrong.
- **Custom checks** (`onValidate`): the result is normalized to the same
  shape. An async check gets an `AbortSignal`, is debounced, and a stale
  run is dropped. **A throw is reported and counts as an error**, so the
  field is never stuck pending (**fixes bug 5**).
- **Display timing** (`display.ts`): a pure function from the field's
  flags and `validationMode` to "show" or "hide". It is tested by a table
  that copies XMLUI's rules, including the submit attempt (show all) and
  the edit (hide again).
- **Server errors** (`server-errors.ts`):
  - It recognizes XMLUI's four shapes from a step 20 error's `body`, in
    XMLUI's order, and a top-level `issues` array (the legacy form).
  - Field names are paths (`address.city`) (**fixes bug 6**).
  - It returns `{ fields: { path: messages }, general: messages }`. A name
    that is no field goes to `general`, with the field's name.

### Components and behaviors

- **`Form`:**
  - **Props:** `data` (an object, or a URL loaded once through the data
    layer; the form is disabled while it loads), `submitUrl`, `submitMethod`
    (XMLUI's default), `enabled`, `saveLabel`, `saveInProgressLabel`,
    `cancelLabel`, `hideButtonRow`, `buttonRowTemplate` (with `$data`),
    `dataAfterSubmit`.
  - **Events:** `willSubmit(data, allData)`, `submit(data)`,
    `success(result)`, `submitError(error)`, `cancel`, `reset`,
    `dirtyChanged(dirty)`, with XMLUI's result semantics.
  - **API:** `reset(data?)`, `update(change)`, `validate()` (**async: it
    awaits pending checks**, fixing bug 4), `getData()`, `isDirty()`,
    `setDirty(dirty)`, `cancel()`, and the reactive `isSubmitting`,
    `isDirty` and `hasErrors`.
  - **Rendering:** a `<form>` (Enter submits; native validation off), the
    error summary at the top (`role="alert"`), the children, and the button
    row (Cancel, Save).
- **`$data`** comes from a new metadata field, `childContextVars:
  ["$data"]`.
  - The compiler adds the names to the children's scope without making
    them a template.
  - At runtime the Form puts a scope layer with a `$data` getter under its
    children.
  - IDs inside stay file-scoped. Handlers on the Form receive the data as
    arguments, as XMLUI's do.
- **The `formBinding` behavior:**
  - **Trigger:** `bindTo`.
  - **Condition:** a new `requiresValueApi` check: the component's
    metadata `api` has `value` and `setValue`.
  - **Props:** `bindTo` and `noSubmit`. The input's own `initialValue` is
    the field's initial value when `data` has nothing at the path (XMLUI).
  - **The wrapper:**
    - registers the field with the enclosing form and provides the field
      context to the input;
    - the input's value is the form's value at the path;
    - typing writes it back, and focus and blur reach the form;
    - its own `didChange` still fires, and `enabled` combines the input's
      with the form's (a submitting form disables everything).
- **The `validation` behavior:**
  - **Trigger:** `bindTo`, same condition.
  - **Props:** the rules with their message and severity props,
    `validationMode`, `customValidationsDebounce`,
    `validationDisplayDelay`, `verboseValidationFeedback`.
  - **Event:** `validate` (`onValidate`). Behaviors gain **events**: a
    handler compiled on the behavior's `Bound`, checked like a component's
    (E004 for a misspelled one).
  - **The wrapper:**
    - renders `<span class="pfui-Field" data-required data-invalid>`
      around the input, with the visible messages after it
      (`<div class="pfui-ValidationMessage" data-severity>`);
    - the input gets `aria-invalid` and `aria-describedby`, through the
      field context.
  - **Without `bindTo`,** a rule prop is an unknown prop (the existing
    contract error), so `<TextBox required/>` outside a form is caught at
    compile time.
- **Order and the label:**
  - Innermost first: `formBinding`, `validation`, then `label`, `tooltip`,
    `variant`. So the label wraps the input and its messages, and the
    behaviors stay separate.
  - XMLUI's binding wrapper renders the label itself instead; same result.
  - The required mark is CSS:
    `.pfui-Label:has(.pfui-Field[data-required]) > .pfui-Label-text::after`.
    No prop is shared between two behaviors.
- **Outside a Form,** a bound input reports a runtime error and works
  unbound. It can't be a compile error: a user component may be used
  inside a form.
- **Which components bind:** those whose metadata has a `value` and
  `setValue` API, so `TextBox`, `Select` and `Checkbox` now, and every
  input of steps 24–26 as it arrives. `Checkbox` declares its own `label`,
  so the label behavior doesn't attach to it (as today).

### Submit flow

1. A guard: a submit while one runs is ignored, and Save is disabled
   (**the policy that works**, unlike bug 2).
2. Validate everything, **awaiting pending async checks.** Every field
   shows its results. Any error stops here, and focus moves to the first
   invalid field.
3. **Warnings don't block, and there is no confirmation yet** (no modal
   until step 27). They show, and the submit proceeds. Recorded as a
   divergence.
4. Run `willSubmit(data, allData)`: `false` cancels; an object replaces the
   payload.
5. Submit. With `onSubmit`, its result is the response. Otherwise the
   request goes to `submitUrl` through the data layer's request function,
   **not a generated code string** (bug 3). It is cancelled by `cancel()`
   and on unmount.
6. On success:
   - mark the form clean and clear the server errors;
   - fire `success(result)`;
   - apply `dataAfterSubmit` (`keep`, `reset` or `clear`);
   - fire `reset` only when the form actually reset (bug 8).
7. On an error:
   - map the server errors onto the fields and the summary, and fire
     `submitError(error)`;
   - a field's server error goes away when the field is edited (XMLUI).

### Contracts

- `bindTo` must be non-empty when it is a literal.
- The rule props are typed in the behavior's metadata (`minLength` is a
  number; the severities are `error` or `warning`; `validationMode` is one
  of three).
- A rule prop without `bindTo`: an unknown prop (above).

### Deferred, with the step that takes each

| Feature | Later |
|---|---|
| More bindable inputs (`NumberBox`, `TextArea`, `PasswordInput`, `Switch`, `RadioGroup`, …) | Step 24 (inputs) and 25–26: each binds as soon as it has the value API |
| Array editing (XMLUI's `FormItem type="items"`) | Later, with its own design: there is no `FormItem` |
| User components as bound inputs (XMLUI's custom `FormItem`) | Later: a user component would need a `value`/`setValue` API in its derived contract |
| Confirming warnings, `keepModalOpenOnSubmit` | Step 27 (`ModalDialog`) |
| `FormItem`, `FormValidator` | Not planned: inputs bind through behaviors; a form-level `onValidate` may cover cross-field checks later |
| Persistence, CSRF, idempotency keys, notification messages | Phase G |
| `validator`/`validatorParams` | Not planned (they do nothing in XMLUI) |

## Steps

Part A: client-side forms.

- [x] Runtime: the form store, the rules, custom checks (sync, async,
      debounce, abort, a throw), the display timing.
- [x] Compiler: `childContextVars` (children compiled in place with extra
      context variables); behavior events; the `requiresValueApi`
      condition.
- [x] `wrapComponent`: the field context on value components (and "none"
      for what they render inside).
- [x] Components: `Form` (no `submitUrl` yet); the `formBinding` and
      `validation` behaviors; messages, the required mark, ARIA; theme
      variables (`textColor-ValidationMessage-error`, `…-warning`, the
      button row's gap).

Part B: submission and server errors.

- [ ] `submitUrl`/`submitMethod` through the data layer; `data` as a URL;
      the submit flow; cancel and unmount.
- [ ] The server-error mapping; the summary; clearing on edit.
- [ ] The playground: a Forms scenario, with the routing guard using
      `isDirty()`.

Both:

- [ ] Docs: a new `forms.md` subsystem document; `code-structure.md`.
- [ ] `npm run check`.

## Verification

- **Unit (tables):**
  - the rules (every rule, empty values, severities, messages);
  - the `onValidate` result shapes;
  - the display timing (every mode against focus, blur, edit, submit);
  - the server-error shapes (each of the four, `issues`, nested paths,
    unknown names, an unrecognized body).
- **Store:** paths, baseline and reset, dirty transitions, field
  registration and removal, a stale async check dropped, `validate()`
  awaiting pending checks.
- **Compiler:** `childContextVars` (`$data` visible inside, not outside;
  IDs inside still file-scoped); the behaviors attach only with `bindTo`
  and a value API (`<Button bindTo>` and `<TextBox required/>` are
  errors); `onValidate` compiled as a behavior event; E004 for a
  misspelled one.
- **Components (jsdom):** typing updates `$data`; errors appear only after
  blur (`errorLate`); a submit attempt shows everything; a warning doesn't
  block; `willSubmit` cancels or replaces; `onSubmit`'s result reaches
  `success`; reset, cancel, `dataAfterSubmit`; `TextBox`, `Select` and
  `Checkbox` bound; an input inside a `Select` option template does not
  bind; the label's required mark and its accessible name.
- **E2E** in a new `test-apps/forms` fixture, with the mock backend:
  - fill in, see late errors, and submit;
  - the server answers 422 (`invalid-params`), and the messages appear on
    the right fields, nested paths included;
  - a general error appears in the summary;
  - an edit clears a field's server error, and the second submit succeeds;
  - a slow server (a hold) keeps the form disabled until it answers;
  - the async uniqueness check;
  - keyboard only: Tab through, Enter submits, and focus moves to the
    first invalid field.

## Decisions (the user's)

1. **No `FormItem`.** Inputs bind to a form only through the `formBinding`
   and `validation` behaviors, after XMLUI's (`FormBindingBehavior.tsx`,
   `ValidationBehavior.tsx`).
2. **Our own form store on signals** (`runtime/src/forms/`), not
   `@tanstack/form-core`.
3. **Split:** part A is step 22 (client-side forms), part B is step 22B
   (submission and server errors), each reviewed on its own.
4. **Warnings at submit** show and don't block; no confirmation until
   step 27.
5. **`pattern`** supports XMLUI's built-in names (`email`, `url`, `phone`);
   `regex` takes any expression.

## Outcome (step 22, part A)

Implemented as designed, with the changes under Findings. `npm run check`:
2,523 unit tests in 88 files (+131), 179 E2E tests (+10), no warnings.
Details: [../docs/forms.md](../docs/forms.md).

- **Runtime** `runtime/src/forms/`: paths, rules, display, the store
  (`FormStore`, `FormField`), the React contexts. `render/context-scope.ts`
  for `$data`; `wrap.ts` reads a field binding.
- **Compiler:** `childContextVars` (a container creating the context scope);
  behavior events (`onValidate`, `results: true`); `requiresValueApi`.
- **Components:** `Form`, `FormBindingBehavior`, `ValidationBehavior`, an
  internal `SubmitButton`; the CSS and theme variables (`gap-Form`,
  `gap-Form-buttons`, `gap-Field`, `textColor-ValidationMessage-error`,
  `…-warning`, `fontSize-ValidationMessage`).
- **E2E:** `test-apps/forms` (a sign-up form), projects `forms-dev` (5186)
  and `forms-build` (5187, prerendered).

### Findings

- **The label must wrap only the input.** With the label outermost, the
  validation messages became part of the input's accessible name ("Name This
  field is required"). Order: `label`, `formBinding`, `validation`, `tooltip`,
  `variant`; the messages follow the `<label>` inside `.pfui-Field`.
- **Mantine overrides `aria-describedby`.** Its inputs spread their own value
  after the props (undefined unless they render a description). The bound
  input sets the attribute on the element through its ref.
- **No custom check at mount.** A handler called from a layout effect may
  find its slot not yet reactivated after StrictMode's simulated unmount, and
  answers nothing. Nothing shows before an edit anyway; `validate()` checks an
  unchecked value.
- **A running check is not "valid" at blur.** Otherwise a late "Already
  registered" stays hidden in `errorLate` (XMLUI's behavior unless
  `validationDisplayDelay` is set). Found by the E2E test.
- **Explicit `async`/`await` are not part of our script** (S030); the
  examples use implicit await (`(value) => { delay(200); return …; }`).
- **`Button` forces `type="button"`;** Enter submits through an internal
  `SubmitButton` with the same configuration.

### Deviations from this plan

- **Behavior order:** the label is innermost, not outermost (above).
- **`<event name="validate">`** is not routed to behaviors; only the
  `onValidate` attribute.
- **`verboseValidationFeedback`** is not supported (no "valid" status
  display yet).
- **The playground scenario** moves to step 22B, with the routing guard.
