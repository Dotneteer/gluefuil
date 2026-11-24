# Step 21: Routing (the rest): navigation events and prerendered routes

**Status:** Done; part 2 (history deltas, new tabs, a basename) awaiting review

Part of [poc-steps.md](poc-steps.md). Step 19 (reduced) built the router
([poc-19-routing.md](poc-19-routing.md), [../docs/routing.md](../docs/routing.md)),
and steps 19A–19C added `NavLink`. This step adds the two remaining items:

1. `App willNavigate` / `didNavigate`;
2. prerendering every static route, not only `/`.

After the first review, part 2 was added to close the small open items
(see [Part 2](#part-2-history-deltas-new-tabs-a-basename)):

3. `navigate(-1)` (history deltas) and `navigate(to, { target: "_blank" })`;
4. a basename, for apps served under a sub-path in browser mode.

Step 22 (forms) follows. Its plan is written when this step is merged.

## Goal

```xml
<App var.dirty="{false}"
     onWillNavigate="(to) => { if (dirty) return false; }"
     onDidNavigate="(to) => log.push(to)">
  <Pages>
    <Page url="/">…</Page>
    <Page url="/about">…</Page>
    <Page url="/users/:id">…</Page>
  </Pages>
</App>
```

- **`willNavigate`** can cancel a navigation by returning `false`. The guard
  covers `navigate()`, `Link`/`NavLink` clicks and the browser's back and
  forward buttons. A cancelled navigation never renders the target page.
- **`didNavigate`** fires after every completed navigation, but not on the
  first load.
- **`vite build` with `prerender: true`** writes `dist/about/index.html`
  next to `dist/index.html` when the app uses browser routing. Each file holds
  its route's content, so it shows without JavaScript and search engines can
  index it. `mountApp` takes each file over without changing the DOM.

## Background (XMLUI)

### Navigation events

- **The docs:** `website/content/docs/reference/components/App.md` §
  `willNavigate`, `didNavigate`, and `.ai/xmlui/routing.md` § "App Navigation
  Events".
  - `willNavigate(to, queryParams)` fires before a programmatic
    `navigate()`. Only `false` cancels it; `undefined`, `null` and `true`
    let it proceed.
  - According to the docs, it **does not** fire for `Link` clicks or for
    back/forward ("React Router limitations: router blocking is
    synchronous").
  - `didNavigate(to, queryParams)` fires after every kind of navigation.
- **The source disagrees with the docs**
  (`xmlui/src/components-core/rendering/AppContent.tsx`, lines 307–432):
  - **A programmatic `navigate`** awaits `onWillNavigate(finalTo,
    queryParams)` and returns when the result is `false`. `finalTo` is the
    path with the query string already folded in.
  - **Any other location change** (a Link click, back or forward) first
    **renders the new route**. An effect then calls `onWillNavigate`; if it
    returns `false`, the effect navigates back with `replace` and logs a
    `guard-bypass-attempt` diagnostic. `xmluiConfig.guardOnPopState: false`
    turns this off.
  - **`didNavigate`** runs in a location effect and is skipped on the first
    render. It receives `pathname + search + hash` and `undefined` for the
    query parameters.
- **The `navigate` options** (same file, lines 320–342): `navigate(to, {
  queryParams, replace })`. For back-compatibility, a bare object is taken
  as the query parameters.
- **Usage:** `website/content/docs/pages/howto/protect-a-page-with-a-route-guard.md`
  writes the event as `onWillNavigate="(to) => { … return false; }"` on
  `App`.
- **Tests:** `xmlui/src/components/App/App-navigation-events.spec.ts`
  covers `didNavigate` after a Link click and after back/forward, the
  cancellation, and the order (will, then did).

### Prerendering routes

- **`xmlui/src/nodejs/bin/ssg.ts`** (header comment, lines 650–855) and
  **`xmlui/src/nodejs/discoverRoutes.ts`**:
  - Routes are found by **static analysis** of `Main.xmlui`, falling back to
    a scan of the components, for the `Pages` element.
  - Each literal `Page url` is rendered. Routes with parameters are left
    to the client, except those that `contentDir` matches to content files.
  - The output is `outDir/<route>/index.html` (`getOutputHtmlPath`).
  - Rendering uses `StaticRouter`, so the output assumes path (browser)
    routing.
  - It also writes a **fallback file** (`200.html`) for SPA hosts,
    rendered at a route that no `Page` matches.

### Here

- **The router** (`runtime/src/render/router.ts`) is our own:
  - a location signal and `navigate()` over `pushState`/`replaceState`;
  - `hashchange`/`popstate` listeners;
  - in the server view, `currentLocation()` returns the fixed `SERVER_PATH`
    `/`.
- **`Pages`** registers its patterns while it renders. `Link` calls
  `navigate`.
- **`eventResults`** metadata (step 20, used by `APICall`) makes a
  component's handlers return a promise of their result. That is the
  mechanism a guard needs.
- **The prerender** (`vite-plugin/src/prerender.ts`) renders one entry at
  `/` into `index.html`. `mountApp` hydrates when it finds
  `data-pfui-prerendered`.

## Design

### 1. Navigation events

**Metadata.** `App` gains:
- the events `willNavigate` and `didNavigate`, which take `(to,
  queryParams)`;
- `eventResults: true`.

`App` registers its two handlers with the router in a layout effect and
removes them on unmount (`setNavigationHandlers`). Nothing fires in the
server view.

**`navigate(to, options)`**:
- **Options:** `{ replace, queryParams }`, as in XMLUI. `queryParams` is
  folded into the path when `to` has no `?` yet. We do **not** accept a bare
  object as the query parameters: there is no legacy markup to keep working
  (a divergence).
- **It returns a promise.** Handlers await it implicitly, so `navigate('/a');
  x = 1` sets `x` after the guard has decided.
- **The order:**
  1. Compute the target: the path with the query string folded in, as
     XMLUI's `finalTo`.
  2. Await `willNavigate(target, queryParams)` when it is set. Only a
     result `=== false` cancels.
  3. Push or replace the history entry, then set the location signal. The
     new page renders.
  4. Call `didNavigate(target, $queryParams)`. It runs as an ordinary
     handler (fire and forget).

**Which navigations are guarded.** XMLUI's documented behavior differs from
its source, and this step settles that here:

| Navigation | willNavigate | didNavigate |
|---|---|---|
| `navigate()` in a handler | before (awaited) | after |
| `Link` / `NavLink` click (it calls `navigate`) | before | after |
| Back / forward / a typed hash (`popstate`, `hashchange`) | before rendering (see below) | after |
| The `Pages` fallback redirect (an unknown path) | **no** (an internal redirect, not a user navigation) | after |
| First load, takeover | no | no |

**Back and forward without a flash (a divergence).** When the browser
changes the URL itself, XMLUI renders the new route first and navigates
back if the guard says no. We do it in this order instead:
1. **Hold** the location signal. The old page stays on screen while the
   guard runs.
2. Await `willNavigate`.
3. If the guard allows it, set the signal. If it refuses, restore the URL
   **without adding a history entry**.

To restore the URL correctly, every entry we push carries an index in
`history.state` (`{ pfui: n }`). On a refusal the router calls
`history.go(previous - current)`; the `popstate` that the call itself
causes finds the app's route and only settles the indexes. *(As built:
an entry without an index, a hash typed by hand, gets the next index when
it arrives, so it is restored the same way; `replaceState` is used only
when the browser has dropped the app's entry. See Findings.)*

**Concurrency: the latest navigation wins.** Each navigation takes a
token. If a newer one started while a guard was awaited, the older result
is discarded. This also covers a guard that redirects (`navigate('/login');
return false`): the inner navigation is newer, so the outer result no
longer matters.

**Errors.** A guard that throws or times out **cancels** the navigation
(fail closed, as XMLUI, where the awaited handler rejects). The error is
reported as any handler's error.

### 2. Prerendering every static route

**Only for browser routing.**
- In hash mode, the server never sees the route: every URL loads
  `index.html`, and a deep link switches after takeover (already the case,
  step 13). So in hash mode the build renders `/` only, as it does today,
  and tells the user nothing.
- In browser mode (`useHashBasedRouting="false"`), every static route gets
  its own file.

**Finding the routes at render time,** not by static analysis (a
divergence in mechanism; XMLUI parses the markup):
1. The prerender renders `/` as it does today.
2. It then reads `registeredRoutes()` and `routingMode()` from the runtime,
   in the same module graph.
3. The **static routes** are the patterns without `:` or `*`. They are
   rendered one after another in the same temporary server.

This finds `Pages` wherever it is (in `Main.pfui` or in a user component),
because it uses what actually rendered. It misses a `Pages` that is not
rendered at `/` (for example under a `when` that is false at build time).
That limit is documented, and the option below covers it.

**A new `prerender` option: `routes: string[]`.** These are concrete paths
to render as well. Their main use is pages with parameters
(`["/users/1", "/users/2"]`), the counterpart of XMLUI's `contentDir`
matching. Each path must match a registered route, or the build fails with
a message.

**Output.** `/about` is written to `dist/about/index.html`, built from the
same processed `index.html` shell as `/`. The extra files are emitted from
the plugin's bundle hook. Checking that the hook runs after the HTML
plugin is part of the work.

**The server path becomes settable:**
- **The runtime:** `SERVER_PATH` becomes `setServerPath(path)`, and
  `renderStatic(app, { breakpoint, path })` takes the path.
- **The output:** the container gets a second attribute,
  `data-pfui-path="/about"`.
- **Takeover:** `mountApp` reads the attribute, so hydration renders the
  same route as the static HTML. A browser at `/about` then changes nothing
  after takeover. Without the attribute (older output), the path is `/`.

**One server for every route.** Rendering each route in a fresh module
graph would be slow, so all routes render in the same temporary server.
Module-level state is reset between renders (the router, the theme state,
the shell state) through one `resetServerState()` in
`@patchfuil/runtime/server`. A test proves that no route's HTML depends on
which route rendered before it.

**Constraints, checked with messages:**
- **A relative Vite `base` (`./`)** breaks asset URLs in
  `dist/about/index.html`. In browser mode with more than one route, it
  fails the build and suggests an absolute `base`.
- **A route that throws** fails the build, as `/` already does.

**Not in this step:**
- a fallback file (`200.html`/`404.html`): an open question below;
- a `basename` for apps deployed under a sub-path;
- route constraints, nested pages, per-`Page` guards;
- `navigate(-1)` history deltas;
- `target: "_blank"`.

### Contracts

`App` gains `willNavigate` and `didNavigate` in its metadata, so a typo
(`onWillNavigte`) is E004 with a "did you mean". Nothing else changes.

## Steps

- [x] Router: `navigate` options and its promise; history indexes; the
      handler registry; guarded `navigate`; held `popstate`/`hashchange`
      with restore; the latest-wins token; `didNavigate`; no events in the
      server view.
- [x] `App`: the metadata (events, `eventResults`) and the registration
      effect. `Pages` fallback redirects are unguarded.
- [x] Runtime server: `setServerPath`, `renderStatic({ path })`,
      `data-pfui-path`, `mountApp` reading it, `registeredRoutes()`,
      `resetServerState()`.
- [x] Vite plugin: route discovery after `/`, the `routes` option and its
      validation, emitting `<route>/index.html`, the relative-`base` check.
- [x] Fixture: a browser-mode variant of `test-apps/routing` (its own
      config and port, prerendered and served statically), with a guard
      and a navigation log in the markup.
- [x] Playground: the Routing scenario gets an "unsaved changes" checkbox
      guarding navigation, and a `didNavigate` log. Add its E2E
      interaction test.
- [x] Docs: `routing.md`, `ssg.md`, `build-time.md` (the option),
      `code-structure.md` (also fix its stale "Last updated" line, which
      still says 19A–19C), `poc-steps.md`.
- [x] `npm run check`, then stop and report.

## Verification

- **Unit (runtime, `router.test.ts`):** a table of navigation kinds against
  the events fired, in order:
  - `navigate`, Link, `popstate` and `hashchange`, the fallback redirect,
    the first load.
  - The guard results: `false`, `undefined`, `null`, `true`, a throw, a
    timeout.
  - `queryParams` folding and `replace`.
  - Latest wins: two navigations whose guards resolve out of order.
  - A redirect from inside a guard.
  - The restore on refusal with and without a history index (the
    signal never shows the refused route).
- **Unit (components):**
  - App's handlers are registered and removed with it.
  - The E004 suggestion for a misspelled event.
  - A guarded `Link` click.
- **Unit (vite-plugin, server):**
  - static routes are discovered; `:id` and `*` routes are skipped;
  - `routes` adds paths and is validated;
  - hash mode renders `/` only;
  - the output paths are right;
  - a relative `base` is refused;
  - each route's HTML is independent of render order;
  - `data-pfui-path` round-trips through `mountApp`.
- **`tools/build-output.test.ts`:** the browser-mode fixture's `dist` has
  one `index.html` per static route, each with its own content.
- **E2E (a real browser):**
  - The guard blocks a button navigation, a Link click and the **back
    button**. The guarded page never appears (checked with a
    MutationObserver). Back and forward still work after a refusal, with
    no extra history entry.
  - `didNavigate` logs every navigation, but not the first load.
  - The browser-mode build with **JavaScript disabled**: `/about` shows
    About's content.
  - With JavaScript, takeover at `/about` changes nothing (a
    MutationObserver installed before any script, as in `ssg.spec.ts`).
  - A deep link to a parameter route (not prerendered) still renders after
    takeover.

## Decisions (accepted by the user)

1. **Back/forward guarding:** hold the old page and restore the URL with
   `history.go` (as designed above).
2. **A fallback file** (`200.html`) is out. Prerendering the routes that
   matter (`routes`) avoids the brief wrong page on a deep link; the file
   would only help on hosts configured for it, and not with hash routing.
3. **`navigate` with a bare object** as the query parameters is not
   accepted.

## Part 2: history deltas, new tabs, a basename

Added after the first review of part 1. The fallback file is out (decision
2). Per-`Page` guards, route constraints and nested pages go to Phase G
([poc-steps.md](poc-steps.md)); global variables in user components become
step 21B.

### XMLUI

- **`target: "_blank"`:** `navigate` runs `willNavigate`, then calls
  `window.open(href, "_blank", "noopener,noreferrer")`; the current page
  does not move and no `didNavigate` follows
  (`xmlui/src/components-core/rendering/AppContent.tsx`, lines 353–366).
  The `href` is the bare path, so under hash routing the new tab opens
  `/x`, not `/#/x`.
- **Deltas:** `navigate` passes `to` to react-router's `navigate`, which
  takes a number (`navigate(-1)`); `willNavigate` then receives the number
  (same file, line 345).
- **Basename:** browser routing only (`basename={Router === HashRouter ?
  undefined : baseName}`, `AppWrapper.tsx` line 330). The value is the
  global `__PUBLIC_PATH` (`StandaloneApp.tsx` line 569), set by the build.

### Design

**`navigate(n)` with a number** goes `n` entries through the history:

- `navigate(0)` does nothing. A non-integer is an error.
- The router calls `history.go(n)`. The `popstate` that follows runs the
  existing held-move path: `willNavigate` sees the **resolved path** of the
  entry it lands on (not the number), the old page stays while it decides,
  and a refusal goes back with `history.go`. So `navigate(-1)` and the
  browser's back button behave the same.
- The promise resolves once that move has settled (allowed, refused or
  nothing happened because there is no entry: a short timeout, as the
  browser fires no event then).
- **Divergence:** XMLUI's guard receives the number. A guard that checks
  where the user is going needs the path; ours gets it.

**`navigate(to, { target: "_blank" })`** opens the route in a new tab:

- The guard runs first, as in XMLUI (a page may refuse to open one).
- `window.open(url, "_blank", "noopener,noreferrer")`, with `url` built by
  `hrefFor`, so hash routing opens `/#/x` (**fixing XMLUI's bare path**) and
  the basename is included.
- The current page does not move: no `didNavigate`.
- Any other `target` value is ignored (same tab), as XMLUI.

**The basename** (browser mode; hash routes ignore it, as XMLUI):

- The router keeps a `basename` (no trailing slash; `""` for `/`).
  - `parseLocation` of `location.pathname` strips it. A path outside it is
    read as is.
  - `navigate` and `hrefFor` prepend it, so `Link`, `NavLink` and the new
    tab get the full URL. Routes in markup stay root-relative (`/about`).
- **Its source is Vite's `base`**, like XMLUI's `__PUBLIC_PATH`, so one
  setting moves the assets and the routes together:
  - the Vite plugin writes it on the root container as `data-pfui-base`
    (every build and the dev server, not only with prerender);
  - `mountApp` reads it (option `basename` overrides; standalone mode
    writes the attribute by hand or passes the option);
  - the prerender renders each route with it, so the static links already
    carry it, and `routeFileName`/the preview rewrite work under it.
- An App prop was considered and rejected: it would duplicate `base` and
  could disagree with it.

### Steps (part 2)

- [x] Router: `navigate(n)`, `target: "_blank"`, the basename
      (`setBasename`, stripping and prepending); reset in `resetRouter`.
- [x] `mountApp`: `basename` option and `data-pfui-base`; `renderStatic`
      option `basename`.
- [x] Vite plugin: write `data-pfui-base` from `base`; prerender and the
      preview rewrite under a base.
- [x] Unit tests: deltas (allowed, refused, no entry, `0`, non-integer),
      the new tab (guard, URL in both modes, no move, no `didNavigate`),
      the basename (parse, push, `hrefFor`, a path outside it, hash mode
      ignores it), `prerender.test.ts` under a base.
- [x] E2E: a "Back" button using `navigate(-1)` against the guard (hash
      fixture); a new-tab button (Playwright `context.waitForEvent("page")`);
      a second browser-routing build under `base: "/app/"`: the files
      without JavaScript, takeover, links, a deep link.
- [x] Docs: `routing.md`, `ssg.md`, `build-time.md`; `code-structure.md`.
- [x] `npm run check`.

### Decisions (part 2, accepted by the user)

1. `willNavigate` receives the resolved path for `navigate(n)`, not `n`.
2. The basename comes from Vite's `base`, carried by `data-pfui-base`.
3. Step 21B covers `global.*` on `Main.pfui`'s root; a `Globals.xs` file is
   included only if it is cheap (it needs the code-behind loader).

### Outcome (part 2)

Implemented as designed. `npm run check`: 2,330 unit tests in 80 files
(+42), 167 E2E tests (+9), no warnings.

- **Router:** `navigateBy` (`history.go`, then the held-move path; waiters
  settle on the decision, on a newer `commit`, or after
  `DELTA_EVENT_TIMEOUT_MS` = 300 ms when the browser fires nothing),
  `openInNewTab` (guard, then `window.open` with `browserUrl`), and the
  basename (`setBasename`, `normalizeBasename`, stripped in
  `readBrowserLocation`, prepended in `browserUrl` and `hrefFor`).
- **`mountApp`** takes `basename` or reads `data-pfui-base`
  (`BASE_ATTRIBUTE`); **`renderStatic`** takes `basename` and records it.
- **Vite plugin:** `basenameOf(base)` (absolute bases only);
  `addRootAttributes` writes `data-pfui-base` when there is no prerender
  (dev included); the prerender passes it to `renderStatic`;
  `previewRewrite` strips it.
- **E2E:** `navigate(-1)` and a new tab in both routing fixtures; a third
  project, `routing-base-build` (5185), builds the browser fixture with
  `--base /app/`: files without JavaScript, links, takeover, back and
  `navigate(-1)`, a deep link, a new tab, all under `/app/`.

**Findings (part 2):**

- A waiter of `navigate(-1)` could hang when a newer navigation overtook
  its move (its token lost, so neither branch settled it): `commit` now
  settles every waiter.
- Vite's `base` is also a full URL for CDN assets; then the routes are not
  under it, so `basenameOf` gives none. A relative base already fails a
  multi-route prerender.
- `vite preview` passes `/app/about` to our middleware with the base; the
  rewrite to `/app/about/index.html` is then served by Vite's own base
  handling.

## Outcome

Implemented as designed, with the changes listed under Findings. Details:
[`../docs/routing.md`](../docs/routing.md) § Navigation events and
[`../docs/ssg.md`](../docs/ssg.md) § Prerendered routes.

```xml
<App useHashBasedRouting="false"
     var.blocked="{false}" var.log="{[]}"
     onWillNavigate="(to) => { if (blocked) return false; }"
     onDidNavigate="(to) => { log.push(to); }">
```

```ts
pfui({ prerender: { routes: ["/users/1"] } })
// dist/index.html, dist/about/index.html, dist/docs/intro/index.html, dist/users/1/index.html
```

- **Navigation events:** `navigate`, `Link`/`NavLink`, back, forward and a
  typed hash are guarded. The guarded page never renders, the history
  gets no extra entry, and the latest navigation wins. `didNavigate`
  follows every move except the first load.
- **Prerendered routes:** with browser routing, every static route and
  each `routes` path gets its own file, which shows without JavaScript and
  is taken over without a DOM change (`data-pfui-path`). Hash routing still
  writes only `index.html`.
- **Fixtures:** `test-apps/routing` (hash) gained a guard and a log;
  `test-apps/routing-browser` is new (browser routing, prerendered, port
  5184). The playground's Routing scenario has an "unsaved changes" guard
  and a log.
- **`npm run check`:** 2,288 unit tests in 80 files and 158 E2E tests,
  with no warnings. The routing E2E specs pass 5 times in a row
  (`--repeat-each 5`, 85 runs).

## Findings

- **`hashchange` and `popstate` together broke the guard.** A back move
  fires `popstate`, then `hashchange` a moment later. The first event was
  refused and called `history.go(1)`, which is asynchronous. The late
  `hashchange` still saw the old URL, was refused again, and moved the
  browser a second step: a loop of refusals in the build. Browsers fire
  `popstate` for every history move, hash changes included, so the router
  now listens to `popstate` only.
- **The browser's position and the app's entry are two indexes.** While a
  guard holds a move, the user can move again (a typed hash during a slow
  guard, such as a confirmation). The router tracks the app's entry and
  the browser's current one separately. A refusal goes back by their
  difference. If a new entry dropped the app's entry, the current entry
  is rewritten to the app's URL instead. The plan's
  `replaceState(previousUrl)` fallback for entries without an index left a
  duplicate entry (back then did nothing); an entry without an index is
  now given the next index on arrival.
- **A guard that times out had to fail closed.** `HandlerSlot.call`
  resolved a timed-out call to `undefined`, which a guard would read as
  "allow", and it settled only when the handler next resumed, never for a
  guard stuck on a promise. A timeout now rejects the caller at once with
  `HandlerTimeoutError`. Only callers that wait for a result see the
  change: `APICall`'s events and component methods. `invoke` is unchanged.
- **`navigate` returning a promise changes `act(() => navigate(…))` in
  tests.** React treats a callback that returns a promise as an async
  `act`, and when nobody awaits it, later renders queue behind it (the
  shell tests rendered an empty `<div>`). Write
  `act(() => { void navigate(…); })` or `await act(async () => …)`.
- **`vite preview` serves `about/index.html` only for `/about/`.** For
  `/about` it fell back to the root `index.html`, which showed Home's HTML
  at `/about`. Static hosts serve the directory index (or redirect to it),
  so the plugin's `configurePreviewServer` now does the same when
  prerender is on.
- **Discovering routes at render time was enough.** No markup analysis was
  needed: `Pages` registers its patterns while `/` renders, and the
  prerender reads them from the same module graph.
- **Resetting the runtime while an app is mounted** makes its next render
  attach the router inside a computed value (a `ReactivityError`). In an
  app, `App` attaches the router while rendering, before any binding, so
  only tests can do this; they unmount first.

## Divergences from XMLUI

- **`willNavigate` guards links and back/forward before rendering.** XMLUI
  renders the new route first and navigates back afterwards (its docs say
  it does not fire for those moves at all).
- **The `Pages` fallback is not guarded.** It is an internal redirect; it
  does fire `didNavigate`.
- **`didNavigate` receives the query parameters** for every move. XMLUI's
  location effect passes `undefined`.
- **`navigate(to, {a: 1})` is not read as query parameters.** Only
  `{ queryParams }` is.
- **Routes are found at render time,** not by parsing the markup.
- **No fallback file** (`200.html`): decided out (decision 2).
- **`navigate(n)`: `willNavigate` gets the path it lands on,** not the
  number (part 2).
- **A new tab under hash routing opens `/page#/route`;** XMLUI opens the
  bare path (part 2).

## Open for later steps

- A fallback file for SPA hosts (`200.html`): out (decision 2).
- Per-`Page` guards, route constraints, nested pages: Phase G
  ([poc-steps.md](poc-steps.md)).
- Global variables in user components: step 21B. The playground's guard
  checkbox lives in a user component and has to reach `App`'s variable
  through an event (`onUnsavedChange`).
