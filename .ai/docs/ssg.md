# Static generation and takeover

> Subsystem reference for prerendering an app to static HTML at build time,
> and taking that HTML over in the browser. Describes the code as it is.
> Design and XMLUI comparison: [`../plan/poc-13-ssg.md`](../plan/poc-13-ssg.md).
>
> **Last updated:** step 23 (lazy code: a render that waited is done again). Earlier: step 21 (prerendered routes; design:
> [`../plan/poc-21-routing.md`](../plan/poc-21-routing.md)).

## Using it

```ts
// vite.config.ts
plugins: [gfui({ prerender: true }), react()],
```

```tsx
// main.tsx
import { mountApp } from "@gluefuil/runtime";
import Main from "./Main.gui";

mountApp(document.getElementById("root")!, <Main />);
```

- **`vite build`** renders `src/Main.gui` into the empty `<div id="root">`
  of `index.html`, adding `data-gfui-prerendered="xs"`.
- **In the browser,** `mountApp` sees the marker and hydrates; without it
  (the dev server) it renders fresh.
- **When the app is live,** the container gets `data-gfui-ready`, either
  way.

| `prerender` option | Default | Meaning |
|--------------------|---------|---------|
| `entry` | `"src/Main.gui"` | The root component's file, relative to the Vite root |
| `rootId` | `"root"` | The id of the empty element in `index.html` to fill |
| `breakpoint` | `"xs"` | The viewport the HTML is rendered for (mobile-first) |
| `routes` | `[]` | More paths to render besides the static routes: concrete paths of routes with parameters (`["/users/1"]`). Browser routing only; each must match a `Page url` |

## The prerender (`vite-plugin/src/prerender.ts`)

The plugin's `transformIndexHtml` (`order: "post"`) runs only in a client
build:

1. **`renderEntry`** starts a temporary Vite server: middleware mode, no
   HMR, `configFile: false`, the same root. Its only plugin is a plain
   `gfui({ sourceMap: false })`: the compile step, without a prerender.
   - It has its own cache (`node_modules/.vite-gfui-prerender`) and no client
     pre-bundling (`optimizeDeps.noDiscovery`).
   - Step 20 found why: sharing the app's `node_modules/.vite` let a build's
     prerender rewrite a running dev server's pre-bundled dependencies, and
     its pages then failed with 504 "Outdated Optimize Dep".
2. It `ssrLoadModule`s the entry and `@gluefuil/runtime/server` **into
   the same module graph**, so both use one runtime (one signal store, one
   breakpoint) and one React.
