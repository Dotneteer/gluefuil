# Step 22B: Forms, submission and server errors

**Status:** Done; awaiting review

Part of [poc-steps.md](poc-steps.md); part B of
[poc-22-forms.md](poc-22-forms.md). Step 22 built the client side: `Form`,
inputs bound with `bindTo`, validation, and a submit through `onSubmit`
([../docs/forms.md](../docs/forms.md)). This step connects a form to a
server.

## Goal

```xml
<DataSource id="people" url="/api/people"/>
<Form id="profile" data="/api/people/1" onSuccess="(saved) => message = 'Saved ' + saved.name"
      onDirtyChanged="(dirty) => unsavedChanges = dirty">
  <TextBox bindTo="name" label="Name" required/>
  <TextBox bindTo="email" label="Email" required pattern="email"/>
  <TextBox bindTo="address.city" label="City"/>
</Form>
<Button label="Stop saving" when="{profile.isSubmitting}" onClick="profile.cancel()"/>
```

- **`data` can be a URL.** The form loads it once (disabled meanwhile), and
  `PUT`s back to it when saved. `submitUrl` and `submitMethod` say otherwise.
- **A submit goes through the step 20 HTTP gate:** structured errors,
  timeouts, cancellation, and the invalidation of the queries it changed.
  `people` refetches after a save.
- **A server's validation errors land on the inputs** they name, nested
  paths included, in the four formats XMLUI recognizes. Anything else goes to
  the summary at the top of the form. Editing an input clears its server
  error.
- **`cancel()`** stops a running submit; unmounting the form does too.
- **The playground** gets a Forms scenario, and a dirty form blocks
  navigation through step 21's guard and step 21B's global.

## Background

### XMLUI

- **The default submit handler** (`components/Form/FormReact.tsx` 1385–1395)
  is a generated code string:

  ```js
  Actions.callApi({ url: "${submitUrl}", method: "${submitMethod}", body: eventArgs, …, throwOnError: true })
  ```

  The URL is interpolated unescaped. It is used only when `submitUrl` is set
  and there is no `onSubmit`.
  - **`submitUrl`** falls back to `_data_url`: the URL when `data` is one
    (`Form.tsx` 186, `FormReact.tsx` 1325).
  - **`submitMethod`** defaults to `put` when `data` is set, else `post`
    (1316).
  - `callApi` invalidates every query by default.
- **Server errors** (`components-core/forms/server-error-mapping.ts`,
  `extractServerValidationProblem`):
  - **Where it looks:** the error itself, then its `data`, `body`, `payload`,
    `problem`, `details`, `response` and `response.data`, in that order.
  - **The shapes, in priority order:**
    1. RFC 7807 / 9457 `invalid-params` (or `invalidParams`):
       `[{ name, reason | detail, code? }]`;
    2. Spring: `errors: [{ field | objectName, defaultMessage | message | reason }]`;
    3. Laravel: `errors: { field: ["msg"] | "msg" }`;
    4. XMLUI legacy: `details.issues` (or `issues`): `[{ field, message, severity }]`.

    The first payload with a recognized shape wins.
  - **The result:** `{ type, title, status, detail (or message), invalidParams }`.
  - **Applying it** (`FormReact.tsx` 857–953):
    - every named entry goes to the field of that name, as
      `{ severity: entry's or "error", fromBackend }`;
    - names with no field are dropped silently, with a
      `server-error-unmapped` trace entry;
    - `detail` becomes a general message if there is no other;
    - an unrecognized error becomes one general message, `e.message ||
      "Couldn't save the form."`;
    - `submitError(error, problem)` fires;
    - the HTTP status is never checked;
    - field lookup uses top-level keys only (`state.subject[field]`, line 227).
  - **A server error stays until that field revalidates,** that is, until it
    is edited.
- **`cancel()`** aborts the submit's `AbortController`, which the handler
  receives as `$formCancel`; it is cooperative only.
  `completedNotificationMessage` and `errorNotificationMessage` work only
  with the generated handler.

### Here

- **`ApiCaller`** (`runtime/src/data/api-call.ts`) is APICall's core.
  - `execute(params, spec, options, events)` sends through `sendRequest`, with
    retries, then invalidates.
  - Without an `error` event it rejects with the `DataError`, and a cancel
    resolves `undefined` after `events.cancel`.
  - It also has `cancel(reason)` and `dispose()`/`activate()` (StrictMode).
  - It links to the calling handler's `$cancel`. A form's submit starts from
    a click, not a handler, so the form cancels through `ApiCaller.cancel`.
