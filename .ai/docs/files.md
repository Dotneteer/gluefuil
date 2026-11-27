# Files and uploads

Step 32B ([`../plan/poc-32b-files.md`](../plan/poc-32b-files.md)): picking,
dropping and pasting files, parsing CSV and JSON, request bodies with files,
uploads and downloads, and action elements inside `<event>`.

| File | What |
|------|------|
| `components/src/files.tsx` | `FileInput`, `FileUploadDropZone`, the accept rules (`acceptRules`, `acceptsFile`), `parseFiles` |
| `components/src/files-parse.ts` | The lazy chunk: papaparse (`parseCsv`) |
| `components/src/data.tsx` | `runApiCall` (APICall's execution, shared with an APICall inside `<event>`), `APICall.runAction`, `FileUpload`, `FileDownload` |
| `components/src/display.tsx` | Image `data` (`useBlobUrl`) |
| `runtime/src/data/body.ts` | `encodeBody`: JSON, URL-encoded, multipart; `containsBinary`, `appendField` |
| `runtime/src/data/transfer.ts` | `upload`, `download`, `uploadSpec`, `downloadSpec`, `downloadName`, `saveBlob`, the `Actions` app global |
| `runtime/src/render/actions.ts` | `actionHandler`: the handler of an action element in `<event>` |
| `compiler/src/module/compile-module.ts` | `actionHandler()`: an action element as an `<event>`'s content; E037 for action-only components elsewhere |
| `mock-backend/src/index.ts` | Form bodies parsed (`formObject`), binary bodies as Blobs, files in the log (`logView`), the `file()` response helper |

## In markup

```xml
<Form submitUrl="/api/tickets">                               <!-- multipart: the body has a File -->
  <FileInput label="Attachments" bindTo="attachments" multiple="true" acceptsFileType="{['.pdf', 'image/*']}"/>
</Form>

<FileInput parseAs="csv" csvOptions="{{ dynamicTyping: true }}" onDidChange="r => rows = r.parsedData[0].data"/>

<FileUploadDropZone allowPaste="true" acceptedFileTypes="image/*" maxFiles="3">
  <event name="upload">
    <FileUpload url="/api/images" file="{$param[0]}" asForm="true" onSuccess="r => images = [...images, ...$param]"/>
  </event>
  <Items data="{images}"><Image data="{$item}"/></Items>
</FileUploadDropZone>

<APICall id="send" method="post" url="/api/receipts" body="{{ receipt: box.value[0], note }}"/>  <!-- multipart -->
<Button label="Report"><event name="click"><FileDownload url="/api/report.csv"/></event></Button>
<Button label="Script" onClick="Actions.download({ url: '/api/report.csv', fileName: 'r.csv' })"/>
```

## Files in script

`File` objects reach script as they are (decision E): `file.name`,
`file.size`, `file.type`, `await file.text()`. They pass through variables
(`freezeDeep` freezes plain objects only) and bindings, and a Form's data
holds them. Script can't construct them (`File`, `Blob` aren't in
`CONSTRUCTIBLE`). Two checks treat them as values: `isEmptyValue` (a `File`
is not empty, so `required` passes) and the ChangeListener's `deepEqual`
(only plain objects compare by keys).

## FileInput

A view (`FileInputView`) wrapped by `wrapComponent` like the other inputs, so
the value API, `bindTo`, `required`, `validationStatus`, `setValue` and
`gotFocus`/`lostFocus` work as for a TextBox. It renders a read-only Mantine
`TextInput` with the names (a click, Enter or Space opens the dialog), a
browse button (Mantine's Button with our Button's look; `buttonLabel`,
`buttonIcon`, `buttonIconPosition`, `buttonPosition`) and react-dropzone's
hidden `<input type="file">` (`accept`, `multiple`, `webkitdirectory`), and
takes drops on the whole component. `readOnly` and `enabled="false"` take no
files. FileInput ignores pasted files (`noPaste`).

- **The value** is a frozen `File[]`; with `parseAs` it is (as XMLUI)
  `{ files, parsedData: [{ file, data, error? }] }`, which `didChange` also
  receives.
- **parseAs:** JSON is parsed in place (an object becomes `[object]`; an
  empty file `[]`); CSV loads `files-parse.ts` (papaparse) through
  `lazyResource` the first time, with `{ header: true, skipEmptyLines: true,
  ...csvOptions }` (its callbacks `complete`, `error`, `step`, `chunk`,
  `worker` are dropped). A failure gives `parseError(error, file)` (else the
  console) and `data: []`. `getFields()` is the last CSV's header;
  `inProgress` is true while parsing (a signal, so bindings follow).
- **Accept rules** (`acceptsFile`): `.ext` by name, `type/*` and `type/sub`
  by MIME type; both kinds filter (XMLUI maps every extension under
  `application/octet-stream`, which lets any such file through). They run as
  react-dropzone's `validator`. During a drag the browser shows types only,
  so an extension rule can't refuse then; `parseAs` without
  `acceptsFileType` accepts its own extension.

## FileUploadDropZone

