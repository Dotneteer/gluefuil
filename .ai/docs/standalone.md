# Standalone mode

> Subsystem reference for `packages/standalone`: one JS file that fetches,
> compiles, caches and runs `.pfui` markup in the browser. Describes the code
> as it is. Design and XMLUI comparison:
> [`../plan/poc-11-standalone.md`](../plan/poc-11-standalone.md).
>
> **Last updated:** step 11.

## Using it

```html
<!doctype html>
<html>
  <head>
    <script src="pfui.js"></script>
  </head>
  <body></body>
</html>
```

Put `Main.pfui` next to it and serve the folder with any static server.

| `<script>` attribute | Default | Meaning |
|----------------------|---------|---------|
| `data-main` | `Main.pfui` | The entry file, relative to the page |
| `data-root` | a new `<div id="pfui-root">` | A CSS selector for the mount element |
| `data-cache` | `true` | The `localStorage` compile cache |
| `data-watch` | `true` on localhost, else `false` | Poll the markup for changes |
| `data-watch-interval` | `1000` | The polling interval in ms |
| `data-autostart` | `true` | `false`: start yourself with `pfui.startApp(options)` |

**The global `pfui`:**

| Member | What it is |
|--------|------------|
| `startApp(options)` | Starts (or restarts) the app |
| `current()` | The running `StandaloneApp` (`status`, `refresh()`, `stop()`) |
| `start`, `StandaloneApp` | The loader API |
| `CompileCache`, `hashText` | Cache utilities |
| `React` | The engine's React: extensions must use it, never bundle their own |
| `version` | The package version |

**CSP:** compiling in the browser runs code through `new Function`, which
needs `'unsafe-eval'`. For a strict Content Security Policy, use
build-time compilation ([build-time.md](build-time.md)).

## How a load works (`StandaloneApp`)

1. **Fetch** the entry file (`cache: "no-cache"`: HTTP revalidates).
2. **Hash** it with `hashText` (cyrb53, 53 bits). This is not a security
   measure: it only decides whether to recompile, and `crypto.subtle`
   needs a secure context that plain `http://` hosts don't have.
3. **Cache lookup** with the key `pfui:<buildId>:<file>`:
   - **hit:** use the stored code;
   - **miss:** `compileModule(…, { format: "function", fileName })`. On
     compile errors, show the overlay and don't cache. Otherwise store
     `{ hash, code, map without sourcesContent }`.
4. **Load and mount:** `loadModule(code, { components, map, sourceURL })`,
   with the map's `sourcesContent` restored from the fetched text, then
   `root.render(<Main/>)`.
5. **Status:** `status = { file, source: "compiled" | "cache" | "error",
   compileMs?, loads }`.

**The build ID** (`__PFUI_BUILD_ID__`, set by the bundle build) is new for
every build of `pfui.js`. A new engine never runs code compiled by another
build, and the cache removes other builds' entries when it writes.

## The cache never breaks loading (`CompileCache`)

| Situation | Behavior |
|-----------|----------|
| No `localStorage`, or it throws (privacy modes) | No cache: compile every time |
| Corrupted entry (bad JSON, wrong shape) | A miss; overwritten by the next write |
| Quota exceeded | Evict the other `pfui:` entries and retry once; otherwise don't cache |
| Entries of other engine builds | Removed when writing |
| Other apps' keys | Never touched |

## Watching

- **Polling** (`setTimeout` chain, no overlapping requests): `refresh()`
  fetches with `cache: "no-store"` and compares the hash. On a change it
  loads again (through the cache) and renders the new root component.
  This is a full app reload without a page reload, so app state is lost.
- **Errors** (network, compile) show the **error overlay**: every
  diagnostic as `file:line:col: error CODE: message`, with the source line
  and a caret (the compiler's `codeFrame`). Polling continues, and the next good version replaces the
  overlay.
- **`stop()`** ends polling and unmounts.

## The bundle (`npm run build:standalone`)

- Vite library mode, **IIFE**, global `pfui`.
- Output: `packages/standalone/dist/pfui.js`, **326 KB (101 KB gzipped)**,
  with a source map.
- Contents: React and ReactDOM (production), the compiler, the runtime
  and the components.
- **Config loading:** `vite.config.ts` uses `--configLoader runner` for the
  workspace TypeScript sources.

## Not yet

Component files (`components/Name.pfui`) arrive with user-defined
components (step 14): the loader will fetch unknown component names on
demand, through the same cache.

## Files

| File | Contents |
|------|----------|
| `standalone/src/index.ts` | The global API, autostart, `optionsFromScript` |
| `standalone/src/loader.tsx` | `StandaloneApp`, `start` |
| `standalone/src/cache.ts` | `CompileCache`, `defaultStorage`, `StorageLike` |
| `standalone/src/hash.ts` | `hashText` (cyrb53) |
| `standalone/src/overlay.tsx` | `ErrorOverlay` |
| `standalone/vite.config.ts` | The bundle build |
| `tools/static-server.mjs` | The E2E static server: serves a temp copy of a fixture site plus the bundle |
| `e2e/fixtures/standalone-site/` | `index.html` (one script tag) and `Main.pfui` |

## Tests

| File | Covers |
|------|--------|
| `standalone/tests/cache.test.ts` | Hash; hit and miss; invalidation by content and by build; other apps' keys; corrupted entries; quota eviction; entries too big to fit; throwing or absent storage |
| `standalone/tests/loader.test.tsx` | With a mocked server: compiled, then cached; recompiled on change; `cache: false`; entry file and fetch modes; the compile-error overlay (nothing cached); a missing file; `refresh()` (change, error, recovery); polling |
| `e2e/standalone.spec.ts` | Chromium against the real bundle: compile on the first load, cache on reload (and the app works); editing `Main.pfui` on the server updates the open app; an error shows the overlay and fixing it recovers |