3. `renderStatic(Main, { breakpoint })` returns `{ html, attributes }`.
   - **Lazy code (step 23):** a component that suspends on a chunk
     (Markdown's renderer) records the load with `noteServerLoad`. After each
     render the prerender calls `takeServerLoads()`. If there were loads, it
     awaits them and renders the route again, at most 4 times (more is an
     error). The second render finds the module loaded
     ([display.md](display.md#lazy-loading-prerendering-and-hydration)).
   - **Passes (step 32):** `renderStatic` runs each render in
     `inStaticRender(path, app, …)`, so a component can read
     `staticRenderInfo()`: the pass and, when the previous pass rendered the
     same app and path, whether it waited for code. A TableOfContents renders
     the headings the previous pass recorded and asks for another pass with
     `requestServerRender()` (a resolved load that doesn't count as waiting)
     ([remaining-components.md](remaining-components.md#tableofcontents-and-bookmark)).
   - **The title (step 32):** a PageMetaTitle's `setStaticTitle` makes
     `renderStatic` return `title`; the plugin writes it into the page's
     `<title>` (`injectTitle`, before `injectPrerendered`).
4. **`injectPrerendered`** fills the root element and adds the
   attributes. The element must exist, be empty (whitespace is fine) and
   not be self-closing. Otherwise the build fails with a message, rather
   than overwriting the author's content.

An exception while rendering fails the build, except inside a `Fallback`
(step 33): its Suspense boundary leaves that section to the browser
(`<!--$!-->` in the HTML), and the build prints a warning
(`clientRenderedSections`; [errors.md](errors.md#boundaries)). The prerender adds about
0.1 s to the hello app's build.

## Prerendered routes

With browser routing (`App useHashBasedRouting="false"`) every static route
gets its own file, so it shows without JavaScript and search engines see
it:

```
dist/index.html               /
dist/about/index.html         /about
dist/docs/intro/index.html    /docs/intro
dist/users/1/index.html       /users/1   (prerender: { routes: ["/users/1"] })
```

1. **`renderEntry` renders `/` first,** as before. While it renders, `Pages`
   registers its patterns and `App` sets the routing mode.
2. **It reads `registeredRoutes()` and `routingMode()`** from
   `@gluefuil/runtime/server`, in the same module graph.
   - **Hash mode:** nothing more. The server never sees the route; every
     URL loads `index.html` and a deep link switches after takeover.
     `routes` is an error here.
   - **Browser mode:** the static patterns (no `:` or `*`) and the
     `routes` paths, normalized and deduplicated (`routesToRender`). A
     `routes` path that matches no pattern fails the build.
3. **Each path renders in the same temporary server** with
   `renderStatic(Main, { breakpoint, path })`, after
   `resetServerState()` (the router and its routes, the theme, the shell,
   the data cache), so no route's HTML depends on the one before.
4. **The plugin injects each into the processed `index.html` shell**
   (`transformIndexHtml`) and emits the files from `generateBundle`
   (`order: "post"`, after Vite's HTML plugin) as `<route>/index.html`
   (`routeFileName`, as XMLUI's `ssg.ts` `getOutputHtmlPath`).

- **Discovery is at render time,** not by parsing the markup as XMLUI's
  `discoverRoutes.ts` does. It finds a `Pages` inside a user component; it
  misses a `Pages` that is not rendered at `/` (under a `when` that is
  false at build time). `routes` covers that case.
- **The container's `data-gfui-path`** records the route; `mountApp` sets
  the server path from it, so hydration renders the same route. Without it
  (older output) the path is `/`.
- **A relative `base`** (`./`) fails the build when there is more than one
  route: the asset URLs in `about/index.html` would not resolve.
- **`vite preview`** serves `about/index.html` only for `/about/`. The
  plugin's `configurePreviewServer` rewrites `/about` to it when the file
  exists (`previewRewrite`), as static hosts do (Netlify, GitHub Pages,
  nginx `try_files $uri $uri/`). Other paths fall back to `index.html`,
  where a route that was not prerendered switches after takeover.
- **Under a base** (`base: "/app/"`, step 21 part 2): the files are the
  same (`about/index.html` in the output folder, served at `/app/about`);
  each route renders with `renderStatic(…, { basename: "/app" })`, so its
  links carry the base, and the container records it as `data-gfui-base`.
  `previewRewrite` strips the base before it looks for the file.
- **No fallback file** for SPA hosts (XMLUI writes `200.html`): decided out
  in [poc-21-routing.md](../plan/poc-21-routing.md) (decision 2). A route
  that matters is prerendered with `routes`.

## Takeover (`runtime/src/render/mount.ts`)

`mountApp(container, app, { onRecoverableError?, basename? })`:

- **The basename** (browser routing under a sub-path): `options.basename`,
  else the container's `data-gfui-base` (the Vite plugin writes it from
  `base`, prerendered or not), else none. Set before the first render.

- **With `data-gfui-prerendered="<breakpoint>"`:**
  `setServerBreakpoint(…)` and `setServerPath(data-gfui-path ?? "/")`, then
  `hydrateRoot`. Recoverable errors, such as
  a mismatch React repaired by rendering on the client, go to
  `onRecoverableError`, by default `reportDiagnostic` (step 33: a console
  warning; React recovered). Both roots also get `onCaughtError` (silent: a
  boundary handled it) and `onUncaughtError` (a render error for the
  pipeline).
- **Without it:** `createRoot(container).render(app)`.
- The app is wrapped in `Ready`, which renders no DOM of its own. As the
  outermost component, its effect runs last and sets `data-gfui-ready`.

## Why hydration matches: the server view

- **State matches by construction.** Variables start from the same
  compiled initializers on both sides. No state is serialized (XMLUI
  doesn't either).
- **The environment does not:** the build has no viewport, and the
  browser does.
- **The fix uses React's mechanism for this:** `useSyncExternalStore`'s
  `getServerSnapshot`.
  - `useComputed`'s server snapshot evaluates its function untracked, in
    the **server view** (`reactivity/server-view.ts`).
  - `When` reads `currentBreakpoint()`, which in the server view is the
    server breakpoint (`render/visibility.ts`).
- **The server render and hydration read the same snapshot.** After
  hydration, React re-renders exactly the components whose client snapshot
  differs.

| Client viewport | What takeover changes (E2E, measured with a MutationObserver) |
|-----------------|-------------------------------------------------------------|
| The prerender breakpoint (xs) | Nothing: all of the prerendered elements stay, with no node added, removed or changed |
| Desktop (xl) | Only the responsive text: one `Text` removed, one added |

- **The locale (step 34)** works the same way: in the server view
  `currentLocale()` is the app's own locale (`locale`, else
  `defaultLocale`). After the takeover, a stored choice or a browser language
  switches it, and only text changes ([i18n.md](i18n.md)). The prerender
  writes `lang` and `dir` on `<html>` (`staticDocument`,
  `injectDocumentAttributes`). A `<Locale>` whose messages load lazily
  suspends; the prerender renders again once they loaded, and hydration keeps
  its HTML until they are in on the client.

### What does not match, by design

- **Nondeterministic initializers** (`Math.random()`, the time) differ
  between the build and the browser. React reports the mismatch through
  `onRecoverableError` and renders on the client (tested).
- **Values read through component IDs** (`box.value`) are undefined in the
  static HTML. Components publish their APIs in an effect, which never
  runs on the server. The client's first render agrees (no mismatch), and
  the value appears right after mount, as on any client start (tested).

## Files

| File | Contents |
|------|----------|
| `runtime/src/reactivity/server-view.ts` | `inServerView`, `isServerView` |
| `runtime/src/reactivity/react.ts` | `useComputed`'s server snapshot |
| `runtime/src/render/visibility.ts` | `setServerBreakpoint`, `currentBreakpoint`, `breakpointFromName` |
| `runtime/src/render/mount.ts` | `mountApp`, `PRERENDERED_ATTRIBUTE`, `READY_ATTRIBUTE` |
| `runtime/src/server.ts` | `@gluefuil/runtime/server`: `renderStatic` (with `path`), `resetServerState`, `registeredRoutes`, `routingMode`, `findRoute`, `takeServerLoads` |
| `vite-plugin/src/prerender.ts` | `resolvePrerender`, `injectPrerendered`, `renderEntry` (every route), `isStaticRoute`, `routeFileName`, `routesToRender`, `previewRewrite` |
| `test-apps/routing-browser/` | Browser routing with prerendered routes (E2E) |
| `test-apps/hello/src/main.tsx` | `mountApp` in use |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/render/server-view.test.tsx` | `inServerView`; breakpoint names; `currentBreakpoint` in and out of the server view; server rendering reads the server snapshot; its cache (no React warning); `renderStatic` (elements, components, the marker); `mountApp` (fresh, hydrating, `data-gfui-ready`, mismatches reported) |
| `components/tests/ssg.test.tsx` | Compile, render statically, take over in jsdom: the static HTML; no node replaced and the app interactive afterwards; responsive `When` switching only its own subtree, or nothing when prerendered for the client's breakpoint; the live breakpoint afterwards; a nondeterministic initializer reported; a container without the marker; an unknown breakpoint. **Control:** without the server snapshot, the responsive test fails |
| `vite-plugin/tests/prerender.test.ts` | Options; `injectPrerendered` (attribute forms, escaping, refusals); the hook runs last and not in dev, without the option, or in SSR builds |
| `tools/build-output.test.ts` | The built `index.html` holds the app rendered for xs; no `react-dom/server` or `runtime/server` in the bundle; a render error and a missing root fail the build; prerendered routes: one file per static route and `routes` path with its own content and path, the same absolute script; hash mode writes only `index.html`; `routes` errors; a relative base refused |
| `vite-plugin/tests/prerender.test.ts` (step 21 part) | `isStaticRoute`, `routeFileName`, `routesToRender` (both modes, errors), `previewRewrite` (also under a base), the `generateBundle` order; part 2: `basenameOf`, `addRootAttributes`, the hook writing `data-gfui-base` (dev, a build without prerender, a custom root id; nothing for a root base) |
| `components/tests/ssg.test.tsx` (step 21 part) | A route prerendered at `/about` takes over with no change; control: without `data-gfui-path` hydration mismatches. Part 2: under a basename (links carry it, `data-gfui-base`, takeover at `/app/about` with no change, a live link click); `mountApp` reads `data-gfui-base`, its option overrides it |
| `e2e/routing-browser.spec.ts` | See [routing.md](routing.md#tests) |
| `e2e/ssg.spec.ts` (project `hello-build`) | JavaScript disabled: the content is visible and not live. At xs: takeover changes nothing (a MutationObserver installed before any script), then clicks and typing work. At desktop width: only the responsive text switches |
