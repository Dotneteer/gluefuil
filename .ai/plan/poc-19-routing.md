# Step 19 (reduced): Routing

**Status:** Done

Part of [poc-steps.md](poc-steps.md). **This replaces the full step 19**
(the layout model and the App shell), at the user's request, with
rudimentary routing. It is enough for a playground: a dashboard of
buttons, each opening a page with one manual test scenario.

## Goal

```xml
<App>
  <Pages fallbackPath="/">
    <Page url="/">
      <Button label="Theming" onClick="navigate('/tests/theming')"/>
      <Link to="/tests/mantine">Mantine</Link>
    </Page>
    <Page url="/tests/:name">
      <H1>{$routeParams.name}</H1>
      <Button label="Back" onClick="navigate('/')"/>
    </Page>
  </Pages>
</App>
```

## Background (XMLUI)

Source: `.ai/xmlui/routing.md` (`components/Pages`, `AppWrapper`,
`AppContent`).

- **The structure:** `App` → `Pages` (`fallbackPath`, default `/`) → one
  `Page url="…"` per route, using React Router v6 patterns (static
  segments, `:param`, `:param?`, `*`).
- **Non-`Page` children** of `Pages` render outside the routes.
- **`navigate(to)`** is a global for handlers.
- **`$pathname`, `$routeParams` and `$queryParams`** are reactive in every
  expression.
- **`<Link to>`** is a component.
- **Hash routing is the default** (`useHashBasedRouting`): `/#/path` URLs
  need no server routing. The browser router needs the server to send
  `index.html` for every path. Server rendering uses a memory router.

## Design

### Our own router (`runtime/src/render/router.ts`), no react-router

**State:**
- a location signal (`pathname`, `query`);
- the mode (`"hash"` by default, or `"browser"`);
- the listeners (`hashchange` / `popstate`), attached on first use in a
  browser.

**`navigate(to, { replace? })`** (app global):
- hash mode sets `location.hash` (or replaces);
- browser mode uses `pushState` / `replaceState`;
- either way the signal updates.

**App globals:**
- `$pathname`, `$queryParams` (from `?a=1`);
- `$routeParams`: the parameters of the first registered route that
  matches;
- `navigate`.

**`matchRoute(pattern, pathname)`:**
- static segments, `:name`, an optional `:name?`, and a final `*` (as
  `$routeParams['*']`);
- trailing slashes ignored;
- segments URL-decoded.

**Server rendering and hydration:** in the server view (step 13), the
location is the prerender path, `/`. The static HTML therefore matches
what hydration renders, and a deep link (`/#/tests/x`) switches after
takeover, like a responsive `When`.

### Components (`components/src/routing.tsx`)

- **`Pages`** (`fallbackPath`, default `"/"`):
  - it reads its `Page` children's `url`s (a constant: see the contracts)
    and registers them, in order, for `$routeParams`;
  - it renders the **first** `Page` whose pattern matches, plus every
    non-`Page` child;
  - when nothing matches, it navigates to `fallbackPath` (replace).
- **`Page`** (`url`): renders its children. Its content mounts only
  while it is active.
- **`Link`** (`to`): `<a href>` with the real URL (`#/x` in hash mode).
  - A plain click navigates without a page load.
  - Modified clicks (Ctrl, Cmd, a new tab) are left to the browser.
- **`App`** gains `useHashBasedRouting` (default true), which sets the
  mode.
- **`Pages` and `Page` are `nonVisual`.**

### Contracts

- **`Page url` is required and must be a literal.** `Pages` matches
  patterns without evaluating anything.
  - A new prop flag, `isLiteral`, triggers **E026** for a bound value.
- **A `Page` element directly under `Pages`** may not use `when` or `var.*`
  (they would wrap it): E027.

### Not in this step

- Nested pages, guards, `willNavigate`/`didNavigate`, query-parameter
  constraints.
- `NavPanel`, `NavLink`, the App shell and layout.
- Prerendering routes other than `/`.

## Tests

- **Unit (runtime):** `matchRoute` tables; the location in hash and
  browser modes; `navigate`; the globals; the server view.
- **Unit (components):**
  - `Pages`: first match, `$routeParams`, fallback, non-`Page` children,
    unmounting inactive pages;
  - `Link`: href and clicks;
  - the contract errors.
- **E2E:** a routing fixture (`test-apps/routing`, dev server and
  prerendered build):
  - the dashboard buttons and links navigate;
  - route parameters show;
  - back and forward work;
  - a deep link loads its page;
  - unknown paths fall back;
  - state on the dashboard is fresh after returning (pages remount).

## Outcome

Implemented as designed. Details: [`../docs/routing.md`](../docs/routing.md).

- **The `test-apps/routing` fixture** (a dashboard of buttons and links
  opening pages) passes the same E2E spec on the dev server and as a
  prerendered build with hash routing on a plain static server:
  - navigation by button and link;
  - back and forward;
  - parameters and query;
  - a deep link after takeover;
  - the fallback;
  - fresh page state on each visit.
- `npm run check`: 1,950 unit tests in 67 files and 77 E2E tests.

## Findings

- **No router library was needed.** About 200 lines: a location signal,
  pattern matching, and `navigate` over `pushState`/`hashchange`. They
  integrate with the signal store and the server view directly.
- **The server view handles deep links in prerendered pages** the same
  way it handles breakpoints: the HTML for `/` hydrates without a mismatch,
  then the route switches.
- **Reading route patterns from React elements** is simple, but it ties
  `Pages` to how a `Page` compiles. Two contracts (E026 literal url, E027
  no wrapping) keep it reliable, and `Pages` understands both the plain
  and the `Bound` element shape.
- **Vite's dependency discovery** reloads the page on the first visit
  with a cold cache, which made a fresh fixture's first E2E run flaky.
  `optimizeDeps.include` in the fixture configs fixes it.

## Open for later steps

- **The rest of step 19:** the layout model and the App shell (`NavPanel`,
  `NavLink`, headers).
- **Nested pages,** guards, `willNavigate`/`didNavigate`, typed route
  parameters.
- **Prerendering every static route,** not only `/`.