A `div` (`role="group"`, focusable, named by `text`) with react-dropzone's
root props around its children. Accepted files fire `upload(files)` (a frozen
array); it doesn't upload. A drop with a rejected file (type, or more than
`maxFiles`) fires nothing, as in XMLUI. Without children it shows its icon
(`upload`) and text; while a drag is over it (active and not rejected:
react-dropzone 20 reports "unknown" rather than "accept" when a validator is
set, since it can't run it during a drag) an overlay shows them over the
children. **Paste** is react-dropzone's own handling, on only with
`allowPaste` (`noPaste` otherwise); our `onPaste` runs first and stops a
paste into a text input or an editable element inside the zone. API
`open()`.

## Request bodies (`runtime/src/data/body.ts`)

`sendRequest` encodes `spec.body` with `encodeBody(body, payloadType)`
(decision H):

| Body | No `payloadType` | `json` | `form` | `multipart-form` |
|------|------------------|--------|--------|------------------|
| A plain object or array without a file | JSON | JSON | URL-encoded | FormData |
| With a File or Blob anywhere (`containsBinary`) | **FormData** | JSON (the files become `{}`) | URL-encoded | FormData |
| A string | as it is | JSON | — | — |
| A Blob or File | as it is, its type as Content-Type | | | |
| A FormData, URLSearchParams, ArrayBuffer | as it is | | | |

The fields follow XMLUI's `appendFormFieldValue`: files as they are, arrays
repeat the key, nested objects as `a.b`, null and undefined left out. For
FormData no Content-Type is set (a given one is removed): the browser writes
it with the boundary. APICall has `payloadType`; a Form's `submitUrl` sends its
data through the same rules, so a FileInput's files arrive (XMLUI sends them
as `{}`).

## Uploads and downloads (`runtime/src/data/transfer.ts`)

Both run on an `ApiCaller`, as APICall does: the calling handler's
cancellation aborts them, `onSuccess`/`onError`/`onCancel`, invalidation
after an upload.

- **upload:** `asForm` builds a FormData with the file under `fieldName`
  (default `file`) and `formParams`; otherwise the file itself is the body
  (with its type); `method` defaults to post. No chunks, no upload progress
  (fetch has none: `progress` isn't an event, so handling it is E004).
- **download** (decision I): always fetched through the gate with
  `responseType: "blob"`, then saved through a temporary `<a download>` with an
  object URL (revoked a second later). The name: `fileName`, else the
  response's `Content-Disposition` (`filename*` first), else the URL's last
  segment, else "download". A failure saves nothing.
- **`Actions.upload(options)` / `Actions.download(options)`**: the app global
  (`APP_GLOBALS`); `onSuccess`/`onError`/`onCancel` are functions.

## Action elements inside `<event>` (decision G)

An `<event>` whose only content is an element of a component with
`action` in its metadata (`APICall`: `true`; `FileUpload`, `FileDownload`:
`"only"`, which is E037 anywhere else) compiles to
`($$s) => $$action(Component, props, handlers, $$s)`:

- every prop is deferred with `$param`/`$params` (the event's arguments): a
  constant stays a string, an expression is `$$deferred($$s, binding)`;
- `on*` attributes and `<event>` children are the action's own handlers; they
  are compiled with `$param`/`$params` visible, and the runtime runs them in a
  child scope holding the event's arguments (a statement handler's own
  arguments shadow them);
- `id`, `when`, variables and content are E002; required props E021; unknown
  props E020 and events E004.

`actionHandler` (runtime) returns the handler: per call it makes a handler
slot for each of the element's handlers and calls the component's static
`runAction({ props, handlers, params })` before any await, so the action reads
the running invocation (its cancellation). `APICall.runAction` resolves its
non-deferred props (`retries`, `timeoutMs`) with the event's arguments and runs
`runApiCall` with a new `ApiCaller`; `FileUpload.runAction` and
`FileDownload.runAction` resolve every prop and call `upload`/`download`.

## Image `data`

Without `src`, a `Blob`/`File` in `data` is shown through an object URL made
after mount (`useBlobUrl`), revoked when the data changes or the image
unmounts. A static render has none.

## The mock backend

- `readBody`: `multipart/form-data` and `x-www-form-urlencoded` become an
  object (a field once is its value, a repeated one an array; files stay
  `File`s); another non-JSON, non-text type is a Blob; JSON and text as before.
- The request log keeps a file as `{ file: true, name, size, type }`
  (`logView`; Blob-like by shape, since the parser's Blob class may not be the
  page's).
- `file(content, { type, name, status })`: a download response with a
  `Content-Disposition` attachment.
- **Found:** MSW's interception in Node delivers an uploaded part as a Blob
  without its file name; the browser hosts keep the name (the E2E tests check
  it).

## Tests

- `runtime/tests/data/transfer.test.ts` (22, Node environment: jsdom's
  `Blob`/`FormData` aren't Node fetch's): `encodeBody` as a table, bodies
  through the gate to the mock backend (multipart, URL-encoded, the log), the
  upload forms, `downloadName`, a download saved.
- `compiler/tests/module/actions.test.ts` (11): what compiles and what is
  reported for action elements; the generated code.
- `components/tests/files.test.tsx` (21, a stubbed `fetch`): the accept rules
  and the two fixes; FileInput (picked files, accept, readOnly, a Form with
  `required`, a multipart submit, CSV and JSON); the drop zone (`maxFiles`,
  types); Image `data`; APICall, FileUpload and FileDownload in `<event>`
  (with `$param` in the action's handler); `Actions`.
- `e2e/files.spec.ts` (7, project "playground"): a multipart form round trip
  with names and sizes; drops on a FileInput and on the zone (overlay,
  rejections); a paste (once; none into a FileInput); CSV through the lazy
  chunk (loaded only then), a broken JSON; an upload cancelled, then done; a
  download's name and bytes. A scenario test in `playground-scenarios.spec.ts`.
