# Embeds, contents, accessibility and non-visual components

Step 32 ([`../plan/poc-32-remaining.md`](../plan/poc-32-remaining.md)): the
components that don't handle files. Step 32B adds FileInput,
FileUploadDropZone and uploads.

| File | Components |
|------|------------|
| `components/src/media.tsx` | `QRCode`, `IFrame`, `MediaPlayer` |
| `components/src/toc.tsx` | `TableOfContents`, `Bookmark`, the heading registry (`HeadingRegistry`, `useTocEntry`) |
| `components/src/a11y.tsx` | `SkipLink`, `LiveRegion`, `FocusScope` |
| `components/src/misc.tsx` | `Logo`, `NoResult`, `ToneSwitch`, `ToneChangerButton`, `PageMetaTitle`, `Redirect` |
| `components/src/nonvisual.tsx` | `ChangeListener`, `Timer`, `Queue`, `MessageListener` |
| `components/src/app-info.ts` | `AppInfoContext`: the App's `name` and logo URL |
| `runtime/src/render/static-render.ts` | `staticRenderInfo()` (the prerender's passes), `setStaticTitle` |

## In markup

```xml
<App name="Shop" logo="/logo.svg">
  <SkipLink/>
  <PageMetaTitle value="Orders ({count})"/>           <!-- the tab: "Orders (3) | Shop" -->
  <TableOfContents maxHeadingLevel="3" omitH1="true"/>
  <H2>Getting started</H2>                              <!-- id="getting-started", listed -->
  <Bookmark id="faq" title="FAQ" level="2"/>            <!-- any anchor name; listed -->
  <QRCode value="https://example.com/orders/{order.id}" level="M" size="160"/>
  <IFrame id="frame" src="/embed/chart" sandbox="allow-scripts"/>
  <MessageListener onMessageReceived="(data, m) => log = m.origin + ': ' + data"/>
  <MediaPlayer id="player" src="/intro.webm" onEnded="watched = true"/>
  <LiveRegion message="{status}"/>
  <FocusScope when="{editing}" autoFocus="true">…</FocusScope>
  <ToneSwitch/>
  <ChangeListener listenTo="{search.value ?? ''}" debounceWaitInMs="300" onDidChange="c => results.refetch()"/>
  <Timer id="poll" interval="5000" onTick="refresh()"/>
  <Queue id="jobs" onProcess="p => upload(p.item)">
    <property name="progressFeedback"><Text>{$completedItems.length} of {$queuedItems.length}</Text></property>
  </Queue>
  <Redirect when="{!user}" to="/login"/>
</App>
```

## The sandbox invariant

No DOM node, window or DOM event reaches script (step 27). Here:

- **IFrame** has `postMessage(message, targetOrigin = "*")` only. XMLUI's
  `getContentWindow` and `getContentDocument` are listed in the metadata's
  `removedApi`, so `frame.getContentWindow()` is C015 with the reason
  instead of "did you mean" (`MemberLookup.removed` in the emitter).
- **MessageListener**'s handler gets `(data, { data, origin })`: the data
  deep-frozen, the second argument a frozen record, never the `MessageEvent`
  (whose `source` is a window).
- **MediaPlayer**'s events get frozen snapshots: `{ currentTime }`, and
  `loadedMetadata` `{ duration, videoWidth, videoHeight }` (as XMLUI documents
  them). `duration`, `paused`, `ended` are reactive API values (a signal);
  `getCurrentTime()` reads the element when called.

## QRCode

`uqr`'s `encode` gives the module matrix; `qrPath` draws it as **one SVG
path**, a rectangle per horizontal run of dark modules (decision B: the
smallest library and the least markup in a prerendered page). The SVG is in
module units (`viewBox="0 0 n n"`, `shape-rendering: crispEdges`), filled with
`currentColor`; the container's padding and background are the quiet zone
(`padding-QRCode`, `backgroundColor-QRCode`). `size` sets `--gfui-qr-size`,
else the width is `size-QRCode` (a unitless number, as in XMLUI) in px. A value
too long for a QR code renders a placeholder with `role="img"`.

## TableOfContents and Bookmark

**The registry.** Every `Heading` with text has an anchor id from its text
(`headingId`; XMLUI gives every heading an anchor) and registers with the
App's `HeadingRegistry` (`HeadingRegistryContext`; a shared default outside an
App) unless `omitFromToc`. A `Bookmark` registers with its `id` (passed as
`$$id`: the metadata's `receivesId`), its `title`, else its text, else its id.
In the browser they register in a layout effect, with their element; the
registry sorts by document position (`compareDocumentPosition`).

**The TableOfContents** reads the registry with `useSyncExternalStore`,
filters by `maxHeadingLevel` and `omitH1`, and renders links (`href="#id"`).
A click (not Ctrl/Cmd) scrolls the registered element into view
(`smoothScrolling`), gives it `tabindex="-1"` if needed and focuses it, and
marks the item (`aria-current="location"`). An `IntersectionObserver` with
the bottom 80% of the view cut off (XMLUI's `rootMargin`) marks the heading
at the top while scrolling; it is suspended briefly after a click. The URL
is not changed (under hash routing the hash is the route).

**The prerender.** A static render can't see headings that render after the
TableOfContents. So:

1. During a static pass (`staticRenderInfo()` is set by `renderStatic`),
   headings and bookmarks also **record** themselves in a table per pass
   (keyed by `useId`).
2. The TableOfContents renders the **previous pass's** table, if that pass
   rendered the same app at the same path (`info.previous`) and did not wait
   for code (`waited`: a `noteServerLoad` during it). Otherwise it renders
   nothing and calls `requestServerRender()`: the prerender's loop renders the
   route again. A page with a TableOfContents takes two passes; with Markdown
   (a lazy chunk) three; the loop allows four.
3. **Hydration** must render what the server rendered. The TableOfContents's
   `getServerSnapshot` returns, while hydrating, the list read back from its
   own prerendered `<nav data-toc="…">` (found by `useId`, which is the same in
   both renders). Then the live registry takes over.
4. **Headings in a lazy chunk** (Markdown) hydrate later. Until the live list
   covers the prerendered one (same ids, levels, texts), or 3 s pass
   (`TAKEOVER_WAIT_MS`), the prerendered list stays, so no node is replaced.
   Items are keyed by position, so the live list reuses the prerendered nodes.

Evidence: `components/tests/step32.test.tsx` (two passes, takeover without a
recoverable error and with the same nodes; it fails if hydration doesn't read
the DOM back), `e2e/ssg.spec.ts` (the hello build: Markdown's heading in the
prerendered list, "takeover changes nothing"; it fails without step 4).

## SkipLink, LiveRegion, FocusScope

- **SkipLink:** an `<a href="#target">` positioned off screen until it has
  focus (`.gfui-SkipLink:focus`). Following it focuses the target's first
  focusable element (skip links excluded), else the target itself
  (`tabindex="-1"`), and scrolls there. `target` defaults to `main`: an
  element with that id, else the App's `<main>`. It renders in place (XMLUI
  portals it to `body`), so the prerender has it.
- **LiveRegion:** a visually hidden region (`clip-path: inset(50%)`):
  `role="status"` with `aria-live="polite"`, or `role="alert"` with
  `assertive`; `aria-atomic`.
- **FocusScope:** our own small trap (the plan named Mantine's `FocusTrap`,
  which always moves focus on activation): Tab and Shift+Tab cycle among the
  focusable descendants (`trap`), `autoFocus` focuses the first on mount,
  `restore` returns focus to the element focused before mount when it unmounts.

## Logo, NoResult, ToneSwitch, ToneChangerButton, PageMetaTitle, Redirect

- **Logo:** the App's logo URL for the tone (`appLogoUrl`, through
  `AppInfoContext`); nothing without one.
