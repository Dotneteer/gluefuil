# Step 13: Static generation and takeover

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

A build can **prerender** the app to static HTML, which shows before any
JavaScript runs. The engine then **takes over** that HTML with
`hydrateRoot`: it reuses the DOM instead of re-creating it, and signals
resume at the values the HTML shows.

## Background (XMLUI)

- **`xmlui ssg`** (`xmlui/src/nodejs/bin/ssg.ts`):
  - discovers the static routes (`<Page url>` without parameters);
  - builds an SSR entry that renders `StandaloneApp` with `renderToString`
    under a `StaticRouter`, per route;
  - injects the markup and the collected styles into each route's HTML.
- **Takeover** (`xmlui/src/components-core/StandaloneApp.tsx`, `startApp`):
  `hydrateRoot` when `#root` has content, otherwise `createRoot`.
- **No state is serialized.** The client recomputes the initial state, which
  matches because initializers are deterministic.
- **Not relevant to us:** XMLUI collects CSS-in-JS styles during SSR (its
  `StyleRegistry`). Our components have no runtime CSS so far: classes plus
  inline styles, which are in the HTML.

## Design

### The one real difference between server and client: the viewport

- The state comes from the same compiled initializers on both sides, so it
  matches. Nondeterministic initializers (`Math.random()`, the time) are the
  author's responsibility, and a test shows they are caught.
- **The breakpoint differs.** The server has no viewport, and the client
  has a real width. `When` with `when-*` rules would render different trees,
  which is a hydration mismatch.
- **The answer is React's `getServerSnapshot`.** During hydration,
  `useSyncExternalStore` renders with the server snapshot, then re-renders
  only the components whose client snapshot differs.
  - `useComputed` gets a server snapshot: `fn` evaluated untracked in the
    **server view**, cached with `equals`.
  - In the server view, `When` reads the **prerender breakpoint** instead
    of the live one.
  - The server renders with the same server view.
  - The result: the static HTML and the hydrated tree agree, and a
    responsive `When` switches right after takeover.

### Runtime

- `reactivity/server-view.ts`: `inServerView(fn)`, `isServerView()`.
- `render/visibility.ts`:
  - `setServerBreakpoint(index)` (default 0 = `xs`);
  - `currentBreakpoint()` returns the server breakpoint in the server view,
    else the live signal. `When` uses it.
- `render/mount.ts`, `mountApp(container, app)` (added during the work:
  `data-pfui-ready` on the container once the app is live):
  - if the container has `data-pfui-prerendered="<breakpoint>"`: set the
    server breakpoint, then `hydrateRoot`. Recoverable errors (mismatches)
    go to `reportRuntimeError`;
  - otherwise `createRoot(...).render(app)`.
- **New entry point `@patchfuil/runtime/server`** (`src/server.ts`), Node
  and SSG only: `renderStatic(app, { breakpoint })` returns
  `{ html, attributes }` through `renderToString` in the server view. A
  separate entry keeps `react-dom/server` out of client bundles.

### The Vite plugin: `pfui({ prerender })`

| Option | Default | Meaning |
|--------|---------|---------|
| `prerender` | off | `true` or `{ entry, rootId, breakpoint }` |
| `entry` | `"src/Main.pfui"` | The root component's file, relative to the Vite root |
| `rootId` | `"root"` | The empty element in `index.html` to fill |
| `breakpoint` | `"xs"` | The viewport the static HTML is rendered for (mobile-first) |

- **`transformIndexHtml`** (build only):
  1. starts a Vite server in middleware mode, with only the transform part
     of the plugin (`configFile: false`, same root, no source maps);
  2. `ssrLoadModule`s the entry and `@patchfuil/runtime/server` in that
     server, so they share one copy of the runtime and React;
  3. renders and fills `<div id="root"></div>`, adding the attributes.

  A missing or non-empty root element, or an error while rendering, fails
  the build with a clear message.
- **The dev server** doesn't prerender. `mountApp` falls back to
  `createRoot`.

### The hello app

- `vite.config.ts`: `pfui({ prerender: true })`.
- `main.tsx`: `mountApp(root, <StrictMode><Main/></StrictMode>)`.

### Not in this step

- **Routes:** one page per app until routing exists.
- **Interactions before takeover:** React 19 replays discrete events on
  hydration. We don't test this yet.
- **Standalone mode** keeps `createRoot`: its HTML isn't prerendered.

## Tests

- **Unit (runtime):**
  - `inServerView`;
  - `useComputed`'s server snapshot (`renderToString` uses it);
  - `currentBreakpoint` in and out of the server view;
  - `mountApp`: `createRoot` on an empty container; on prerendered HTML it
    hydrates with no DOM node replaced (a MutationObserver), and the
    breakpoint switch afterwards changes only the `When` subtree;
  - a nondeterministic initializer is reported;
  - `renderStatic`.
- **Unit (plugin):** HTML injection (the root found, attributes added, a
  missing or non-empty root fails).
- **Build check:** the built `index.html` contains the rendered app;
  `react-dom/server` is not in the client bundle.
- **E2E (`hello-build`):**
  - with JavaScript disabled, the content is visible;
  - with JavaScript, at a narrow viewport (`xs`, as prerendered): takeover
    changes no DOM node, there are no errors, and interaction works;
  - at desktop width: only the responsive text changes
    (`compact` → `wide`).

## Outcome

Implemented as designed. Details: [`../docs/ssg.md`](../docs/ssg.md).

- **The hello app's build prerenders** all step demos into `index.html`
  (2.9 KB). The prerender adds about 0.1 s to the build. The client bundle
  grew by about 1 KB (`hydrateRoot`).
- **E2E, against the production build:**
  - JavaScript disabled: the content is visible.
  - At the prerendered breakpoint: takeover leaves every prerendered
    element in place, with no node added, removed or changed. Clicks and
    typing work afterwards.
  - At desktop width: exactly the responsive text switches.
  - The 14 hello tests pass after takeover.
- `npm run check`: 1,645 unit tests in 54 files and 35 E2E tests.

## Findings

- **`getServerSnapshot` is the right tool for environment values.** With
  the server snapshot disabled, the responsive takeover test fails (the
  control). With it, React hydrates the HTML as rendered, then updates only
  the components that differ.
- **Component APIs are not in the static HTML.** `useComponentApi`
  publishes in an effect, so `box.value` is undefined on the server and in
  the client's first render (they agree, so there is no mismatch), and the
  value appears right after mount. For SSG this means texts that read
  another component's API show their fallback in the static HTML. Two
  possible remedies for a later step:
  - components declare their initial API values, so the file scope can
    expose them before mount;
  - IDs resolve to an API object that exists from the start, with the
    component filling it in.
- **Hydration is an interaction-free boundary to measure.** A
  MutationObserver installed by an init script, started when parsing ends
  and before module scripts run, gives an exact account of what takeover
  changed. This is stronger than "no console warnings", because the
  production React build repairs some mismatches silently.
- **No state transfer is needed yet.** Every initial value is recomputed
  identically. It will be needed once apps load data at build time.

## Open for later steps

- **Multiple pages** (routing): prerender each static route.
- **Build-time data:** serialize the state into the page.
- **Events before takeover:** React replays discrete events during
  hydration. We haven't tested this.
- **The component-API remedy** described under *Findings*.
- **Standalone mode** could hydrate prerendered HTML as well. It still
  uses `createRoot`.
