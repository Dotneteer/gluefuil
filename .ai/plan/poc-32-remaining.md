# Step 32: the remaining components

**Status:** Done (accepted 2026-11-27)

Part of [poc-steps.md](poc-steps.md), the last batch of Phase F: "`FileInput`,
`FileUploadDropZone`, `QRCode`, `IFrame`, `MediaPlayer`, `TableOfContents`,
`Bookmark`, `SkipLink`, `LiveRegion`, non-visual components". E2E is needed for
file drops and accessibility.

## Goal

```xml
<FileInput bindTo="attachment" acceptsFileType="{['.pdf', '.png']}"/>
<FileInput parseAs="csv" onDidChange="r => rows = r.parsedData[0].data"/>
<FileUploadDropZone text="Drop receipts" onUpload="files => receipts.execute(files)"><Card>…</Card></FileUploadDropZone>
<QRCode value="https://example.com/orders/{order.id}" level="M"/>
<MediaPlayer src="/media/intro.mp4" controls="true" onEnded="watched = true"/>
<IFrame src="/embed/chart" sandbox="allow-scripts" onLoad="loaded = true"/>
<TableOfContents/>   <Bookmark id="faq" title="FAQ"/>
<SkipLink target="main"/>   <LiveRegion message="{status}"/>
<ChangeListener listenTo="{search}" debounceWaitInMs="300" onDidChange="c => results.refetch()"/>
<Timer interval="5000" onTick="poll()"/>
<Queue id="jobs" onProcess="item => upload(item)"/>
<MessageListener onMessageReceived="m => log = m.data"/>
<Redirect when="{!user}" to="/login"/>   <PageMetaTitle value="Orders ({count})"/>
```

XMLUI's markup and behavior; what renders is prerendered; file drops, focus
and announcements proven in a real browser.

## Background

### What is still missing

Comparing XMLUI's reference (`website/content/docs/reference/components/*.md`)
with `componentMetadata` (aliases aside):

| Group | Components | Where this plan puts them |
|-------|------------|---------------------------|
| Step 32's list | `FileInput`, `FileUploadDropZone`, `QRCode`, `IFrame`, `MediaPlayer`, `TableOfContents`, `Bookmark`, `SkipLink`, `LiveRegion` | here (decision A: perhaps split) |
| Non-visual | `ChangeListener`, `Timer`, `Queue`, `MessageListener`, `Redirect`, `PageMetaTitle`, `AppState`, `IncludeMarkup` | here (decisions G, H) |
| Small visual leftovers, not on the list | `Logo`, `NoResult`, `ToneSwitch`, `ToneChangerButton`, `FocusScope` | here (decision A) |
| Later steps | `Fallback` (step 33), `I18n`, `Locale` (step 34) | not here |
| Replaced | `FormItem`, `FormSegment` (step 22: `bindTo`), `Fragment`, `Slot` (the compiler has them) | not here |
| Large and separate | `PointerLayer` (drawing with `perfect-freehand`, 343 lines of docs) | not here (decision A) |

### XMLUI

Sources: `xmlui/src/components/<Name>/` and the reference pages above.