- **`DataError`:** `{ message, category, status, body, … }`. `body` is the
  parsed JSON; `message` is the body's `message` when it has one.
- **Loading a `data` URL:** `DataUrl` and `useLoader`
  (`components/src/data.tsx`); `isDataUrl` recognizes `/`, `./`, `../` and
  `http(s)://`. On the server nothing is fetched (step 20), so the
  prerendered form is empty and disabled, and the takeover is clean.
- **The form store** (step 22) has `generalErrors` and a per-field `results`
  computed. The summary renders `generalErrors`.
- **Mock backends:** the playground has one (`playground/src/backend.ts`:
  `/api/people`). `test-apps/forms` has none yet. `e2e/data.spec.ts` drives
  faults and holds through `/__mock`.

## Design

### Submitting to a URL

- **New `Form` props:**
  - `submitUrl` (evaluated when submitting);
  - `submitMethod`: `post`, `put`, `patch` or `delete`; default `put` when
    `data` is set, else `post` (XMLUI).
- **When `onSubmit` is absent and there is a URL** (`submitUrl`, or `data`'s
  URL), the form sends `{ url, method, body: payload }` through its own
  `ApiCaller`:
  - no retries;
  - the data layer's default timeout;
  - after a success, every query is invalidated (XMLUI's default).

  Its result is `success`'s argument. **No code string is generated** (fixes
  XMLUI's unescaped URL).
- **`onSubmit` wins** when both are given (XMLUI).
- **`isSubmitting`** stays true while the request runs; the form is disabled
  (step 22).

### `data` as a URL

- **A string `data` that is a URL** (`isDataUrl`) is loaded once through the
  data layer, as `Items data="/api/…"` is. A new store signal, `loading`,
  disables the form and the buttons meanwhile.
- **The first value becomes the baseline** (`store.reset(value)`). **Later
  values are ignored:** XMLUI applies no later `data` change. Otherwise the
  refetch after our own save would overwrite what the user types next.
- **A failed load** puts `Couldn't load the form's data: <message>` in the
  summary, and the form stays disabled.
- **The URL** becomes the default `submitUrl`, with `put`.

### Server errors (`runtime/src/forms/server-errors.ts`)

- **`extractServerProblem(error)`** is XMLUI's mapper:
  - the same candidates, plus a `DataError`'s `body`;
  - the same four shapes, in order;
  - the result: `{ fields: [{ name, message, severity }], detail }`, or
    `undefined`.
- **The store gains `serverResults`:** a signal of path → results.
  - A field's `results` include the server results for its path, marked
    `server: true`.
  - They go away when that path is edited (`setValue`), on `reset`/`clear`,
    and at the start of the next submit.
  - Like any error, they block a resubmit until edited (XMLUI).
- **Applying a problem:**
  - **A name that matches a bound input's path** goes to that input, nested
    paths included (`address.city`). XMLUI looks up top-level keys only.
  - **A name with no bound input** goes to the summary as `name: message`.
    **Divergence:** XMLUI drops it, with a trace entry no one sees.
  - **`detail`** goes to the summary when nothing else did.
  - **An unrecognized error:** its `message`, or "Couldn't save the form."
  - Every input shows its results (the submit attempt already forced that).
    The focus moves to the first input with a server error.
  - `submitError(error, problem)`: `problem` is the normalized
    `{ fields, detail }`, or undefined.

### `cancel()`

- **`cancel()`** aborts a running `submitUrl` request (`ApiCaller.cancel("user")`).
  The submit ends quietly: no `success`, no `submitError`, no summary. The
  data stays and the form is enabled again. **`cancelled`** (reactive) tells
  the markup it happened.
- **Unmounting** aborts it too (`dispose`).
- **With `onSubmit`, `cancel()` does nothing:** the handler is the
  application's code. XMLUI passes it `$formCancel`; we could give it
  `$cancel` later. Recorded as a limit.

### Playground

- **A Forms scenario:**
  - a profile form loading `/api/people/1`;
  - rules, a warning, an async check and a nested path;
  - Save (the mock answers a 422 for a taken email, with `invalid-params`
    including `address.city`);
  - a "Stop saving" button (`cancel()`, with a mock latency);
  - the people list (a `DataSource`) refreshing after a save.
- **The dirty guard:** `onDirtyChanged="(dirty) => unsavedChanges = dirty"`
  writes the step 21B global, which the App's `onWillNavigate` already
  checks. Leaving the page with unsaved changes is blocked.

### Deferred

| Feature | Later |
|---|---|
| `completedNotificationMessage`, `errorNotificationMessage`, `inProgressNotificationMessage` | Step 27 (toasts) |
| `$formCancel` for `onSubmit` handlers | When a handler needs it |
| `submitHeaders`, CSRF tokens, idempotency keys, `submitPolicy` | Phase G |
| `keepModalOpenOnSubmit` | Step 27 (`ModalDialog`) |

## Steps

- [x] Runtime: `server-errors.ts`; the store's `serverResults`, `loading`,
      and applying a problem.
- [x] Components: `Form` `submitUrl`, `submitMethod`, `data` as a URL,
      `cancel()`, `cancelled`, unmount; metadata (props, API).
- [x] `test-apps/forms`: a mock backend (signup and profile routes, 422s in
      two formats, a 500); a second form loading its data.
- [x] Playground: the Forms scenario, its backend routes, the dirty guard;
      the scenario E2E.
- [x] Docs: `forms.md`, `code-structure.md`.
- [x] `npm run check`.

## Verification

- **Unit, tables:** `extractServerProblem` for each of the four shapes, each
  candidate location (a `DataError`'s `body`, `response.data`, …), the
  priority order, `detail` and `message`, entries missing a name or a
  message, and an unrecognized error.
- **Store:**
  - server results on a nested path, cleared on edit, reset and the next
    submit;
  - an unknown name in the summary;
  - `detail` only when nothing else went there.
- **Components (jsdom, the mock backend's test server):**
  - `data` as a URL: disabled while loading, then filled; a failed load;
  - a `submitUrl` `POST`, and the `PUT` back to `data`'s URL;
  - `onSubmit` winning over `submitUrl`;
  - a 422 onto inputs, then a successful resubmit;
  - a 500 in the summary;
  - `cancel()` while held; unmount during a submit;
  - invalidation refreshing a `DataSource`.
- **E2E (`test-apps/forms` with the worker host; dev and build):**
  - the profile form loads (disabled meanwhile, through a hold);
  - a 422 with messages on the right inputs (nested included), and the focus
    on the first one;
  - an edit clears the message, and the resubmit succeeds;
  - a 500 in the summary;
  - a slow server: Saving…, then `cancel()`;
  - the list refreshes after a save.

  Playground: leaving the Forms page with unsaved changes is blocked.

## Decisions (the user's answers)

1. **Later values of a `data` URL are ignored;** the first one is the
   baseline.
2. **Server errors for names with no input** go to the summary as
   `name: message`.
3. **A `submitUrl` save invalidates every query** (XMLUI's default); no
   `invalidates` prop.
4. **A failed `data` load** keeps the form disabled, with the message in the
   summary.

## Outcome

Implemented as designed. `npm run check`: 2,550 unit tests in 90 files (+27),
186 E2E tests (+7), no warnings. Details: [../docs/forms.md](../docs/forms.md).

- **Runtime:** `forms/server-errors.ts` (`extractServerProblem`); the store's
  `serverResults`, `loading`, `cancelled`, `applySubmitError`,
  `dropServerResults`, `firstServerInvalid`.
- **Components:** `Form` `submitUrl`, `submitMethod`, `data` as a URL
  (`useDataUrlState` in `data.tsx`), its own `ApiCaller` (`cancel()`,
  disposed on unmount), the API `cancel` and `cancelled`.
- **`test-apps/forms`:** a mock backend (`src/backend.ts`, a service worker in
  dev and in the prerendered build) and a profile form.
- **Playground:** the Forms scenario (`/api/members`), with the dirty guard
  through the `unsavedChanges` global.

### Findings

- **The focus after a server error must wait for the re-render:** the inputs
  are still disabled (submitting) when the error arrives, and a disabled
  input can't take the focus. It moves in a timeout after `submitting` is
  cleared.
- **Unmounting during a submit ends the request at the server too** in the
  Node test host: the hold disappears. The service worker host doesn't see
  aborts (known, [../docs/mock-backend.md](../docs/mock-backend.md)); the E2E
  test releases its hold itself.
- **Server answers are not reported as runtime errors:** they are shown in
  the form. A non-`DataError` thrown by `onSubmit` still is, without
  `submitError` (a bug in the handler).
- **Two forms on one page** made `getByLabel("Name")` match "Full name"
  (Playwright's substring match): the step 22 tests now use exact labels and
  scope to their form.
