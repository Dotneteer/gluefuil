# Routing

> Subsystem reference: `Pages`, `Page`, `Link`, `navigate` and the routing
> globals, the navigation events, and the router behind them. Describes the
> code as it is. Design and XMLUI comparison:
> [`../plan/poc-19-routing.md`](../plan/poc-19-routing.md) and
> [`../plan/poc-21-routing.md`](../plan/poc-21-routing.md) (the events,
> prerendered routes).
>
> **Last updated:** step 21, part 2.

## Using it

```xml
<App>                                     <!-- useHashBasedRouting="false": paths instead of #/ -->
  <Pages fallbackPath="/">
    <Page url="/">
      <Button label="Theming" onClick="navigate('/tests/theming')"/>
      <Link to="/tests/mantine?step=16">Mantine</Link>
    </Page>
    <Page url="/tests/counter">…</Page>   <!-- listed first: wins over /tests/:name -->
    <Page url="/tests/:name">
      <H1>{$routeParams.name}</H1>          <!-- $queryParams.step, $pathname -->
    </Page>
    <Text>shown on every route (not a Page)</Text>
  </Pages>
</App>
```

| Name | What it is |
|------|------------|
| `navigate(to, { replace, queryParams, target })` | App global: goes to a route (`/a/b?x=1`) after `willNavigate` allows it; `replace: true` replaces the history entry; `queryParams` are added when `to` has no query (`null`/`undefined` values left out). Returns a promise (handlers await it implicitly); without a guard the move is synchronous. A bare object as the second argument is **not** read as query parameters (XMLUI's back-compat form) |
| `navigate(n)` | A history move (`navigate(-1)` is back), guarded like the back button ([below](#history-moves-and-new-tabs)) |
| `navigate(to, { target: "_blank" })` | Opens the route in a new tab after the guard; this page does not move ([below](#history-moves-and-new-tabs)) |
| `$pathname` | App global: the current route's path (reactive) |
| `$queryParams` | App global: its query, decoded (`{ step: "16" }`) |
| `$routeParams` | App global: the first matching registered route's parameters (`{ name: "theming" }`, `*` for a wildcard) |
| `Pages` | Renders the **first** `Page` whose `url` matches, plus every non-`Page` child. No match: `navigate(fallbackPath, { replace: true })` (default `/`). |
| `Page` | `url` (required, literal): `/static`, `/users/:id`, `/users/:id?`, `/files/*`. Only the active page's content is mounted, so it starts fresh on each visit. |
| `Link` | `to` (required), `label` or content: `<a class="gfui-Link" href="#/x">`. A plain click navigates without a page load; modified clicks (new tab, …) are left to the browser. |
| `App useHashBasedRouting` | Default true: routes live after `#`, so any static server works. With false, the path and the History API are used, and the server must answer every path with `index.html` (or with the route's own prerendered file: [ssg.md](ssg.md#prerendered-routes)). Under a sub-path, routes are below the basename ([below](#the-basename)). |
| `App onWillNavigate="(to, query) => …"` | Before every navigation except the first load and the `Pages` fallback. `to` is the path with its query (`/docs?q=a+b`), `query` the decoded parameters. Resolving to `false` cancels; anything else proceeds. A throw or a timeout cancels too (fail closed) and is reported. |
| `App onDidNavigate="(to, query) => …"` | After every navigation (the fallback redirect included), not the first load. Errors are reported; the navigation stands. |

## Navigation events

```xml
<App var.dirty="{false}"
     onWillNavigate="(to) => { if (dirty) return false; }"
     onDidNavigate="(to) => log.push(to)">
```

| Navigation | willNavigate | didNavigate |
|---|---|---|
| `navigate()` in a handler | before (awaited) | after |
| `Link` / `NavLink` click (they call `navigate`) | before | after |
| Back, forward, a typed hash, `navigate(n)` (`popstate`) | before rendering: the old page stays until the guard decides | after |
| `navigate(to, { target: "_blank" })` | before | no (this page does not move) |
| The `Pages` fallback (`redirect`, an unknown path) | no | after |
| First load, takeover, the server render | no | no |

- **`App` registers its two handlers** with the router in a layout effect
  (`setNavigationHandlers`) and removes them on unmount. Its metadata has
  `eventResults: true`, so the handler props return a promise of the
  handler's result.
- **The latest navigation wins.** Every navigation takes a token; a guard's
  answer counts only while its token is the latest. A guard that redirects
  (`navigate('/login'); return false`) therefore ends on the redirect.
- **A refused browser move is undone without a new history entry.** Every
  entry the router pushes or replaces carries its index (`history.state =
  { gfui: n }`); an entry the browser pushed itself (a typed hash) gets the
  next index when it arrives.
  - `entryIndex` is the app's entry, `browserIndex` the browser's current
    one. They differ only while a guard holds a move.
  - A refusal calls `history.go(entryIndex - browserIndex)`; the `popstate`
    that causes finds the app's route and only settles the indexes.
  - If the browser has dropped the app's entry (a new entry was made while
    the browser was back from it), the current entry is rewritten to the
    app's URL instead (`replaceState`).
- **XMLUI** fires `willNavigate` after the new route has rendered for
  browser moves, then navigates back
  (`xmlui/src/components-core/rendering/AppContent.tsx`); its docs say it
  does not fire for links or back/forward at all. We hold the old route
  instead: the guarded page never renders.

## History moves and new tabs

Step 21, part 2.

- **`navigate(n)`** calls `history.go(n)`. The `popstate` that follows takes
  the browser-move path above, so the guard sees the **path it lands on**
  (XMLUI passes the number to `willNavigate`), the old page stays while it
  decides, and a refusal goes back with `history.go`.
  - The promise resolves when the move settles: allowed, refused, or
    overtaken by a newer navigation. With no entry that far the browser
    fires nothing; it resolves after `DELTA_EVENT_TIMEOUT_MS` (300 ms).
  - `navigate(0)` does nothing; a non-integer rejects with a `TypeError`.
- **`navigate(to, { target: "_blank" })`** runs the guard, then
  `window.open(url, "_blank", "noopener,noreferrer")`. The URL is the one
  the router would push: `/page#/route` in hash mode (XMLUI opens the bare
  path, which is wrong under hash routing), under the basename in browser
  mode. Any other `target` navigates in this tab, as XMLUI.

## The basename

An app served under a sub-path (`https://host/app/…`) in browser mode.
Hash routes ignore it (as XMLUI: `AppWrapper.tsx` passes `basename` only to
`BrowserRouter`).

- **Its source is Vite's `base`** (`/app/` → `/app`), as XMLUI's comes from
  the build (`__PUBLIC_PATH`, `StandaloneApp.tsx`): one setting moves the
  assets and the routes together.
  - The Vite plugin writes `data-gfui-base` on the root element
    ([build-time.md](build-time.md)); `mountApp` reads it, and its
    `basename` option overrides it (standalone mode: the option, or the
    attribute by hand).
  - The prerender renders with it ([ssg.md](ssg.md#prerendered-routes)).
- **The router** (`setBasename`, normalized by `normalizeBasename`):
  - reading the URL strips it (`/app/about` → `/about`; `/app` → `/`); a
    path outside it is read as is;
  - `navigate` and `hrefFor` put it in front (`Link to="/about"` →
    `href="/app/about"`). Routes in markup stay root-relative.

## The router (`runtime/src/render/router.ts`)

Our own router, not react-router; XMLUI wraps react-router v6.

- **State:**
  - a location signal (`{ pathname, query }`);
  - the mode;
  - a `popstate` listener, attached on first use in a browser (the first
    App render). **Only `popstate`:** browsers fire it for every history
    move, hash changes included. A `hashchange` listener as well saw each
    back move twice; the second event came after a refusal had already
    called the asynchronous `history.go`, was refused again, and moved the
    browser twice (found in step 21's E2E tests).
  - the navigation handlers, the token and the history indexes (above).
- **`navigate`** uses `pushState`/`replaceState` (in hash mode the URL is
  the page path plus `#/route`) and sets the signal: those calls fire no
  event. **`redirect(to)`** is the unguarded replace the `Pages` fallback
  uses.
- **`parseLocation`** normalizes the path (a leading `/`, no trailing
  slash) and decodes the query.
- **`matchRoute(pattern, pathname)`:**
  - static segments (case-sensitive), `:name`, `:name?`, and a final `*`;
  - segments URL-decoded;
  - trailing slashes ignored.

  `findRoute` returns the first match.
- **`registerRoutes`:** `Pages` registers its patterns while it renders.
  - It is plain data, not a signal: a signal write during render would
    notify components rendered before `Pages`.
  - Routes are literals, so it only changes with the markup.
  - **Edge:** a `$routeParams` read *outside* `Pages`, rendered before it,
    sees the routes only from the next navigation on.
- **The server view:** `currentLocation()` returns the server path
  (`setServerPath`; `/` unless the prerender renders another route, which
  `mountApp` reads back from `data-gfui-path`). Static HTML (and hydration)
  render that route; a deep link that was not prerendered (`/#/tests/x`)
  switches right after takeover, like a responsive `When` (step 13).
- **`registeredRoutes()`** gives the prerender the patterns `Pages`
  registered while rendering `/` ([ssg.md](ssg.md#prerendered-routes)).

## How `Pages` finds its routes

`Pages` reads each child's `url` from the React element.
- **A plain element:** `$$h(Page, { url })`.
- **A `Bound` one** (a Page with an `id`, handlers or lifecycle):
  `$$h(Bound, { type: Page, props: { url } })`.

Two contracts keep that possible:

| Code | Rule |
|------|------|
| E026 | `Page url` must be a literal (`isLiteral` prop metadata) |
| E027 | A `Page` cannot use `when`/`when-*` or variables (`var.*`, `<variable>`): they would wrap it. Put them on its content. (`isRoute` metadata) |

## Files

| File | Contents |
|------|----------|
| `runtime/src/render/router.ts` | `navigate` (with `navigateBy`, `openInNewTab`), `redirect`, `setNavigationHandlers`, `setBasename`, `getBasename`, `normalizeBasename`, `currentLocation`, `currentRouteParams`, `matchRoute`, `findRoute`, `parseLocation`, `routePath`, `hrefFor`, `registerRoutes`, `registeredRoutes`, `setRoutingMode`, `routingMode`, `setServerPath`, `resetRouter` |
| `runtime/src/render/app-globals.ts` | `navigate`, `$pathname`, `$queryParams`, `$routeParams` (getter entries: they honor the server view) |
| `components/src/routing.tsx` | `Pages`, `Page`, `Link` |
| `components/src/theme.tsx` | `App useHashBasedRouting`, `onWillNavigate`/`onDidNavigate` (registered with the router) |
| `test-apps/routing/` | The E2E fixture (hash routing): a dashboard of buttons and links, routed pages, a guard and a navigation log |
| `test-apps/routing-browser/` | The E2E fixture (browser routing): every static route prerendered, a guard and a log; built a second time with `--base /app/` |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/render/router.test.ts` | `matchRoute` table, `findRoute`, `parseLocation`; hash mode (reading, `popstate`, `navigate`, `replace`); browser mode (`popstate`); `$routeParams`; the server view |
| `runtime/tests/render/router-events.test.ts` | The guard's answers (table), holding while it decides, throw and timeout, `queryParams`, `replace`, latest wins, a redirecting guard, handler registration, a failing `didNavigate`; `redirect`; browser moves: the first load, an allowed and a refused back (never shown, restored with `history.go`, no entry added), a refused and an allowed typed hash, a hash typed while a refused back move is held (the app's entry gone: rewritten), the state indexes; the server path. Part 2: `navigate(n)` (allowed, refused, held, no entry, `0`, NaN, fractional), the new tab (URL in each mode and under a basename, refused, another target), the basename (normalizing, reading, pushing, `hrefFor`, the base itself, a path outside it, hash mode, reset) |
| `components/tests/routing.test.tsx` | Pages with buttons and links, parameters and query; fallback; deep links and `popstate`; remounting; Bound Pages; browser mode; E021/E026/E027; the events from markup: the log with path and query, a guarded Link and `navigate`, the unguarded fallback, removal on unmount, E004 for a misspelled event |
| `e2e/routing.spec.ts` (projects `routing-dev`, `routing-build`) | Navigation by button and link, back/forward, parameters and query, static-before-parameter order and fresh state, a deep link after takeover, the fallback; the log; the guard against a button, a link, back and a typed hash typed while a guard decides (nothing renders, the history stays usable); `navigate(-1)` allowed and refused; a new tab at the hash URL, without an opener |
| `e2e/routing-browser.spec.ts` (project `routing-browser-build`) | Browser routing on the prerendered build: each route's file without JavaScript, a takeover that changes nothing, links and `navigate` with `queryParams` in one document, the log, the guard (link, button, back; never rendered, no entry added), a deep link to a route that was not prerendered; `navigate(-1)` and a new tab |
| `e2e/routing-base.spec.ts` (project `routing-base-build`, port 5185) | The same app built under `base: "/app/"`: each file without JavaScript with links under the base, takeover, links, `navigate`, back and `navigate(-1)` under the base, a deep link, a new tab |
