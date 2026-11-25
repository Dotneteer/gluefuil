# Build-time compilation

> Subsystem reference for `packages/vite-plugin`: compiling `.gui` files
> during a Vite build or dev session. Describes the code as it is. Design and
> XMLUI comparison: [`../plan/poc-12-build-time.md`](../plan/poc-12-build-time.md).
>
> **Last updated:** step 21B (`entry`, `Globals.xs`).

## Using it

```ts
// vite.config.ts
import { gfui } from "@gluefuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [gfui(), react()] });
```

```tsx
// main.tsx
import { createRoot } from "react-dom/client";
import Main from "./Main.gui"; // the root component

createRoot(document.getElementById("root")!).render(<Main />);
```

TypeScript needs `declare module "*.gui"` (see `test-apps/hello/src/gfui.d.ts`).

**Workspace note:** while the packages export TypeScript source,
`vite`/`vite build`/`vite preview` need `--configLoader runner`. The default
loader treats workspace packages as external, and Node can't load their
extensionless imports.

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `entry` | `"src/Main.gui"` | The app's root file (step 21B). Its root's `global.*` and the `Globals.xs` beside it are the globals every other file is compiled with (`AppGlobals`, re-read when either changes; each file watches both). The entry itself compiles `Globals.xs` (`globalsCode`), whose errors fail the transform at `Globals.xs`. The prerender renders it unless `prerender.entry` says otherwise. |
| `components` | the built-in metadata | The components markup may use (`Record<string, ComponentMetadata>`) |
| `sourceMap` | `"auto"` | `"auto"`: on while serving; in a build, on only when `build.sourcemap` is set. `true` / `false` force it |
| `prerender` | off | Static generation: `true` or `{ entry, rootId, breakpoint, routes }` ([ssg.md](ssg.md)); with browser routing, one file per static route ([ssg.md § Prerendered routes](ssg.md#prerendered-routes)) |
| (Vite `base`) | `/` | An absolute base other than `/` (`/app/`) becomes the router's basename: `transformIndexHtml` writes `data-gfui-base="/app"` on the root element (dev and build, with or without prerender; `basenameOf`, `addRootAttributes`), and `mountApp` reads it ([routing.md § The basename](routing.md#the-basename)). A relative or full-URL base gives none. |
| `strictContracts` | `true` | `false`: contract violations are warnings ([contracts.md](contracts.md)) |
| `extensions` | none | The app's own React components: `{ Name: { module, metadata } }`. `module` is relative to the Vite root and exports `Name`; each `.gui` file imports it with a relative path (`componentModules`), and its contracts are checked like a built-in's. Example: the playground's `ScenarioSource`. |
| `componentsDir` | `"src/components"` | User-defined component files, relative to the Vite root ([user-components.md](user-components.md#delivery)) |

**The mock backend** is a second plugin from the same package,
`gfuiMockBackend({ module, host, build })`. It runs a backend for
development (a service worker in the page, or dev-server middleware) and,
with `build: true`, in a production build too ([mock-backend.md](mock-backend.md)).

With source maps off, the compiler emits no position markers. The code is
identical either way (tested). The transform then returns
`{ mappings: "" }`, Rollup's "no meaningful map".

## The transform

- `enforce: "pre"`, so it runs before React's plugin, which expects
  JavaScript.
- **Ids:** `gfuiFilePath(id)` drops `?query` and `#hash`, then matches
  `.gui`. An id with `?raw`, `?url`, `?inline` or `?worker` is not a module
  to compile: `import.meta.glob("*.gui", { query: "?raw" })` gets the text.
- **Output:** `compileModule(source, { format: "esm", fileName: basename,
  sourceMap, components, userComponents, codeBehind })`. This is an ES
  module that imports `@gluefuil/runtime`, `@gluefuil/components` and
  the user components it uses (`./components/X.gui`), and whose default
  export is the root component (an app file) or the component (a
  component file). The map's `sources` entry is the file's basename,
  which the browser resolves relative to the module.
- **User components and code-behind** ([user-components.md](user-components.md#delivery)):
  - the folder `componentsDir` is scanned on every transform; each
    component file is `addWatchFile`d;
  - `<file>.xs` is read (and watched) as code-behind, and its errors fail
    the transform at the `.xs` file;
  - a component or code-behind file appearing or disappearing recompiles
    every `.gui` module and reloads.
- **Warnings:** `this.warn` with `loc`.
- **Errors:** `this.error` with:
  - `id`, `loc` (`file`, 1-based `line`, 0-based `column`) and `frame` for
    the first error;
  - a message listing every error as `file:line:col: error CODE: message`,
    each followed by its code frame (`codeFrame` from the compiler, shared
    with the standalone overlay).

  The Vite overlay shows this while serving; a build fails with it.

**HMR:** a `.gui` module doesn't accept updates, so an edit propagates to
the entry and the page reloads.

## What a production build contains

These properties are checked by `tools/build-output.test.ts` on a real
build of `test-apps/hello`:

- **No compiler:** no module from `packages/compiler`, and not even
  `components/src/metadata.ts`. A compiled module imports only the runtime
  and the components' main entry, and nothing there reaches the compiler
  (`tools/boundaries.ts` enforces this).
- **No eval:** no `new Function`, no `eval(`. The runtime's two eval paths,
  `loadModule` (`render/module.ts`) and `loadBinding` (`script/load.ts`),
  are standalone-only and tree-shaken away. The binding check every app
  needs (`assertBindingValue`) lives in `script/binding-value.ts` so that
  `load.ts` contributes nothing.
- **No markers and no map** unless `build.sourcemap` is set. With it, the
  map's sources include `src/Main.gui` with its content.
- **No server rendering code:** `react-dom/server` and
  `@gluefuil/runtime/server` stay in the build (the prerender).
- **Size:** the hello app (all step demos) is 244 KB, 76 KB gzipped; React
  and ReactDOM are most of it. Its `index.html` (2.9 KB) holds the
  prerendered app.

The E2E project `hello-build` serves this build with
`Content-Security-Policy: script-src 'self'` (`preview.headers` in the hello
app's config):

- every hello spec passes there, after a takeover of the prerendered HTML;
- `e2e/build.spec.ts` checks that the app raises no CSP violations, that
  a page-level eval *is* blocked (the control), and that no `.gui` file is
  fetched.

## Files

| File | Contents |
|------|----------|
| `vite-plugin/src/index.ts` | `gfui(options)`, `gfuiFilePath`, `formatErrors`, `GfuiPluginOptions` |
| `vite-plugin/src/prerender.ts` | Static generation ([ssg.md](ssg.md)) |
| `vite-plugin/src/components.ts` | Component discovery and code-behind ([user-components.md](user-components.md)) |
| `compiler/src/source/diagnostic.ts` | `codeFrame` (with `formatDiagnostic`) |
| `test-apps/hello/vite.config.ts` | The plugin in use; `preview.headers` sets the CSP |

## Tests

| File | Covers |
|------|--------|
| `vite-plugin/tests/plugin.test.ts` | Which ids are transformed; `enforce`; ESM output; custom components; the six source-map modes and identical code with and without; errors (location, frame, every error listed; markup errors); nothing reported for valid files |
| `vite-plugin/tests/globals.test.ts` | Step 21B: `AppGlobals` (the entry's globals then `Globals.xs`, re-read on change, a missing entry); a component file compiled with them and watching both files, C001 without; the entry compiles `Globals.xs` and reports its errors at its positions; another app file doesn't; the `entry` option; the prerender's default entry |
| `compiler/tests/source/line-map.test.ts` | `codeFrame` with `\n`, `\r\n` and `\r` line breaks; the last line |
| `tools/build-output.test.ts` | A real `vite build` of the hello app: one chunk with the app, the runtime and the components; no compiler module; no eval; the standalone loader tree-shaken away; no markers and no map, or a map back to `Main.gui` with `build.sourcemap` |
| `tools/boundaries.test.ts` | vite-plugin imports only the compiler, components/metadata, vite and `node:*`; no package imports `standalone` or `vite-plugin` |
| `e2e/build.spec.ts` (+ the hello specs in project `hello-build`) | The built app under a strict CSP |