- **FileInput** (`FileInput.md`, `FileInputReact.tsx`): a text field with the
  file names and a browse button (`buttonLabel`, `buttonIcon`,
  `buttonIconPosition`, `buttonPosition`, `buttonSize`, `buttonThemeColor`,
  `buttonVariant`), `acceptsFileType`, `multiple`, `directory`, drag and drop
  onto it, `parseAs` (`csv`, `json`: `didChange` gets `{ files, parsedData }`)
  with `csvOptions` (papaparse's config, default `{ header: true,
  skipEmptyLines: true }`), `initialValue`, `placeholder`, `readOnly`,
  `required`, `validationStatus`, `autoFocus`, `enabled`; events `didChange`,
  `gotFocus`, `lostFocus`, `parseError`; API `focus`, `open`, `setValue`,
  `value`, `inProgress`, `getFields`. Binds to a Form
  (`howto/submit-a-form-with-file-uploads.md`): the value is `File[]`.
  Both file components use `react-dropzone` (`useDropzone`,
  `FileInputReact.tsx` 346, `FileUploadDropZoneReact.tsx` 100).
- **FileUploadDropZone**: wraps its children; `acceptedFileTypes`,
  `maxFiles`, `allowPaste` (files pasted from the clipboard; ignored inside
  text inputs, `FileUploadDropZoneReact.tsx` 124), `enabled`, `icon`, `text`;
  event `upload(files: File[])`; it does not upload.
- **Uploads:** XMLUI's `FileUpload` and `FileDownload` actions
  (`components-core/action/FileUploadAction`, `FileDownloadAction`,
  `ApiBoundComponent.tsx` 63–101; used in
  `howto/inline-one-use-action-components.md`) and `RestApiProxy.ts`: a
  multipart body (`asForm`, `fieldName`, `formParams`, 405–450), chunks and
  upload progress, `payloadType` `form`/`multipart-form` (636–700).
- **QRCode** (`QRCodeReact.tsx`, `react-qr-code`): `value`, `size`, `level`
  (L, M, Q, H), `color`, `backgroundColor`, `title`; event `init`.
- **IFrame**: `src`, `srcdoc`, `allow`, `name`, `referrerPolicy`, `sandbox`;
  event `load`; API `postMessage`, `getContentWindow`, `getContentDocument`.
- **MediaPlayer**: a native `<video>`/`<audio>` (`kind`): `src`, `poster`,
  `autoPlay`, `controls`, `loop`, `muted`, `playbackRate`, `preload`,
  `crossOrigin`; events `play`, `pause`, `ended`, `seeked`, `timeUpdate`,
  `loadedMetadata`; API `play`, `pause`, `seek`, `getCurrentTime`,
  `duration`, `paused`, `ended`.
- **TableOfContents** collects the page's `Heading`s and `Bookmark`s into a
  navigable tree: `maxHeadingLevel`, `omitH1`, `smoothScrolling`,
  `scrollStyle`, `showScrollerFade`; event `contextMenu`. **Bookmark**: `id`,
  `title`, `level`, `omitFromToc`; API `scrollIntoView`.
- **SkipLink** (`label`, `target`): hidden until focused. **LiveRegion**
  (`message`, `politeness`): visually hidden `aria-live`. **FocusScope**
  (`trap`, `restore`, `autoFocus`).
- **ChangeListener**: `listenTo` (one value) or `listenToSources` (named
  values; then `didChange` also gets `changedSources` and `changes`),
  `throttleWaitInMs`, `debounceWaitInMs`; `didChange({ prevValue, newValue })`.
- **Timer**: `interval`, `initialDelay`, `once`, `enabled`; `tick` (the next
  waits for the handler); API `pause`, `resume`, `isPaused`, `isRunning`.
- **Queue**: FIFO processing; `willProcess` (false skips), `process`,
  `didProcess(item, result)`, `processError(error, { item, itemId })` (false
  hides the error), `complete`; `progressFeedback`, `resultFeedback`
  templates, `clearAfterFinish`; API `enqueueItem`, `enqueueItems`,
  `getQueuedItems`, `getQueueLength`, `remove`.
- **MessageListener**: `messageReceived(data, event: MessageEvent)`; no
  wrapper element.
- **Redirect**: `to`, `replace`; navigates when it becomes visible.
  **PageMetaTitle**: `value`, `noSuffix` (the App's `name` is the suffix).
- **AppState**: deprecated in XMLUI itself (`AppState.md`: "new apps should
  use reactive globals").
- **IncludeMarkup**: fetches XMLUI markup from a URL at runtime and renders
  it; `loadingContent`, `didLoad`, `didFail`.
- **Logo** (`alt`, `inline`; the App's `logo`), **NoResult** (`label`, `icon`,
  `hideIcon`), **ToneSwitch** (`iconLight`, `iconDark`, `didChange`),
  **ToneChangerButton** (`lightToDarkIcon`, `darkToLightIcon`, `click`).

### Here

- `Fragment` and `Slot` exist (`compile-module.ts` 130–132, 851).
- **Headings have anchors and `scrollIntoView`** (step 23, `text.tsx`
  153–208): what a TableOfContents links to.
- **The App has `logo` and `logoTemplate` but no `name`** (what
  `PageMetaTitle` suffixes).
- **The sandbox invariant** (step 27): no platform object reaches script;
  pointer handlers get a frozen snapshot. A `File` is a platform object but
  reaches no DOM node or window; a `MessageEvent` does (`source`), and so do
  IFrame's `getContentWindow`/`getContentDocument`.
- **The HTTP gate sends JSON only** (`runtime/src/data/http.ts` 82: `body =
  JSON.stringify(spec.body)`), so a `File` in a body becomes `{}`.
  `freezeDeep` freezes plain objects only (`reactivity/variable.ts` 32), so a
  `File` in a variable stays a `File`. Uploads were left open in step 20.
- **A production build has no compiler and no eval** (step 12, checked by
  `tools/build-output.test.ts` and a strict CSP in E2E).
- **The prerender renders a route again** once lazy chunks loaded
  (`noteServerLoad`, step 23): a way for a TableOfContents to be prerendered.

## Options considered

### A. Scope *(decided: split into 32 and 32B)*

1. **Everything above in one step** (except PointerLayer, Fallback, I18n,
   Locale). The largest step so far: about 25 components and uploads.
2. **Split** *(recommended)*: **32** the components that don't handle files
   (QRCode, IFrame, MediaPlayer, TableOfContents, Bookmark, SkipLink,
   LiveRegion, FocusScope, Logo, NoResult, ToneSwitch, ToneChangerButton, and
   the non-visual ones); **32B** files: FileInput, FileUploadDropZone, files in
   script, uploads and downloads (decisions D–F). Each part stays reviewable.
3. **Only step 32's list**; the leftovers and the non-visual ones later.

PointerLayer waits in every option (a drawing surface with its own library).

### B. The QR code library *(decided: `uqr` with our own path)*

**Measured** (`.tmp/vproto/size32/`: `qr-gen.mjs`, `qr-decode.mjs`,
`qr-decode-big.mjs`, `qr-own.js`): four inputs (a URL, 120 digits, Unicode
with an emoji, 809 characters) × levels L, M, Q, H; each SVG rasterized in
Chromium and decoded with jsQR; esbuild sizes (minified, React external).

| | Size (gzipped) | Decoded at 600 px / 1,400 px | SVG per code (average) | Encode (average) |
|---|---|---|---|---|
| `react-qr-code` 2.2.0 (XMLUI) | 24.8 KB (9.1 KB) | 16 / 16 of 16 (no quiet zone: larger modules) | **128,031 B** | 4.3 ms |
| `qrcode` 1.5.4 | 24.8 KB (9.6 KB) | 13 / 16 | 7,329 B | 0.8 ms |
| `uqr` 0.1.3 (its SVG) | 10.7 KB (4.2 KB) | 14 / 16 | 44,826 B | 2.3 ms |
| `qrcode-generator` 2.0.4 | 20.8 KB (7.6 KB) | 14 / 16 | 67,826 B | 3.7 ms |
| **`uqr`'s matrix, our own path** | 10.4 KB (**4.0 KB**) | 13 / 16 | 16,516 B | 2.1 ms |

- **Every encoder is correct:** all decode 16 of 16 at 1,400 px and choose the
  same QR versions; the failures at 600 px are the densest codes (the 809
  characters at M, Q, H: 117–153 modules) and the decoder's resolution.
- **The difference is size and markup:** a prerendered page carries the SVG;
  `react-qr-code` writes a rectangle per module.

1. **`uqr`'s `encode` with our own SVG path** *(recommended)*: the smallest
   library, one `<path>` per code (horizontal runs), prerendered.
2. **`qrcode`:** the most compact SVG, 2.4× the library.
3. **`react-qr-code`** (XMLUI's): heavy markup.

### C. File picking and drops *(decided: `react-dropzone`; step 32B)*

**Measured** (esbuild, React and Mantine external):

| | Size (gzipped) | Folder drops | `accept` (MIME and extensions), rejections | `maxFiles` | `open()` |
|---|---|---|---|---|---|
| `react-dropzone` 20.2.1 (XMLUI) | 17.2 KB (**6.5 KB**) | yes (`file-selector`: walks dropped folders) | yes | yes | yes |
| `@mantine/dropzone` 9.8.2 | 21.9 KB (8.1 KB) | yes (it wraps `react-dropzone`) | yes | yes | yes, plus Mantine's styles to override |
| Our own (native events and an `<input type="file">`) | about 1–2 KB (estimate) | to write (`webkitGetAsEntry`, recursive) | to write | to write | yes |

1. **`react-dropzone`** *(recommended)*: XMLUI's, for both components; the
   folder walk and the accept rules are done.
2. **Our own:** smallest; the folder walk and MIME matching are ours to write
   and test (Playwright can't build a dropped folder).
3. **`@mantine/dropzone`:** Mantine's styling we would only override.

### D. CSV for `parseAs` *(decided: papaparse, lazily; step 32B)*

`csvOptions` is papaparse's whole config in XMLUI (`FileInput.md` §
`csvOptions`: `delimiter`, `header`, `dynamicTyping`, `transform`, …).

1. **papaparse 5.7.1 in a lazy chunk** *(recommended)*: 19.7 KB (7.3 KB
   gzipped), loaded only when a file is parsed as CSV; `csvOptions` works as
   documented.
2. **Our own RFC 4180 parser:** small; only some of papaparse's options.

### E. Files in script *(decided: `File` objects; step 32B)*

1. **`File` objects as they are** *(recommended)*: XMLUI's `File[]` values
   (`file.name`, `file.size`, in a Form's data, in an APICall body). A
   `File` reaches no DOM node or window, which the sandbox invariant protects;
   it is recorded as an allowed platform value.
2. **Frozen records** (`{ name, size, type, lastModified }`) with the files kept
   by the runtime and resolved when sent: the invariant without exceptions;
   `file.text()` and similar aren't available, and XMLUI code that hands files
   to its own functions breaks.

### F. Uploads and downloads *(decided: multipart and the actions; step 32B)*

1. **Bodies with files go as `multipart/form-data`,** in APICall and a Form's
   submit (the HTTP gate builds the `FormData`), **and `FileUpload`/`FileDownload`**
   as XMLUI's actions without chunking *(recommended)*. Upload progress needs
   XHR (fetch has no upload progress): it waits.
2. **Only multipart bodies;** the actions later.
3. **Nothing yet:** the file components hand files to script, and uploading
   waits (step 20's open item stays open).

### G. IncludeMarkup *(decided: left out)*

It compiles markup fetched at runtime, which a production build can't do
(no compiler, no eval).

1. **Standalone only** *(recommended)*: it works with `gfui.js` (the compiler
   is there); in a Vite build it is an error that suggests a component file.
2. **A lazy compiler chunk at runtime:** works everywhere, but needs eval
   (`loadModule`) and breaks the strict CSP a build passes today.
3. **Leave it out.**

### H. AppState *(decided: removed, with a message)*

1. **Removed** *(recommended)*: E032 with a message pointing at reactive
   globals (`global.x` and `Globals.xs`), as XMLUI itself advises
   (`AppState.md`).
2. **Built** for XMLUI apps that still use it.

## Design

- **Step 32 builds everything here except the file components and uploads
  (32B, its own plan `poc-32b-files.md`, written after 32 is merged); no
  IncludeMarkup; AppState is E032 pointing at reactive globals.**
- **Files:** `components/src/media.tsx` (QRCode, IFrame, MediaPlayer),
  `toc.tsx` (TableOfContents, Bookmark, the heading registry), `a11y.tsx`
  (SkipLink, LiveRegion, FocusScope), `misc.tsx` (Logo, NoResult, ToneSwitch,
  ToneChangerButton, PageMetaTitle, Redirect), `nonvisual.tsx` (ChangeListener,
  Timer, Queue, MessageListener); for 32B `files.tsx` (FileInput,
  FileUploadDropZone) and the upload code in `runtime/src/data/`.
- **QRCode** (decision B): the SVG during render (prerendered), a quiet zone,
  `size`, `color`, `backgroundColor`, `title` (`role="img"`, `aria-label`).
- **IFrame:** native; `postMessage` in its API. **`getContentWindow` and
  `getContentDocument` are left out** (they hand script a window and a
  document); a compile error says why.
- **MediaPlayer:** native `<video>` or `<audio>`; events with frozen state
  (`{ currentTime, duration, paused }`), never the DOM event.
- **TableOfContents and Bookmark:** Headings (with anchors) and Bookmarks
  register in a registry per App; the TOC renders the list, scrolls on click
  (`smoothScrolling`) and moves focus, and marks the heading in view (an
  `IntersectionObserver`). **Prerendered** through an extra prerender pass
  (`requestServerRender`); hydration reads the prerendered list back from the
  DOM (*Outcome*).
- **SkipLink:** an `<a href="#target">` shown when focused, which moves focus
  to the target. **LiveRegion:** a visually hidden `aria-live` region (polite,
  assertive). **FocusScope:** a focus trap and restore (our own: Mantine's
  `FocusTrap` always moves focus when it activates).
- **ChangeListener:** an effect on the listened value (it runs only when the
  binding's value changes, since step 31's per-binding computeds), compared
  structurally: `prevValue`/`newValue`, the sources' changes, throttle and
  debounce; the first value fires nothing (XMLUI).
- **Timer:** XMLUI's: `setInterval`, a tick skipped while the previous
  handler runs (the plan said chained timeouts; XMLUI's cadence was kept);
  `pause`, `resume`; stops on unmount. **Queue:** FIFO over async handlers, its
  templates and API. **MessageListener:** the handler gets `data` and a frozen
  `{ data, origin }`, not the `MessageEvent` (whose `source` is a window).
- **Redirect:** `navigate(to, { replace })` when it mounts, through the
  navigation guard; prerendered routes ignore it. **PageMetaTitle:** sets
  `document.title` (the prerender writes `<title>`); the suffix needs the App's
  `name`, which this step adds.
- **Logo, NoResult, ToneSwitch, ToneChangerButton:** XMLUI's props, on the
  App's logo and Icon; ToneSwitch is a `role="switch"` button of our own (its
  thumb shows the icon, which Mantine's Switch styles would only fight), and
  ToneChangerButton an icon button.
- **32B:** FileInput on Mantine's input look with `react-dropzone`, bound to a
  Form like any input (`bindTo`), `parseAs` (papaparse lazily, JSON),
  FileUploadDropZone wrapping its children with an overlay while dragging,
  paste, the upload code (decisions E, F).
- **Theme variables:** XMLUI's names, our tokens as defaults.

## Steps (step 32; 32B gets its own plan)

- [x] QRCode, IFrame, MediaPlayer.
- [x] TableOfContents, Bookmark, the heading registry; verify the prerender.
- [x] SkipLink, LiveRegion, FocusScope; Logo, NoResult, ToneSwitch,
      ToneChangerButton, PageMetaTitle (and App `name`), Redirect.
- [x] ChangeListener, Timer, Queue, MessageListener; AppState as E032 (removed).
- [x] Unit tests (jsdom); playground scenarios; E2E.
- [x] Docs: `code-structure.md`, a new subsystem document; *Decisions* in
      `AGENTS.md`.
- [x] `npm run check`; measure the bundle.

## Verification

- **jsdom:** each component through markup; QR output decoded in a unit test
  (jsQR as a dev dependency) or checked against the module matrix; the
  ChangeListener's timing with fake timers; Timer and Queue order and errors;
  the prerender of QRCode and the TableOfContents.
- **E2E:** a QR code decoded from a screenshot; MediaPlayer events with a
  short generated clip; IFrame `load` and `postMessage` both ways
  (MessageListener); the TableOfContents follows scrolling and moves focus;
  SkipLink by keyboard; FocusScope traps Tab; LiveRegion's text in the
  accessibility tree. 32B: files dropped and pasted (a `DataTransfer` built in
  the page), accept and `maxFiles` rejections, a Form submitting a file to the
  mock backend as multipart.

## Outcome

- **The components:** QRCode, IFrame, MediaPlayer, TableOfContents, Bookmark,
  SkipLink, LiveRegion, FocusScope, Logo, NoResult, ToneSwitch,
  ToneChangerButton, PageMetaTitle, Redirect, ChangeListener, Timer, Queue,
  MessageListener; AppState is E032; App has `name`; Heading has
  `omitFromToc` ([remaining-components.md](../docs/remaining-components.md)).
  One new dependency: `uqr` 0.1.3 (and `jsqr` 1.4.0 for tests).
- **The TableOfContents is prerendered** (verified first, as planned). It
  takes one or two extra passes of the prerender's loop:
  - headings record themselves during a static pass; the TableOfContents
    renders the previous pass's list and asks for another pass
    (`requestServerRender`) when there is none, or when that pass waited for
    code (Markdown's chunk: then three passes);
  - `renderStatic` now runs inside `inStaticRender(path, app, …)`, and
    `staticRenderInfo().previous` is set only when the previous pass rendered
    the same app at the same path (a first attempt used a stale pass from
    another render of "/" in a test);
  - hydration renders the same list: `getServerSnapshot` reads it back from
    the prerendered `<nav>` (found by `useId`); then the live registry takes
    over, but only once it covers the prerendered list, since Markdown's
    headings hydrate later.
- **PageMetaTitle is prerendered** into `<title>`: a static pass records it,
  `renderStatic` returns `title`, the plugin writes it (`injectTitle`).
- **The compiler:** `receivesId` (`$$id`; a Bookmark's id may be any anchor
  name), `removedApi` (C015 says why), a component-level
  `deprecationMessage` (E024).
- **The runtime:** `static-render.ts`, `requestServerRender`,
  `contentToast` (a Queue's feedback templates as toast content).
- **The mock backend's worker** lets media and range requests through
  (`MEDIA_BYPASS`, *Findings*).
- **The playground:** "Embeds and media", "Table of contents", "Timers,
  queues and listeners", "Focus, tone and announcements" (55 scenarios); a
  2-second WebM clip in `playground/public/media/` (made with ffmpeg). The
  hello app has a TableOfContents, a QR code and a PageMetaTitle, so the
  prerender and the takeover are checked on them.
- **Evidence:** `npm run check` passes and prints no warnings: 3,310 unit
  tests in 117 files, 288 E2E tests. New: `components/tests/step32.test.tsx`
  (42), `compiler/tests/module/step32.test.ts` (8),
  `runtime/tests/render/static-render.test.ts` (6),
  `vite-plugin/tests/mock.test.ts` (6), `injectTitle` cases,
  `e2e/remaining.spec.ts` (10), four scenario tests, TableOfContents, QR and
  title checks in `ssg.spec.ts`. Two mutations proved the takeover tests: without
  the DOM read-back, jsdom's takeover gets a hydration error; without waiting
  for the live list to cover the prerendered one, "takeover changes nothing"
  fails (Markdown's heading and the ones after it are replaced).
- **Size** (against a build of `master`): the hello app's eager JavaScript
  1,187 → 1,224 KiB (325 → 336 KiB gzipped), with a TableOfContents and a QR
  code now in it; `gfui.js` 1,616 → 1,668 KiB (453 → 469 KiB gzipped). The
  fixtures' `chunkSizeWarningLimit` went from 900 to 1,000 kB: the main chunk
  (every built-in) is 922 kB.

### Findings

- **MSW breaks video seeking in Chrome.** The playground's video couldn't
  seek (`seekable` `[0, 0]`); the same file from a blob could. MSW's worker
  passes every request on through its own `fetch()`, and Chrome's media
  loader doesn't treat that response as range-capable. A fetch listener ahead
  of MSW's lets video, audio and range requests go to the network
  (`vite-plugin/src/mock.ts` `MEDIA_BYPASS`). It affects any app on the mock
  backend's worker host, not only the playground.
- **`renderToString` hoists React 19's `<title>`** to the start of its output,
  inside the prerender's container, where hydration wouldn't match it. Hence
  the separate title channel.
- **A component API value is undefined until the API registers** (after
  commit), so `ChangeListener listenTo="{box.value}"` fires once for
  undefined → "". XMLUI's ChangeListener does the same; the scenario writes
  `{search.value ?? ''}`.
- **Bookmark ids are anchors** (`getting-started`), which E011 rejected for
  any component. Such ids are accepted where `receivesId` is set; one that
  isn't an identifier has no API.
- **Every heading now has an id** from its text (XMLUI gives every heading an
  anchor), so five Heading and Markdown expectations changed.
- **A SkipLink inside `<main>` focused itself** (it is the main region's first
  focusable element); skip links are skipped.

### Divergences from XMLUI

- IFrame has no `getContentWindow`/`getContentDocument` (C015 with the
  reason); MessageListener's second argument is a frozen `{ data, origin }`.
- The TableOfContents registry is per App (XMLUI: per Pages); a click moves
  focus to the heading and doesn't change the URL (under hash routing the
  hash is the route); the marked item has its own border (no moving
  indicator element); headings with the same text share an id (XMLUI adds
  `-1`, `-2`).
- PageMetaTitle's suffix is App's new `name` prop (XMLUI: the app config's
  `name`); it restores the previous title when it unmounts (as Helmet does).
- SkipLink renders in place, not portaled to `body`.
- FocusScope and ToneSwitch are our own, not Mantine's.
- Queue handlers don't see `$completedItems`/`$queuedItems` (the API gives
  them: `getQueuedItems()`); `$this` doesn't exist here.
- ToneChangerButton is a deprecation warning (E024), as XMLUI deprecated it.
- IncludeMarkup is not a component (E001); AppState is E032.

### Open for later steps

- **Step 32B:** FileInput, FileUploadDropZone, files in script, uploads
  (its own plan, after this step is merged).
- Unique ids for headings with the same text; the `bookmark` behavior (XMLUI's
  `bookmark`, `bookmarkLevel`, … on any component).
- Queue handlers with `$completedItems`/`$queuedItems`.
- PointerLayer; IncludeMarkup (standalone only, if wanted).
- Bundle size: the main chunk carries every built-in (step 24's finding).

## Open questions

None for step 32: the answers are under *Decisions*. Proposed without asking
(say if you want otherwise): IFrame without `getContentWindow`/`getContentDocument`;
MessageListener's frozen event; MediaPlayer's frozen event state; the App gets
`name`; PointerLayer waits; the TableOfContents is prerendered through the
second render if that works, else client-only.

## Decisions (asked 2026-11-27)

1. **Split** (option A2): step 32 builds the components that don't handle
   files and the non-visual ones; **step 32B** builds FileInput,
   FileUploadDropZone, files in script, uploads and downloads.
2. **QRCode: `uqr`'s matrix with our own one-path SVG** (option B1, after the
   comparison).
3. **32B: `react-dropzone`** for FileInput and FileUploadDropZone (option C1).
4. **32B: papaparse in a lazy chunk** for `parseAs="csv"` (option D1).
5. **32B: `File` objects reach script as they are** (option E1), recorded as an
   allowed platform value of the sandbox invariant.
6. **32B: multipart bodies in APICall and Form, and `FileUpload`/`FileDownload`
   without chunking** (option F1).
7. **IncludeMarkup is left out** (option G3).
8. **AppState is removed**: E032 with a message pointing at reactive globals
   (option H1).