- **NoResult:** an icon (`noresult`) and a label.
- **ToneSwitch:** a `role="switch"` button with a thumb icon (`sun`, `moon`);
  `setThemeTone`; `didChange(tone)`. **ToneChangerButton:** an icon button;
  `click(tone)`. XMLUI deprecated it, so using it is E024 (the metadata's
  component-level `deprecationMessage`).
- **PageMetaTitle:** sets `document.title` (with " | " and the App's `name`,
  unless `noSuffix`) and restores the previous title when it unmounts. A static
  pass records it (`setStaticTitle`); `renderStatic` returns it as `title`, and
  the Vite plugin writes it into the page's `<title>` (`injectTitle`). React
  19's own `<title>` isn't used: `renderToString` hoists it into the
  container, which hydration would not match.
- **Redirect:** `navigate(to, { replace })` in an effect when it mounts (once
  per target), so through the App's `willNavigate`; a static render never
  navigates.

## ChangeListener, Timer, Queue, MessageListener

- **ChangeListener** (XMLUI `ChangeListenerReact.tsx`): an effect on the
  listened value compares it structurally (`deepEqual`) with the previous one;
  the first value fires nothing. `listenToSources` (wins over `listenTo`)
  adds `changedSources` and `changes` (`sourcesChange`). `debounceWaitInMs`
  (trailing) or `throttleWaitInMs` (leading and trailing, as lodash):
  `rateLimited`. **Note:** a component API value is undefined until the
  component registers its API after commit, so `listenTo="{box.value}"` fires
  once for undefined → "" (XMLUI's semantics too); write `{box.value ?? ''}`.
- **Timer** (XMLUI `TimerReact.tsx`): `setInterval` (`once`: `setTimeout`),
  after `initialDelay` the first time; a tick is skipped while the previous
  handler runs (`eventResults`: the handler's promise is awaited; errors are
  reported). API `pause()`, `resume()`, `isPaused()`, `isRunning()` read a
  signal, so bindings follow them.
- **Queue** (XMLUI `QueueReact.tsx`): the entries in a signal; one item at a
  time. The handlers get XMLUI's arguments: `willProcess({ item,
  actionItemId, processItemContext })` (false skips), `process({ …,
  onProgress, reportProgress })` (its result kept), `didProcess({ …,
  processItemContext: { processResult } })`, `processError(error, { … })`
  (false hides it; else it is reported and shown as an error toast). A thrown
  string becomes an `Error` with that message. `complete()` when it empties.
  `progressFeedback` is a loading toast whose content is the live template;
  `resultFeedback` replaces it with a success toast (a snapshot) when an item
  completed. Toasts got `content` for this (`contentToast` in
  `runtime/src/render/overlay-state.ts`; not an app global).
- **MessageListener:** a `message` listener on `window`; its children render
  as they are.

## The compiler

- **`receivesId`** (Bookmark): the literal `id` is passed as `$$id`. An id
  that isn't an identifier (`getting-started`) is accepted for such a
  component and is not a component ID (no API); elsewhere it stays E011.
- **`removedApi`**: C015's message says why a member is left out.
- **Component `deprecationMessage`**: E024 (a warning) on use.
- **AppState** is `removed`: E032 pointing at reactive globals. IncludeMarkup
  is not a component (E001).

## Theme variables

XMLUI's names, with our tokens as defaults (`metadata.ts` `STEP32_COMPONENTS`):
`backgroundColor-QRCode`, `color-QRCode`, `padding-QRCode`, `size-QRCode`;
`border-IFrame`, `borderRadius-IFrame`, `width-IFrame`, `height-IFrame`;
`borderRadius-MediaPlayer`; the TableOfContents and TableOfContentsItem
variables (per-level padding and weight, indicator width and colors, text
colors with `--active` and `--hover`); NoResult's; ToneSwitch's. The CSS is
`REMAINING` in `styles.ts`.

## The mock backend and media

MSW's worker passes every request on through its own `fetch()`, and Chrome
then can't seek a video (found with MediaPlayer: `seekable` was `[0, 0]`). The
plugin's worker script starts with `MEDIA_BYPASS` (`vite-plugin/src/mock.ts`):
a fetch listener, registered before MSW's, that stops the event for video,
audio and range requests, so the browser fetches them itself.

## Tests

- `components/tests/step32.test.tsx` (42): every component through markup;
  QR codes decoded with jsQR (`rasterize` draws the path); the TableOfContents
  prerender passes and takeover; PageMetaTitle's static title; Timer and Queue
  order, skipping and errors; ChangeListener's debounce and throttle.
- `compiler/tests/module/step32.test.ts`: `$$id`, anchor ids, C015 with the
  reason, E024, E032, E001.
- `runtime/tests/render/static-render.test.ts`: passes, `previous`, `waited`,
  the title.
- `vite-plugin/tests/prerender.test.ts` (`injectTitle`), `mock.test.ts`
  (`MEDIA_BYPASS`).
- `e2e/remaining.spec.ts` (10, project "playground"): the QR code decoded from
  a screenshot of the element; the frame's load and messages both ways; the
  video played to its end, its events and state, a seek; the
  TableOfContents following the scroll, moving focus, the tab title; SkipLink
  and FocusScope by keyboard; LiveRegion in the accessibility tree; Timer,
  ChangeListener, the Queue's toasts; ToneSwitch; Redirect.
- `e2e/ssg.spec.ts`: the hello build's TableOfContents, QR code and title,
  without JavaScript and after takeover. Four scenario tests in
  `e2e/playground-scenarios.spec.ts`.
