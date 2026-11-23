# Step 11: Standalone mode

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

An app is **one HTML file, one JS file (`pfui.js`), and its markup files**
on any static server.

1. On first load, the engine fetches `Main.pfui` and compiles it in the
   browser.
2. It caches the compiled module in `localStorage`, keyed by a hash of the
   content.
3. It watches the markup for changes.

## Background (XMLUI)

Sources: `website/content/docs/pages/app-structure.md`; architecture.md
§ Delivery modes and § "React 19 no longer ships UMD builds".

- An XMLUI app's `index.html` is a `<script src="xmlui/0.9.23.js">` and an
  empty body. The engine fetches `Main.xmlui` (and component files) and
  runs. Any static server works.
- React 19 has no UMD build, so the standalone file must bundle React. Later
  extension bundles must use the engine's React, never their own copy.

## Design

### Package `@patchfuil/standalone`

- **The bundle.** `src/index.ts` is built by Vite in library mode (IIFE,
  minified, with a source map) into `dist/pfui.js`. It contains React,
  ReactDOM, the compiler, the runtime and the components.
- **The global `pfui`:** `start(options)`, `stop()`, `status` (the last
  load: `"compiled"` or `"cache"`, and timings), `version`, and `React`
  (for future extensions).
- **Autostart.** The script reads its options from `data-*` attributes of
  its own `<script>` tag (`document.currentScript`) and starts on
  `DOMContentLoaded`. `data-autostart="false"` turns that off.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `data-main` | `Main.pfui` | The entry file, relative to the page |
| `data-root` | a new `<div id="pfui-root">` | A CSS selector for the mount element |
| `data-cache` | `true` | Use the `localStorage` cache |
| `data-watch` | `true` on `localhost` / `127.0.0.1`, else `false` | Poll the markup for changes |
| `data-watch-interval` | `1000` | The polling interval (ms) |

- **Boundaries.** `standalone` may import all three packages; nothing may
  import it.

### Loading

1. Fetch the entry file (`cache: "no-cache"`, so HTTP revalidates).
2. Hash the text (cyrb53, 53 bits). It isn't cryptographic, and doesn't
   need to be: the key is not a security boundary, and
   `crypto.subtle` only exists in secure contexts.
3. Look the result up in the cache. The **key** is `pfui:<buildId>:<path>`;
   the entry holds `{ hash, code, map without sourcesContent }`.
   - **Hit:** `loadModule(code)`; no compile.
   - **Miss or changed:** `compileModule(…, { format: "function" })`, then
     store the result.
   - **The build ID** changes with every bundle build, so a new engine
     never runs code compiled by an old one.
4. Mount with `createRoot(...).render(<Main/>)`.
5. **Compile errors** show an error overlay in the mount element, listing
   `Main.pfui:line:col: error CODE: message` with the source line. The
   cache is not written for code with errors.

### The cache (`cache.ts`): it must never break loading

- **Unusable storage** (absent, throwing in private mode, blocked): load
  without a cache.
- **A corrupted entry** (bad JSON, wrong shape): treat it as a miss and
  overwrite it.
- **Quota exceeded:** evict the other `pfui:` entries and retry once;
  otherwise skip caching.
- **Entries of other build IDs** are removed when a new entry is written,
  so old engines don't accumulate garbage.

### Watching

- **Polling.** Every interval, the engine refetches with `cache: "no-store"`
  and compares the hash. On a change it recompiles (through the cache)
  and renders the new root component. State is lost: this is a full
  reload of the app, without a page reload.
- **Errors while watching** (network, compile) show the overlay and
  polling continues. Fixing the file restores the app.
- **`stop()`** ends polling and unmounts.

### Not in this step

- **Component files** (`components/Name.pfui`) arrive with user-defined
  components (step 14). The loader then fetches unknown component names
  on demand.
- **CSP:** standalone mode needs `'unsafe-eval'` (`new Function`).
  Build-time compilation (step 12) is the answer for strict CSP. This is
  documented.

## Tests

- **Unit (jsdom, `packages/standalone/tests`):**
  - the hash;
  - the cache: hit, miss, invalidation by content and by build ID,
    corrupted entries, quota with eviction, throwing storage;
  - the loader with a mocked `fetch`: compiled first, from the cache
    second, the error overlay, watching picks up a change and recovers
    from an error.
- **E2E (`test-apps/standalone-site`, a static Node server serving a temp
  copy plus `dist/pfui.js`):**
  - the first load compiles and the second load hits the cache;
  - editing `Main.pfui` on the server updates the open app;
  - an error in the file shows the overlay, and fixing it recovers.

## Outcome

Implemented as designed. Details: [`../docs/standalone.md`](../docs/standalone.md).

- `pfui.js`: 326 KB, 101 KB gzipped (React and ReactDOM included).
- E2E, against the built bundle in Chromium:
  - the first load compiles and a reload takes the cache;
  - editing `Main.pfui` on the server updates the open app;
  - a compile error shows the overlay, and fixing it recovers.

## Findings

- **The cache key needs an engine identity.** Content hash alone would let
  a new `pfui.js` run code compiled by an old one. The build ID makes every
  build start clean and remove the old entries.
- **Storing the source map without `sourcesContent`** roughly halves the
  cache entry. The source is fetched anyway (to compute the hash), so the
  loader restores it before `loadModule`.
- **Watching is polling.** Static servers don't push changes. Polling with
  `no-store` and a hash comparison works on any server. A dev server with
  push (WebSocket/SSE) could replace it later.
- **Workspace globs:** a folder in `test-apps/` without a `package.json`
  would break `npm install`, so the static fixture lives in
  `e2e/fixtures/`.

## Open for later steps

- Component files and on-demand fetching (step 14).
- Keeping app state across a watched reload (true hot replacement): only
  possible once components can be swapped individually.
- Measuring startup time on a realistic app (step 13 or a later
  benchmark).
