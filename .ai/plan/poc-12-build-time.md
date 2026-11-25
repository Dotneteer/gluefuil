# Step 12: Build-time compilation

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

A Vite plugin compiles `.gui` files during the build. The shipped bundle
contains **no parser and no compiler** and needs **no `eval`**, so the app
runs under a strict Content Security Policy (`script-src 'self'`).

## Background

- **Here (before this step):** `test-apps/hello/vite.config.ts` has a
  20-line plugin from step 5. A production build of the hello app is
  already 243 KB (76 KB gzipped). It contains no compiler module and no
  `new Function`: tree-shaking drops the runtime's standalone loader
  (`loadModule`, `loadBinding`). Nothing proves or protects that yet.
- **XMLUI** (`xmlui/src/nodejs/vite-xmlui-plugin.ts`):
  - The transform turns a `.xmlui` file into **data** (a `ComponentDef`
    tree, through `dataToEsm`). The runtime still interprets it.
  - Script compilation is opt-in (`compileScripts`), and falls back to the
    interpreter when compilation fails. The interpreter therefore always
    ships.
  - `handleHotUpdate` returns the changed module for `.xmlui` files, and
    triggers a full reload for script files.
  - It also runs analyzers (static analysis, reactive cycles,
    accessibility, type contracts), each with `"off" | "warn" | "strict"`.
- **Divergence:** our output is JavaScript (React components), not data.
  There is nothing to interpret, so there is no fallback and no
  interpreter to ship. A compile error fails the build.

## Design

### Package `@gluefuil/vite-plugin`

- `packages/vite-plugin/src/index.ts` exports `gfui(options?)`, a Vite
  plugin. Node-only. It may import the compiler and Node built-ins.
- **Boundaries:** the compiler, runtime and components must not import
  it. A new rule in `tools/boundaries.ts` enforces this.
- `test-apps/hello` uses it, replacing its inline plugin.

### The transform

- Applies to ids ending in `.gui`, after dropping a `?query`.
- `compileModule(source, { format: "esm", fileName, components, sourceMap })`.
  - `fileName` is the basename: the map's `sources` resolve relative to
    the module.
- **Errors:** `this.error` with the first error's `loc` (`file`, `line`,
  `column`) and a code frame. The message lists every error as
  `file:line:col: error CODE: message`, so the Vite overlay and the
  terminal show all of them.
- **Warnings:** `this.warn`, one per warning.

### Options

| Option | Default | Meaning |
|--------|---------|---------|
| `components` | the built-in metadata | The components markup may use (extension libraries) |
| `sourceMap` | `"auto"` | `"auto"`: always while serving; in a build, only when `build.sourcemap` is set. `true` / `false` force it |

With `sourceMap` off, the compiler emits no markers and returns no map,
which is the cheaper path (step 9).

### Code frames

`codeFrame(source, offset)` moves to the compiler (`source/diagnostic.ts`):
the source line plus a caret. The standalone error overlay and the plugin
share it.

### HMR

There is no change here. A `.gui` module doesn't accept updates, so Vite
propagates to the entry, which reloads the page. Keeping state across
edits needs component-level swapping, which is a later step.

## Tests

- **Unit (`packages/vite-plugin/tests`):** the plugin's hooks, called
  directly:
  - non-`.gui` ids are ignored; queries are stripped;
  - the output is ESM importing `@gluefuil/runtime`;
  - errors: `this.error` with `loc` and frame, all errors listed;
  - the `sourceMap` modes: serve, build, build with `build.sourcemap`, and
    forced;
  - custom `components`;
  - `codeFrame`.
- **Bundle check (`tools/build-output.test.ts`):** a real `vite build` of
  the hello app (`write: false`):
  - no module from `packages/compiler` is in the bundle;
  - the output contains no `new Function` and no `eval(`;
  - the output contains no source-map marker characters;
  - with `build.sourcemap: true`, the map's sources include `Main.gui`.
- **E2E:** the hello app is built and served by `vite preview` with
  `Content-Security-Policy: script-src 'self'`.
  - The hello specs (first app, variables, async handlers, IDs,
    conditionals and templates) run twice, in Playwright projects
    `hello-dev` (dev server) and `hello-build` (built app).
  - The source-map spec runs against dev only.
  - A build-only spec asserts that the CSP header is present and that no
    `securitypolicyviolation` event fires.

## Outcome

Implemented as designed. Details: [`../docs/build-time.md`](../docs/build-time.md).

- `@gluefuil/vite-plugin` replaces the hello app's inline plugin. The
  build output is byte-identical to before (same content hash).
- The production build of the hello app is 243 KB, 76 KB gzipped. It
  contains no compiler module and no `new Function`/`eval(`.
- E2E: all five hello specs (14 tests) pass against the production build
  served with `script-src 'self'`. `build.spec.ts` sees no violations, and
  its control (a page-level string eval) is blocked and reported.
- `npm run check`: 1,603 unit tests in 51 files and 32 E2E tests.

## Findings

- **A compiler-free build already held; now it is protected.** Before
  this step, nothing would have noticed a runtime change that pulled in the
  compiler or kept `new Function` alive. The bundle check and the CSP E2E
  now do.
- **"Included" isn't "shipped".** Rolldown lists a module in `moduleIds`
  even when tree-shaking drops all its code. The check uses each module's
  `renderedLength`.
- **A shared helper kept the eval file alive.** `assertBindingValue` (used
  by every binding) lived in `script/load.ts` next to `loadBinding`. It
  moved to `script/binding-value.ts`, so the eval file contributes nothing
  to a build and the test can say so.
- **CSP tests need a control.** Playwright's `page.evaluate` runs through
  DevTools, which CSP exempts: `new Function` succeeded there under the
  strict policy. A string `setTimeout` is eval run by the page, and it is
  blocked and reported. Without the control, "no violations" would prove
  nothing.
- **Delivery packages are leaves.** The boundary checker now enforces
  this: no package imports `standalone` or `vite-plugin`, and the plugin
  doesn't import React or the runtime.

## Open for later steps

- **HMR that keeps state:** today an edit reloads the page. That needs
  component-level swapping, the same open item as in standalone mode.
- **Component files** (`components/Name.gui`, step 14): compiled modules
  will import each other, which the plugin handles as ordinary imports.
- **Publishing:** the packages export TypeScript source, so Vite configs
  need `--configLoader runner`. A package build (JS plus `.d.ts`) belongs
  with publishing, not with this POC.
- **Static generation** (step 13) runs the compiled modules in Node; the
  plugin's output is the input.
