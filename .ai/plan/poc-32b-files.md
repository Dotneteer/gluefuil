# Step 32B: files and uploads

**Status:** Done (accepted 2026-11-27)

Split from step 32 by the user ([poc-steps.md](poc-steps.md) row 32B;
[poc-32-remaining.md](poc-32-remaining.md) *Decisions* 1, 3–6). E2E is needed
for drops, pastes and real multipart requests.

## Goal

```xml
<Form submitUrl="/api/tickets">
  <TextBox label="Subject" bindTo="subject"/>
  <FileInput label="Attachment" bindTo="attachment" acceptsFileType="{['.pdf', '.png']}"/>
</Form>                                              <!-- sent as multipart/form-data -->

<FileInput parseAs="csv" onDidChange="r => rows = r.parsedData[0].data"/>

<FileUploadDropZone allowPaste="true" acceptedFileTypes="image/*" onUpload="files => images = [...images, ...files]">
  <Items data="{images}"><Image data="{$item}"/></Items>
</FileUploadDropZone>

<APICall id="upload" method="post" url="/api/receipts" body="{{ file: receipt.value[0], category }}"/>

<Button label="Invoice">
  <event name="click"><FileDownload url="/api/invoices/{id}/pdf" fileName="invoice-{id}.pdf"/></event>
</Button>
```

XMLUI's markup and behavior; files reach script as `File` objects; bodies
with files go as multipart; the mock backend understands them.

## Background

### XMLUI

- **FileInput** (`FileInput.md`, `FileInputReact.tsx`): a read-only text box
  with the file names and a browse button (`buttonLabel`, `buttonIcon`,
  `buttonIconPosition`, `buttonPosition` start/end, `buttonSize`,
  `buttonThemeColor`, `buttonVariant`); `acceptsFileType` (a string or an
  array of extensions), `multiple`, `directory` (`webkitdirectory`),
  `placeholder`, `initialValue`, `readOnly`, `required`, `validationStatus`,
  `autoFocus`, `enabled`; drag and drop onto it (`useDropzone`, `noClick`,
  `noKeyboard`). Events `didChange`, `gotFocus`, `lostFocus`, `parseError(error,
  file)`; API `focus`, `open`, `setValue`, `value`, `inProgress`, `getFields`.
  - **The value is `File[]`.** With `parseAs` (`csv`, `json`) the value *and*
    `didChange`'s argument are `{ files, parsedData: [{ file, data, error }] }`
    (`FileInputReact.tsx` 145–260): CSV through papaparse with `{ header:
    true, skipEmptyLines: true, ...csvOptions }`; JSON parsed, a single object
    wrapped in an array; an empty file is `[]`; errors go to `parseError` (else
    the console). `getFields()` is the last CSV's header fields.
  - `parseAs` without `acceptsFileType` accepts `.csv` / `.json`.
  - XMLUI maps every accepted extension under `application/octet-stream`
    (`toDropzoneAccept`, line 10), so MIME types in `acceptsFileType` don't
    filter drops. A quirk, not something to copy.
  - In a Form (`howto/submit-a-form-with-file-uploads.md`): `bindTo` stores
    the `File[]` under its name.
- **FileUploadDropZone** (`FileUploadDropZoneReact.tsx`): wraps its children
  (without children: an icon, default `upload`, and `text`, default "Drop
  files here"); while dragging an accepted file, an overlay with the icon and
  text. `acceptedFileTypes` (MIME types, comma-separated), `maxFiles`,
  `enabled`, `allowPaste` (files pasted into the zone, not into a text input
  or editable element inside it, lines 100–140); event `upload(files)`; API
  `open()` (in the source, not the docs). Theme variables: border (dashed, 2px,
  `$color-secondary-200`), radius, colors and opacity while dropping
  (`FileUploadDropZone.md`).
- **Image `data`** (`Image.md`, `ImageReact.tsx` 50–70): a `Blob`/`File` shown
  through an object URL (`howto/paste-an-image-from-the-clipboard.md`).
- **Request bodies with files** (`RestApiProxy.ts`):
  - `payloadType` on APICall (`components-core/action/APICall.tsx` 278;
    internal in `APICall.tsx` 234, but used by `howto/cancel-an-upload.md`):
    `multipart-form` builds a `FormData` from the body's entries; `form`
    URL-encodes it; anything else is JSON (lines 690–705).
  - `appendFormFieldValue` (170–200): a `File`/`Blob` is appended as is,
    arrays repeat the key, nested objects become `parent.child` keys,
    null/undefined are left out.
  - **A Form's `submitUrl` sends JSON** (`FormReact.tsx` 1389: `Actions.callApi`
    with `body: eventArgs`), so in XMLUI a file in a submitted form becomes
    `{}`. The how-to submits through `onSubmit` instead.
