# Routing

> Subsystem reference: `Pages`, `Page`, `Link`, `navigate` and the routing
> globals, and the router behind them. Describes the code as it is. Design
> and XMLUI comparison: [`../plan/poc-19-routing.md`](../plan/poc-19-routing.md).
>
> **Last updated:** step 19 (reduced: routing only).

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
| `navigate(to, { replace })` | App global: goes to a route (`/a/b?x=1`); `replace: true` replaces the history entry |
| `$pathname` | App global: the current route's path (reactive) |
| `$queryParams` | App global: its query, decoded (`{ step: "16" }`) |
| `$routeParams` | App global: the first matching registered route's parameters (`{ name: "theming" }`, `*` for a wildcard) |
| `Pages` | Renders the **first** `Page` whose `url` matches, plus every non-`Page` child. No match: `navigate(fallbackPath, { replace: true })` (default `/`). |
| `Page` | `url` (required, literal): `/static`, `/users/:id`, `/users/:id?`, `/files/*`. Only the active page's content is mounted, so it starts fresh on each visit. |
| `Link` | `to` (required), `label` or content: `<a class="pfui-Link" href="#/x">`. A plain click navigates without a page load; modified clicks (new tab, …) are left to the browser. |
| `App useHashBasedRouting` | Default true: routes live after `#`, so any static server works. With false, the path and the History API are used, and the server must answer every path with `index.html`. |

## The router (`runtime/src/render/router.ts`)

Our own router, not react-router; XMLUI wraps react-router v6.

- **State:**
  - a location signal (`{ pathname, query }`);
  - the mode;
  - `hashchange`/`popstate` listeners, attached on first use in a browser.
- **`navigate`** uses `pushState`/`replaceState` (in hash mode the URL is
  the page path plus `#/route`) and sets the signal: those calls fire no
  event.
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
- **The server view:** `currentLocation()` returns the prerender path, `/`.
  Static HTML (and hydration) render the dashboard; a deep link
  (`/#/tests/x`) switches right after takeover, like a responsive `When`
  (step 13).

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
| `runtime/src/render/router.ts` | `navigate`, `currentLocation`, `currentRouteParams`, `matchRoute`, `findRoute`, `parseLocation`, `hrefFor`, `registerRoutes`, `setRoutingMode`, `resetRouter` |
| `runtime/src/render/app-globals.ts` | `navigate`, `$pathname`, `$queryParams`, `$routeParams` (getter entries: they honor the server view) |
| `components/src/routing.tsx` | `Pages`, `Page`, `Link` |
| `components/src/theme.tsx` | `App useHashBasedRouting` |
| `test-apps/routing/` | The E2E fixture: a dashboard of buttons and links, and routed pages |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/render/router.test.ts` | `matchRoute` table, `findRoute`, `parseLocation`; hash mode (reading, `hashchange`, `navigate`, `replace`); browser mode (`popstate`); `$routeParams`; the server view |
| `components/tests/routing.test.tsx` | Pages with buttons and links, parameters and query; fallback; deep links and `hashchange`; remounting; Bound Pages; browser mode; E021/E026/E027 |
| `e2e/routing.spec.ts` (projects `routing-dev`, `routing-build`) | Navigation by button and link, back/forward, parameters and query, static-before-parameter order and fresh state, a deep link after takeover, the fallback |
