# Static generation and takeover

> Subsystem reference for prerendering an app to static HTML at build time,
> and taking that HTML over in the browser. Describes the code as it is.
> Design and XMLUI comparison: [`../plan/poc-13-ssg.md`](../plan/poc-13-ssg.md).
>
> **Last updated:** step 13.

## Using it

```ts
// vite.config.ts
plugins: [pfui({ prerender: true }), react()],
```

```tsx
// main.tsx
import { mountApp } from "@patchfuil/runtime";
import Main from "./Main.pfui";

mountApp(document.getElementById("root")!, <Main />);
```

- **`vite build`** renders `src/Main.pfui` into the empty `<div id="root">`
  of `index.html`, adding `data-pfui-prerendered="xs"`.
- **In the browser,** `mountApp` sees the marker and hydrates; without it
  (the dev server) it renders fresh.
- **When the app is live,** the container gets `data-pfui-ready`, either
  way.

| `prerender` option | Default | Meaning |
|--------------------|---------|---------|
| `entry` | `"src/Main.pfui"` | The root component's file, relative to the Vite root |
| `rootId` | `"root"` | The id of the empty element in `index.html` to fill |
| `breakpoint` | `"xs"` | The viewport the HTML is rendered for (mobile-first) |

## The prerender (`vite-plugin/src/prerender.ts`)

The plugin's `transformIndexHtml` (`order: "post"`) runs only in a client
build:

1. **`renderEntry`** starts a temporary Vite server: middleware mode, no
   HMR, `configFile: false`, the same root. Its only plugin is a plain
   `pfui({ sourceMap: false })`: the compile step, without a prerender.
2. It `ssrLoadModule`s the entry and `@patchfuil/runtime/server` **into
   the same module graph**, so both use one runtime (one signal store, one
   breakpoint) and one React.
3. `renderStatic(Main, { breakpoint })` returns `{ html, attributes }`.
4. **`injectPrerendered`** fills the root element and adds the
   attributes. The element must exist, be empty (whitespace is fine) and
   not be self-closing. Otherwise the build fails with a message, rather
   than overwriting the author's content.

An exception while rendering fails the build. The prerender adds about
0.1 s to the hello app's build.

## Takeover (`runtime/src/render/mount.ts`)

`mountApp(container, app, { onRecoverableError? })`:

- **With `data-pfui-prerendered="<breakpoint>"`:**
  `setServerBreakpoint(…)`, then `hydrateRoot`. Recoverable errors, such as
  a mismatch React repaired by rendering on the client, go to
  `onRecoverableError`, by default `reportRuntimeError`.
- **Without it:** `createRoot(container).render(app)`.
- The app is wrapped in `Ready`, which renders no DOM of its own. As the
  outermost component, its effect runs last and sets `data-pfui-ready`.

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
| `runtime/src/server.ts` | `@patchfuil/runtime/server`: `renderStatic` |
| `vite-plugin/src/prerender.ts` | `resolvePrerender`, `injectPrerendered`, `renderEntry` |
| `test-apps/hello/src/main.tsx` | `mountApp` in use |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/render/server-view.test.tsx` | `inServerView`; breakpoint names; `currentBreakpoint` in and out of the server view; server rendering reads the server snapshot; its cache (no React warning); `renderStatic` (elements, components, the marker); `mountApp` (fresh, hydrating, `data-pfui-ready`, mismatches reported) |
| `components/tests/ssg.test.tsx` | Compile, render statically, take over in jsdom: the static HTML; no node replaced and the app interactive afterwards; responsive `When` switching only its own subtree, or nothing when prerendered for the client's breakpoint; the live breakpoint afterwards; a nondeterministic initializer reported; a container without the marker; an unknown breakpoint. **Control:** without the server snapshot, the responsive test fails |
| `vite-plugin/tests/prerender.test.ts` | Options; `injectPrerendered` (attribute forms, escaping, refusals); the hook runs last and not in dev, without the option, or in SSR builds |
| `tools/build-output.test.ts` | The built `index.html` holds the app rendered for xs; no `react-dom/server` or `runtime/server` in the bundle; a render error and a missing root fail the build |
| `e2e/ssg.spec.ts` (project `hello-build`) | JavaScript disabled: the content is visible and not live. At xs: takeover changes nothing (a MutationObserver installed before any script), then clicks and typing work. At desktop width: only the responsive text switches |