- **FileUpload and FileDownload** are *action components*: elements inside an
  `<event>` block (`howto/inline-one-use-action-components.md` 138–164;
  `ApiBoundComponent.tsx` 63–130 turns them into `Actions.upload(...)` /
  `Actions.download(...)` with `$param` the event's argument), and the same as
  globals (`pages/globals.md` § Actions).
  - **Upload** (`FileUploadAction.tsx`, `RestApiProxy.ts` 395–500): `file`,
    `url`, `method`, `asForm` (a `FormData` with the file under `fieldName`,
    default `file`, plus `formParams`), otherwise the raw file bytes as the
    body; `queryParams`, `headers`, `invalidates`; events `success`, `error`
    (false handles it), `cancel`, `progress`; `chunkSizeInBytes` (decided:
    not now).
  - **Download** (`FileDownloadAction.tsx`): `url`, `method`, `body`,
    `queryParams`, `headers`, `fileName`; a GET without headers goes through a
    hidden iframe (the browser's own download), everything else, **including
    mocked URLs**, is fetched and saved through an `<a download>` (lines
    60–95).

### Here

- **No action components:** an element inside `<event>` is E002
  (`compile-module.ts` `tagHandler`, 1620), and there is no `Actions` global.
- **The HTTP gate sends JSON or a string** (`runtime/src/data/http.ts` 82).
- **The mock backend reads bodies as JSON or text** (`mock-backend/src/index.ts`
  `readBody`); its middleware host buffers the body (`middleware.ts` 33).
- **`File` objects already pass through** variables (`freezeDeep` freezes
  plain objects only) and bindings (`assertBindingValue` rejects promises
  only).
- **Two bugs files will hit:** `isEmptyValue` (`forms/rules.ts` 53) calls any
  object with no own keys empty, so a `File` fails `required`; step 32's
  `deepEqual` (`components/src/nonvisual.tsx`) calls any two such objects
  equal, so a ChangeListener misses a new file.
- **Our Image has no `data`.**
- **Decided in step 32** (*Decisions* 3–6): `react-dropzone` for both
  components; papaparse 5.7.1 in a lazy chunk; `File` objects reach script as
  they are (an allowed platform value); multipart bodies in APICall and Form,
  and `FileUpload`/`FileDownload` without chunking; upload progress (XHR)
  waits.

## Options considered

### G. How FileUpload and FileDownload are written *(decided: both)*

1. **Action components inside `<event>`** (XMLUI's markup) **and
   `Actions.upload()`/`Actions.download()`** *(recommended)*. The compiler
   accepts one action element (`APICall`, `FileUpload`, `FileDownload`) as an
   `<event>`'s content and compiles it to a handler that runs the action with
   its props evaluated against `$param`/`$params` (as APICall's deferred props
   are today); the globals are the same functions for script. Inline `APICall`
   comes with it (the how-to's first example).
2. **Only the globals.** No compiler work; the markup of the how-tos is E002.
3. **Only the elements.**

### H. When a body goes as multipart *(decided: automatic, plus `payloadType`)*

1. **Automatically when it contains a `File` or `Blob`**, and XMLUI's
   `payloadType` (`json`, `form`, `multipart-form`) to choose explicitly
   *(recommended)*. A file can't go as JSON (it would be `{}`), so the
   automatic case only changes what was broken; a Form's `submitUrl` with a
   FileInput then works (in XMLUI it sends `{}`).
2. **Only `payloadType`**, as XMLUI: an APICall needs
   `payloadType="multipart-form"`, and a Form needs a new prop.

### I. How a download is saved *(decided: always fetched)*

1. **Always fetched through the HTTP gate, then saved through an `<a
   download>` with an object URL** *(recommended)*: the mock backend answers it
   (XMLUI falls back to this for mocked URLs anyway), errors and cancellation
   reach the handlers, headers work. The file is in memory before it is saved.
2. **XMLUI's split:** a plain GET through a hidden iframe (the browser's own
   progress, no memory cost; a mocked URL can't answer it, and an error page
   is "downloaded"), the rest fetched.

## Design

- **Files:** `components/src/files.tsx` (FileInput, FileUploadDropZone),
  `files-parse.ts` (the lazy chunk: papaparse, JSON); `runtime/src/data/body.ts`
  (the request body: JSON, form, multipart; `appendFormFieldValue`'s rules),
  `runtime/src/data/transfer.ts` (`upload`, `download`, the `Actions`
  global); the compiler's action elements in `<event>`.
- **FileInput:** Mantine's input look (a read-only TextInput with the names)
  and our Button; `useDropzone` with `noClick`/`noKeyboard`, its hidden input
  with `accept` and `webkitdirectory`; the value through `wrapComponent`'s
  value API, so `bindTo`, `required`, `validationStatus`, `setValue` and the
  focus events work like any input. Accept rules: extensions and MIME types
  both filter (react-dropzone's `accept` built from each kind; XMLUI's
  octet-stream quirk not copied). `parseAs`: the papaparse chunk is loaded
  when a CSV is parsed (`lazyResource`); `inProgress` while parsing.
- **FileUploadDropZone:** a div around the children with `useDropzone`
  (`accept` from MIME types, `maxFiles`, `noClick`); the overlay while an
  accepted drag is over it; paste when `allowPaste` (ignored from text inputs
  and editable elements); `upload(files)`; API `open()`. Rejected files
  (type, count) fire nothing, as in XMLUI.
- **Image `data`:** a `Blob`/`File` shown through an object URL, revoked on
  change and unmount. A prerender has no Blob: nothing is rendered for it.
- **Bodies:** `sendRequest` takes `payloadType`; a body with a `File`/`Blob`
  anywhere becomes multipart (XMLUI's flattening: files as they are, arrays
  repeat the key, objects as `a.b`, null left out); the browser sets the
  boundary. APICall gets `payloadType`; a Form's submit uses the same rules.
- **Upload:** `asForm` (a FormData with `fieldName`, default `file`, and
  `formParams`), else the file itself as the body (with its type);
  `invalidates`, `success`, `error` (false handles it), `cancel`; tied to the
  calling handler's cancellation like APICall. No `progress` (fetch has no
  upload progress; it waits for XHR) and no `chunkSizeInBytes`.
- **Download:** through the gate with the response read as a Blob; the name
  from `fileName`, else `Content-Disposition`, else the URL's last segment;
  saved with a temporary `<a download>`.
- **The mock backend:** `readBody` parses `multipart/form-data` and
  `x-www-form-urlencoded` into an object (files as `File`, repeated keys as
  arrays); the request log shows a file as `{ name, size, type }`; a `file()`
  response helper (bytes, type, `Content-Disposition`) for downloads.
- **Fixes:** `isEmptyValue` and `deepEqual` treat objects that aren't plain
  (a `File`) as values: not empty, equal only to themselves.
- **The sandbox invariant:** `File`, `Blob` and `FileList`-free arrays are the
  allowed platform values (decision E); recorded in `codegen.md`. Script still
  can't construct them (not in `CONSTRUCTIBLE`).
- **Theme variables:** XMLUI's names for both components, our tokens as
  defaults.

## Steps

- [x] Bodies (JSON, form, multipart) in the gate; `payloadType`; the mock
      backend's multipart parsing, log and `file()` helper.
- [x] FileInput (value API, Form, `parseAs` in a lazy chunk), FileUploadDropZone
      (overlay, paste, `maxFiles`), Image `data`; the two fixes.
- [x] Upload and download: the `Actions` global, action elements in `<event>`
      (APICall, FileUpload, FileDownload).
- [x] Unit tests (jsdom; the gate and the mock backend in Node); playground
      scenarios; E2E.
- [x] Docs: `code-structure.md`, a subsystem document (`files.md`),
      `data.md`, `mock-backend.md`; *Decisions* in `AGENTS.md`.
- [x] `npm run check`; measure the bundle (papaparse must stay out of the
      eager chunk).

## Verification

- **Unit:** body building as a table (files, arrays, nested objects, null,
  `payloadType`); the mock backend parsing what the gate sends (both in Node,
  real `FormData`); FileInput and FileUploadDropZone through markup with
  `File` objects dropped on the dropzone's input; `parseAs` (CSV options,
  JSON, empty and broken files, `parseError`, `getFields`); the action
  elements' compiled code and their `$param`; `isEmptyValue`/`deepEqual`.
- **E2E:** files dropped (a `DataTransfer` built in the page) and pasted;
  accept and `maxFiles` rejections; the file dialog through Playwright's
  `setInputFiles`; a Form submitting a file to the mock backend as multipart
  (the log shows the file); an upload cancelled; a download saved
  (Playwright's `download` event, its name and bytes); a pasted image shown
  through `Image data`; the CSV chunk loaded only when needed.

## Outcome

- **The components:** FileInput and FileUploadDropZone (`files.tsx`, on
  react-dropzone 20.2.1), FileUpload and FileDownload (action elements),
  Image `data`; APICall gained `payloadType` and works inside `<event>`
  ([files.md](../docs/files.md)). New dependencies: `react-dropzone` 20.2.1,
  `papaparse` 5.7.1 (only in the lazy `files-parse.ts` chunk;
  `@types/papaparse` for development).
- **The runtime:** request bodies (`data/body.ts`: JSON, URL-encoded,
  multipart; a body with a file goes as multipart), Blob responses,
  uploads and downloads on `ApiCaller` (`data/transfer.ts`), the `Actions`
  app global, `actionHandler` (`render/actions.ts`).
- **The compiler:** an `<event>` whose content is one action element compiles
  to `actionHandler(Component, deferred props, handlers, scope)`; the action's
  own handlers see the event's `$param`/`$params`; action-only components
  elsewhere are E037. Metadata: `action: true | "only"`.
- **The mock backend:** form bodies parsed (files as `File`s), binary bodies
  as Blobs, files in the log as `{ file, name, size, type }`, `file()` for
  downloads.
- **Fixes:** `isEmptyValue` and the ChangeListener's `deepEqual` treat a
  `File` as a value.
- **The playground:** "Files and uploads" (56 scenarios), with upload and
  download routes in its backend.
- **Evidence:** `npm run check` passes and prints no warnings: 3,364 unit tests
  in 120 files, 296 E2E tests. New: `runtime/tests/data/transfer.test.ts` (22),
  `compiler/tests/module/actions.test.ts` (11),
  `components/tests/files.test.tsx` (21), `e2e/files.spec.ts` (7), a scenario
  test; the build-output test now expects the CSV chunk and no papaparse in
  the eager code.
- **Size** (against a build of `master`): the hello app's eager JavaScript
  1,224 → 1,259 KiB (336 → 347 KiB gzipped; react-dropzone and the file
  code ship with every app, as every built-in does); papaparse is a lazy
  chunk of 19 KiB; `gfui.js` 1,668 → 1,725 KiB (469 → 488 KiB gzipped).
- **One E2E test changed its bound:** step 32's SkipLink test pressed Tab at
  most 60 times; the new scenario added a tab stop to the side nav (200 now).

### Findings

- **`asForm` uploads were sent as `{}`** in the first version: a ready-made
  `FormData` body went to `JSON.stringify`. `encodeBody` now passes FormData,
  URLSearchParams and buffers through (a unit test).
- **react-dropzone 20 doesn't accept a drag when a validator is set** (it
  can't run it without file names) and reports "unknown"; the overlay shows
  for any drag that isn't rejected. It also handles paste itself: the zone
  sets `noPaste` unless `allowPaste` (else a FileInput or a zone without
  `allowPaste` would take pasted files), and stops a paste into a text input
  before react-dropzone sees it.
- **The validator runs during a drag** on items without a name; an extension
  rule can't refuse then.
- **The handlers of an action need the event's `$param`** (XMLUI passes it to
  them): the drop zone's upload handler adds the dropped files to a list.
- **jsdom's `Blob`/`FormData` aren't Node fetch's** (`object.stream is not a
  function`), and `instanceof Blob` fails across them: the transfer tests run
  in Node's environment, the component tests stub `fetch`, and the mock
  backend's log and the download check a Blob by its shape.
- **MSW's interception in Node loses an uploaded part's file name** (it
  arrives as a Blob); in the browser hosts the name arrives (E2E).
- **New dependencies reload the dev server mid-test** until they are in
  every fixture's `optimizeDeps.include` (the handoff's note): react-dropzone
  and papaparse were added after the first E2E run failed that way.

### Divergences from XMLUI

- A body with a file goes as multipart without `payloadType`, so a Form's
  `submitUrl` sends its files (XMLUI sends them as `{}`).
- Downloads are always fetched (no hidden iframe for a plain GET).
- FileInput's `acceptsFileType` filters by MIME type too (XMLUI's
  octet-stream mapping lets any such file through).
- FileUpload's `error` handler handles the error as APICall's does (XMLUI:
  only when it returns false); no `chunkSizeInBytes`, no `progress`.
- `buttonSize`, `buttonThemeColor`, `buttonVariant` are accepted but not used
  (our Button has no sizes or variants yet).

### Open for later steps

- Upload progress and chunks (XHR).
- Paste into a FileInput; a FileInput's own drag overlay.
- The Button sizes, colors and variants FileInput's button props name.
- `Actions.callApi` and the other XMLUI actions.

## Open questions

None: G, H and I are under *Decisions*. Proposed without asking (say if you want otherwise): MIME
types and extensions both filter FileInput; Image gets `data`; rejected drops
fire nothing (as XMLUI); upload `progress` is not an event yet (handling it
is E004) until uploads use XHR.

## Decisions (asked 2026-11-27)

Carried over from step 32 ([poc-32-remaining.md](poc-32-remaining.md)
*Decisions* 3–6): `react-dropzone` for both components; papaparse in a lazy
chunk; `File` objects in script; multipart bodies and `FileUpload`/
`FileDownload` without chunking.

1. **Both forms** (option G1): action elements (`APICall`, `FileUpload`,
   `FileDownload`) inside `<event>`, and `Actions.upload()`/
   `Actions.download()` for script.
2. **Multipart automatically** when a body has a `File` or `Blob`, and
   `payloadType` to choose explicitly (option H1); a Form's `submitUrl` sends
   files.
3. **Downloads are always fetched** through the HTTP gate and saved through
   an `<a download>` (option I1).
