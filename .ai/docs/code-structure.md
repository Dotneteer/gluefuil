# Code structure

> **Cornerstone document.** Describes the repository as it is now. It is
> updated at the end of every proof-of-concept step.
>
> **Last updated:** step 19 (reduced: routing).

## What this repository is

**patchfuil** (short name **pfui**) is a re-invention of the XMLUI framework:
XML markup (`.pfui` files, using XMLUI's markup syntax) plus a JavaScript subset,
**compiled** to JavaScript that renders with React (and Mantine for most
components). The design rationale is in
[`../plan/architecture.md`](../plan/architecture.md); the build order is in
[`../plan/poc-steps.md`](../plan/poc-steps.md).

Current state:

- The workspace and the test infrastructure exist.
- The compiler has its two parsing stages: the **markup parser**
  ([markup-parser.md](markup-parser.md)) and the **script parser** for
  expressions, handlers and code-behind ([script-parser.md](script-parser.md)).
- The compiler compiles **bindings** to sandboxed JavaScript, and the runtime
  loads and runs them ([codegen.md](codegen.md)).
- The runtime has the **reactivity core**: a signal store and one
  `useSyncExternalStore` subscription per component ([reactivity.md](reactivity.md)).
- **The pipeline runs end to end:** a `.pfui` document compiles to one
  JavaScript module that renders with the runtime and four minimal built-in
  components (`App`, `Text`, `Button`, `Stack`) ([modules.md](modules.md)).
- **Variables and handlers** work: `var.*`, `<variable>`, `global.*`,
  `<global>` (follow until assigned), `on*` and `<event>` handlers with
  deep writes and array mutations (copy-on-write on frozen values).
- **Handlers are async** with implicit await, segment batching that cannot
  freeze the store, `$cancel`, handler policies, timeouts and unmount
  cancellation ([async-handlers.md](async-handlers.md)).
- **Component IDs** expose APIs to the whole file (`box.value`,
  `box.setValue()`), and name resolution is complete for variables, IDs,
  app globals and context variables ([scoping.md](scoping.md)). `TextBox`
  is the first component with an API.
- **Source maps:** every compiled module maps back to its `.pfui` file
  (expressions, statements, handlers, elements), on both the Vite and the
  standalone path ([source-maps.md](source-maps.md)).
- **Conditional rendering and templates:** `when`/`when-*`,
  `onMount`/`onUnmount`, template properties and `Items` with
  component-injected context variables
  ([visibility-templates.md](visibility-templates.md)).
- **Standalone mode:** `pfui.js` (one file, React included) fetches,
  compiles, caches and watches `Main.pfui` in the browser
  ([standalone.md](standalone.md)).
- **Build-time compilation:** `@patchfuil/vite-plugin` compiles `.pfui`
  files in Vite. A production build contains no compiler and needs no
  eval: it runs under `script-src 'self'` ([build-time.md](build-time.md)).
- **Static generation:** a build can prerender the app into `index.html`;
  `mountApp` takes it over with hydration, reusing the DOM. A responsive
  `When` hydrates at the prerender breakpoint and switches afterwards
  ([ssg.md](ssg.md)).
- **User-defined components:** `<Component>` in component files or inline,
  with `$props`, events, methods and `$self`, default and named slots with
  slot props, complete scope isolation, and code-behind (`.pfui.xs`), in
  every delivery mode ([user-components.md](user-components.md)).
- **Contracts:** one metadata format describes every component (built-ins
  declare it, user components get it derived). Markup is checked for
  unknown props, events and API members (with "did you mean"), missing
  required props, wrong literal types and enums, and deprecations
  ([contracts.md](contracts.md)).
- **Theming:** theme definitions (with `extends`, tones, derived tokens and
  `$refs`) compile to `--pfui-*` CSS variables. The built-ins are styled
  through them, `<Theme>` scopes them, and the app globals switch the tone
  and theme ([theming.md](theming.md)).
- **Wrapped React components:** `wrapComponent` makes React components
  usable from markup. `Button`, `TextBox`, `Select` and `Checkbox` are
  Mantine's, styled only through pfui theme variables, and `Text` variants
  and `Heading`/`H1`–`H6` are our own ([mantine.md](mantine.md)).
- **Routing:** `Pages`/`Page`/`Link`, `navigate()` and
  `$pathname`/`$routeParams`/`$queryParams`, on our own small router (hash
  routing by default) ([routing.md](routing.md)).
- **Behaviors:** `label`, `tooltip` and `variant` attach by trigger props,
  decided at compile time and compiled to `Bound` wrappers, on built-ins
  and user-defined components ([behaviors.md](behaviors.md)).

## Subsystem documents

| Document | Subsystem |
|----------|-----------|
| [markup-parser.md](markup-parser.md) | `packages/compiler/src/markup/` and `src/source/`: `.pfui` markup text to a syntax tree with positions and diagnostics |
| [script-parser.md](script-parser.md) | `packages/compiler/src/script/`: pfui script (a JavaScript subset) to an ESTree-subset tree with file offsets; interpolated values |
| [reactivity.md](reactivity.md) | `packages/runtime/src/reactivity/`: signals, computed values, batching, the React hooks, the scope object |
| [modules.md](modules.md) | `packages/compiler/src/module/`, `packages/runtime/src/render/`, the built-in components: `.pfui` document to a JavaScript module, and how it renders |
| [build-time.md](build-time.md) | `packages/vite-plugin`: the Vite plugin, its options and errors, what a production build contains |
| [routing.md](routing.md) | `runtime/src/render/router.ts`, `components/src/routing.tsx` |
| [mantine.md](mantine.md) | `runtime/src/render/wrap.ts`, `components/src/mantine.tsx`, `text.tsx` |
| [behaviors.md](behaviors.md) | `components/src/behaviors*.ts(x)`, `attachedBehaviors`, the compiler's `withBehaviors` |
| [theming.md](theming.md) | `components/src/theming/` (the engine, built-in themes), `styles.ts`, `App`/`Theme`, `runtime/src/render/theme-state.ts` |
| [contracts.md](contracts.md) | `ComponentMetadata`; the contract checks (E001, E004, E020–E024, C015); `strictContracts` |
| [user-components.md](user-components.md) | `<Component>` definitions, analysis, compilation, `BoundUser`/`useComponent`/`Slot`, discovery in the plugin and standalone, code-behind |
| [ssg.md](ssg.md) | Prerendering (`vite-plugin/src/prerender.ts`), takeover (`runtime/src/render/mount.ts`), the server view, `@patchfuil/runtime/server` |
| [standalone.md](standalone.md) | `packages/standalone`: the one-file engine, loading, the compile cache, watching, the bundle |
| [visibility-templates.md](visibility-templates.md) | `when`/`when-*`, lifecycle, templates and context variables, `Items` |
| [source-maps.md](source-maps.md) | Source markers, Source Map v3, delivery through Vite and `loadModule`, the evidence |
| [scoping.md](scoping.md) | Name resolution (compile time), the scope chain (runtime), component IDs and APIs |
| [async-handlers.md](async-handlers.md) | Handlers at runtime: implicit await, segments (batching across `await`), the watchdog, `$cancel`, policies, timeouts, async-aware array methods, app globals |
| [codegen.md](codegen.md) | `packages/compiler/src/codegen/` and `packages/runtime/src/script/`: bindings compiled to JavaScript, static name resolution, the sandbox, dependencies |

## Repository layout

```
.
├── packages/
│   ├── compiler/        @patchfuil/compiler    markup + script compiler
│   │   ├── src/source/      positions (LineMap), diagnostics, source maps and suggestions ("did you mean"), shared by all stages
│   │   ├── src/markup/      markup parser: text -> syntax tree
│   │   ├── src/script/      script parser: expressions, statements, interpolation
│   │   ├── src/codegen/     bindings -> JavaScript; name resolution and the sandbox
│   │   ├── src/module/      .pfui document -> JavaScript module; analyze.ts (what a file defines and uses)
│   │   ├── tests/           unit tests (mirrors src/)
│   │   └── bench/           benchmarks (npm run bench)
│   ├── runtime/         @patchfuil/runtime     what compiled code calls into
│   │   ├── src/script/      sandbox globals and helpers; the binding-value check; loadBinding (standalone only)
│   │   ├── src/reactivity/  signal store, React hooks, scope object
│   │   ├── src/render/      what compiled modules render with (Bound, BoundUser, useComponent, Slot, TextNode, useScope, loadModule), handler runtime, app globals, mountApp, wrapComponent, the router
│   │   ├── src/server.ts    @patchfuil/runtime/server: renderStatic (static generation; never in client bundles)
│   │   ├── src/errors.ts    the runtime error reporter
│   │   └── bench/           benchmarks (npm run bench)
│   ├── standalone/      @patchfuil/standalone  the one-file engine (dist/pfui.js): fetch, compile, cache, watch
│   ├── vite-plugin/     @patchfuil/vite-plugin build-time compilation: .pfui -> ES module in Vite; component discovery; prerendering
│   └── components/      @patchfuil/components  built-in components (+ React-free metadata)
│       ├── src/basic.tsx    Stack
│       ├── src/mantine.tsx  Button, TextBox, Select, Checkbox (Mantine, through wrapComponent)
│       ├── src/text.tsx     Text (variants), Heading, H1–H6
│       ├── src/routing.tsx  Pages, Page, Link
│       ├── src/theme.tsx    App, Theme; src/styles.ts the stylesheet; src/theming/ the theme engine (React-free)
│       ├── src/behaviors.tsx  LabelBehavior, TooltipBehavior, VariantBehavior (+ behaviors-metadata.ts, React-free)
│       └── src/items.tsx    Items (templates with $item)
├── tools/               repository tooling: package-boundary checker, XMLUI corpus test, sandbox drift test, build-output check, static-server.mjs (E2E)
├── test-apps/
│   ├── smoke/           @patchfuil/smoke-app   E2E fixture: packages load, parser runs in the browser
│   ├── routing/         @patchfuil/routing-app E2E fixture: a dashboard of buttons and links opening routed pages (dev and prerendered build)
│   └── hello/           @patchfuil/hello-app   E2E fixture: the step demos in Main.pfui (+ components/, code-behind), compiled by @patchfuil/vite-plugin, prerendered in builds
├── playground/          @patchfuil/playground  manual testing: a dashboard of 17 scenarios (steps 2–19), one page each with its source, and a live compiler (see playground/README.md)
├── e2e/                 Playwright specs; fixtures/standalone-site (served from .tmp/ by tools/static-server.mjs)
├── .tmp/                (ignored) test work folders: the standalone site copy, the hello app's production build, throwaway apps
├── .ai/                 AI working material: plans (plan/), docs (docs/)
├── README.md            product overview and quick start
├── package.json         workspace root: scripts, pinned dev dependencies
├── tsconfig.base.json   shared TypeScript settings
├── vitest.config.ts     unit-test projects
└── playwright.config.ts E2E configuration
```

## Packages

All packages are private npm workspaces, ES modules (`"type": "module"`), at
version `0.0.0`.

| Package | Role | Entry points (`exports`) | Runs in |
|---------|------|--------------------------|---------|
| `@patchfuil/compiler` | Turns `.pfui` markup and scripts into JS modules. | `.` → `src/index.ts` | Node (build tools, static generation, editor) **and** the browser (standalone mode) |
| `@patchfuil/runtime` | Reactivity, scheduling, theming engine, wrapping API: everything compiled code calls. | `.` → `src/index.ts`; `./server` → `src/server.ts` | Browser; `./server` in Node (static generation) |
| `@patchfuil/components` | Built-in components (own and Mantine-wrapped). | `.` → `src/index.ts`; `./metadata` → `src/metadata.ts` | Browser; Node for server rendering |
| `@patchfuil/standalone` | The one-file engine for standalone mode; built into `dist/pfui.js` (IIFE, global `pfui`). | `.` → `src/index.ts` | Browser |
| `@patchfuil/vite-plugin` | Build-time compilation: the Vite plugin `pfui()`. | `.` → `src/index.ts` | Node (Vite) |

**Current contents:**

| File | Exports |
|------|---------|
| `packages/compiler/src/index.ts` | **Markup:** `parseMarkup`, the markup tree types, `MarkupDiagnostics`, `decodeEntities`, `decodeEntitiesWithOffsets`. **Script:** `parseExpression`, `parseStatements`, `parseInterpolation`, the segment types, `ScriptAst` (namespace of AST types), `ScriptDiagnostics`, `ScriptSourceOptions`. **Code generation:** `compileExpression`, `compileInterpolation`, `compileHandler`, `CompileOptions`, `CompileHandlerOptions`, `CompileResult`, `ScopeNames`, `EmitterOptions`, `CodegenDiagnostics`, and the sandbox tables `ALLOWED_GLOBALS`, `APP_GLOBALS`, `BANNED_GLOBALS`, `BANNED_MEMBERS`, `CONSTRUCTIBLE`, `RESTRICTED_GLOBAL_MEMBERS`. **Modules:** `compileModule`, `CompileModuleOptions`, `CompileModuleResult`, `ModuleDiagnostics`, `analyzeModule`, `ModuleAnalysis`, `UserComponentInfo`, `DEFAULT_SLOT`, `COMPONENT_NAME`, `compileFunction`. **Source maps:** `buildSourceMap`, `encodeMappings`, `decodeMappings`, `encodeVlq`, `decodeVlq`, `originalPositionFor`, `offsetSourceMapLines`, `SourceMap`, `Mapping`. **Shared:** `LineMap`, `Diagnostic`, `formatDiagnostic`, `codeFrame`, `editDistance`, `closestMatch`, `didYouMean`. |
| `packages/runtime/src/index.ts` | **Script:** `loadBinding`, `assertBindingValue`, `Binding`, `BindingError`, `scriptGlobals`, `scriptRuntime`, `BANNED_MEMBERS`, `SandboxError`. **Reactivity:** `signal`, `computed`, `batch`, `startBatch`, `endBatch`, `isBatching`, `watch`, `untracked`, `observerCount`, `ReactivityError`, the signal types, `useSignal`, `useComputed`, `shallowEqual`, `createScope`, `ScopeEntry`, `variable`, `Variable`, `freezeDeep`. **Rendering:** `Bound`, `TextNode`, `useScope`, `VariableDefinition`, `HandlerFactory`, `loadModule` (with `map`/`sourceURL`), `ModuleSourceMap`, `ARRAY_MUTATORS`, `ASYNC_ARRAY_METHODS`, `createAppScope`, `APP_GLOBAL_NAMES`. **Handlers:** `HandlerSlot`, `Invocation`, `HandlerCancelledError`, `HANDLER_POLICIES`, `setDefaultHandlerTimeout`, `currentInvocation`, `delay`, their types. **Component APIs:** `createFileScope`, `useFileScope`, `apiRegistrar`, `useComponentApi`, `API_REFS`, `RegisterApi`. **Visibility and templates:** `When`, `resolveVisibility`, `breakpoint`, `breakpointIndex`, `BREAKPOINTS`, `BREAKPOINT_NAMES`, `TemplateInstance`, `templateRenderer`, their types. **Routing:** `navigate`, `currentLocation`, `currentRouteParams`, `matchRoute`, `findRoute`, `parseLocation`, `hrefFor`, `registerRoutes`, `setRoutingMode`, `routingMode`, `resetRouter`. **Wrapping:** `wrapComponent`, `coerceLiteral`, `WrapConfig` and its parts. **Theme state:** `activeThemeId`, `activeThemeTone`, `setTheme`, `setThemeTone`, `toggleThemeTone`, `setThemeDefaults`, `resetThemeState`. **User components:** `BoundUser`, `useComponent`, `Slot`, `SLOTS`, `DEFAULT_SLOT`, `ComponentInput`, `SlotProps`. **Static generation:** `mountApp`, `MountOptions`, `PRERENDERED_ATTRIBUTE`, `READY_ATTRIBUTE`, `inServerView`, `isServerView`, `currentBreakpoint`, `setServerBreakpoint`, `breakpointFromName`. **Errors:** `reportRuntimeError`, `setErrorReporter`. Also `createElement`, `Fragment`. |
| `packages/components/src/index.ts` | `App`, `Theme`, `Text`, `Heading`, `H1`–`H6`, `Button`, `TextBox`, `Select`, `Checkbox`, `Stack`, `Items`, `Pages`, `Page`, `Link`, the behavior components, `BASE_STYLESHEET`, `MANTINE_STYLESHEET`; re-exports the metadata and the theme engine |
| `packages/components/src/metadata.ts` | `componentMetadata` (seven components, with `themeVars` defaults; props with value types and enums, events, API, templates), `ComponentMetadata`, `PropMetadata`, `EventMetadata`, `PropValueType` |

### Compiler source layout

| Folder | Contents |
|--------|----------|
| `src/source/` | Stage-independent source utilities: `LineMap` (offset ↔ 0-based line and column), the `Diagnostic` shape plus `formatDiagnostic` and `codeFrame`, and source maps. Every compiler stage reports positions and problems through these. |
| `src/markup/` | The markup parser ([markup-parser.md](markup-parser.md)) |
| `src/script/` | The script parser ([script-parser.md](script-parser.md)) |
| `src/codegen/` | Binding compilation and the sandbox tables ([codegen.md](codegen.md)) |
| `src/module/` | Whole documents to modules ([modules.md](modules.md)) |

Positions everywhere in the compiler are **UTF-16 offsets** into the `.pfui`
file, converted to line and column only when needed (diagnostics, and later
source maps). Script inside markup is parsed with its offset in the file
(`offset`, or `offsets` for entity-decoded text), so script nodes point
straight into the markup.

**How the stages connect:** `compileModule` (`src/module/`) drives the
others:

1. `parseMarkup` produces elements, attributes and text.
2. Each attribute value and each text node is entity-decoded with
   `decodeEntitiesWithOffsets`, split by `parseInterpolation`, and compiled
   by `compileInterpolation` against the scope.
3. The results become `createElement` calls, plus `Bound` wrappers and
   hoisted binding objects where there are bindings.

Handlers (`on*` attributes, `<event>` content) go through
`parseStatements` and `compileHandler`. `tools/xmlui-corpus.test.ts` checks
handler parsing across the XMLUI corpus with a heuristic (`on*` and
`method.*` are handlers).

### No build step (yet)

Each package's `exports` points directly at TypeScript source. Vite, Vitest
and `tsc` (with `moduleResolution: "bundler"`) all resolve it through the
workspace symlinks in `node_modules/@patchfuil/`. Vite configs that use
the workspace packages need `--configLoader runner`. Building the packages
themselves (compiled JS plus type declarations, for publishing) is not done
yet: apps compile their `.pfui` files at build time, and Vite bundles the
packages' source.

### Dependency rules

```
compiled app ──► @patchfuil/runtime ◄── @patchfuil/components
                                            │
@patchfuil/compiler ──► @patchfuil/components/metadata (React-free)

delivery (imported by no package):
  @patchfuil/standalone  ──► compiler, runtime, components
  @patchfuil/vite-plugin ──► compiler, components/metadata, vite
```

| Package | May import | Must not import |
|---------|-----------|-----------------|
| compiler | relative files; `@patchfuil/components/metadata` | anything else: React, runtime, components' main entry, Node built-ins (`node:*`), third-party packages |
| runtime | React, relative files | compiler, components (its *tests* may import the compiler, a devDependency) |
| components | runtime, React (later Mantine) | compiler (its *tests* may import the compiler, a devDependency) |
| everything reachable from `components/src/metadata.ts` | relative files only | any bare import (React, Mantine, runtime, …) |
| standalone | compiler, runtime, components, React | (no package imports it) |
| vite-plugin | compiler, `@patchfuil/components/metadata`, `vite`, `node:*`, relative files | React, runtime, components' main entry (no package imports it) |

**Why:** the packages ship in different combinations. Standalone mode
bundles all three; a build-time compiled app ships only runtime plus
components and must contain no compiler (`tools/build-output.test.ts`
checks a real build); Node tooling uses the compiler
without React or a DOM. Built-ins use only the runtime's public API, the same
one extension packages use.

**Enforcement:**

- `tools/boundaries.test.ts` scans every `.ts`/`.tsx` file under
  `packages/` and fails on any violation. It also unit-tests the checker on
  fixtures.
- The compiler's `tsconfig.json` sets `lib: ["ES2023"]` (no DOM), so using
  `document`, `window` and similar is a type error in the compiler.

Adding a third-party dependency to the compiler requires extending the
allowlist in `tools/boundaries.ts`. That's deliberate: it should be a
conscious decision.

## Tooling

| Tool | Version | Configuration |
|------|---------|---------------|
| Node | ≥ 22.12 (`engines`) | |
| npm workspaces | npm 10 | `workspaces: ["packages/*", "test-apps/*", "playground"]` in the root `package.json` |
| TypeScript | 7.0.2 | `tsconfig.base.json` plus one `tsconfig.json` per package or folder |
| Vite | 8.3.8 | `test-apps/*/vite.config.ts` (with `@vitejs/plugin-react`), `packages/standalone/vite.config.ts` |
| Vitest | 5.1.1 | `vitest.config.ts` (tests and benchmarks) |
| Playwright | 1.65.1 | `playwright.config.ts` |
| React / React DOM | 19.3.1 | peer dependencies `^19.2.0` of runtime and components |

All dev dependencies are pinned to exact versions in the root `package.json`.

### TypeScript settings

`tsconfig.base.json` is shared:

- target ES2023, `module: ESNext`, `moduleResolution: bundler`,
  `jsx: react-jsx`
- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`
- `isolatedModules`, `verbatimModuleSyntax` (write `import type` for types),
  `noEmit`, and `types: []` (no ambient globals unless a tsconfig opts in)

| tsconfig | Differs from the base |
|----------|-----------------------|
| `packages/compiler` | `lib: ["ES2023"]` (no DOM); includes `src`, `tests` and `bench` |
| `packages/runtime` | includes `src`, `tests` and `bench` |
| `packages/standalone` | `types: ["node"]`; includes `src`, `tests` and `vite.config.ts` |
| `packages/vite-plugin` | `lib: ["ES2023"]` (no DOM), `types: ["node"]` |
| `packages/components`, `test-apps/smoke` | none (`components/src/css.d.ts` declares `*.css?inline`; `mantine.tsx` references it) |
| `test-apps/hello` | `types: ["node"]` (for its `vite.config.ts`) |
| `tools` | `lib: ["ES2023"]`, `types: ["node"]` |
| `e2e` | `types: ["node"]`; also covers `playwright.config.ts` |

## Commands

Run from the repository root.

| Command | Does |
|---------|------|
| `npm install` | Installs everything and links the workspace packages (`packages/*`, `test-apps/*`, `playground`) |
| `npm test` | All unit tests (Vitest, every project) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright; starts a server per fixture: `test-apps/smoke` (Vite, 5173), `test-apps/hello` (Vite dev, 5174), the standalone site (builds `pfui.js`, then `tools/static-server.mjs`, 5175), the hello app's production build (`vite build` into `.tmp/hello-dist`, then `vite preview` with a strict CSP, 5176) |
| `npm run playground` | The manual-testing playground on the Vite dev server, port 5190 (`playground:build`, and `playground:preview` on 5191, for the prerendered build) |
| `npm run build:standalone` | Builds `packages/standalone/dist/pfui.js` (also run by the E2E web server) |
| `npm run bench` | Benchmarks (`vitest bench --run --reporter=verbose`); not part of `check` |
| `npm run typecheck` | `tsc -p` for each package and folder, each with its own settings |
| `npm run check` | typecheck, then unit tests, then E2E. Must pass before a step is done. |

One-time machine setup for E2E: `npx playwright install chromium`.

## Tests

### Unit tests (Vitest)

`vitest.config.ts` defines one project per package:

| Project | Root | Environment | Files |
|---------|------|-------------|-------|
| `compiler` | `packages/compiler` | `node` (no DOM, matching the compiler's constraint) | `tests/**/*.test.ts`; benchmarks: `bench/**/*.bench.ts` |
| `runtime` | `packages/runtime` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}`; benchmarks: `bench/**/*.bench.{ts,tsx}` |
| `components` | `packages/components` | `jsdom`, React plugin, `tests/jsdom-setup.ts` (Mantine stubs; standalone loads it too) | `tests/**/*.test.{ts,tsx}` |
| `standalone` | `packages/standalone` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}` |
| `vite-plugin` | `packages/vite-plugin` | `node` | `tests/**/*.test.ts` |
| `tools` | `tools` | `node` | `**/*.test.ts` |

Test files run **isolated** (`isolate: true`, set explicitly in
`vitest.config.ts`): one fresh worker per file. `--no-isolate` gave no
measurable wall-clock gain (files already run in parallel), and isolation
keeps module state and the jsdom DOM from leaking between files.

Conventions:

- Tests live in each package's `tests/` folder and import from `../src/…`.
- Import test functions explicitly (`import { test, expect } from "vitest"`);
  there are no globals.
- React tests use `@testing-library/react` (`render`, `screen`). Without
  Vitest globals its automatic cleanup is not registered: call
  `afterEach(cleanup)` in files that render more than once.
- Behavior that defines the language goes into data-driven conformance
  tables (`test.each`), which act as the written spec.
- Compiler tests mirror `src/` (`tests/markup/`, `tests/source/`). Shared
  test helpers live next to the tests that use them (for example
  `tests/markup/helpers.ts`).
- Positions are asserted through the source text they cover
  (`markup.slice(start, end)`), not raw numbers, so tables stay readable.

| Test file | Covers |
|-----------|--------|
| `packages/compiler/tests/markup/*.test.ts` | The markup parser: valid markup, positions, diagnostics, recovery, entities (see [markup-parser.md](markup-parser.md#tests)) |
| `packages/compiler/tests/script/*.test.ts` | The script parser: expressions, statements and ASI, diagnostics and recovery, positions, interpolation (see [script-parser.md](script-parser.md#tests)) |
| `packages/compiler/tests/codegen/*.test.ts` | Code generation: emitted code, diagnostics, dependencies, interpolation (see [codegen.md](codegen.md#tests)) |
| `packages/compiler/tests/source/line-map.test.ts` | `LineMap`, `formatDiagnostic` and `codeFrame` |
| `packages/runtime/tests/smoke.test.tsx` | Package loads; React 19 renders in jsdom |
| `packages/runtime/tests/reactivity/*` | The signal store, the React integration (StrictMode, unmounting, server rendering, tearing) and the scenario that compares signals with plain React state (see [reactivity.md](reactivity.md#tests)) |
| `packages/runtime/tests/script/*.test.ts` | Compiled bindings run in the sandbox: semantics table, equivalence with native JavaScript, escape attempts (see [codegen.md](codegen.md#tests)) |
| `packages/components/tests/smoke.test.ts` | Package loads; every component has metadata; the metadata entry point loads on its own |
| `packages/components/tests/first-app.test.tsx` | Markup → `compileModule` → `loadModule` → DOM (see [modules.md](modules.md#tests)) |
| `packages/compiler/tests/module/*.test.ts` | `compileModule` (see [modules.md](modules.md#tests)) |
| `packages/runtime/tests/render/*.test.tsx` | `Bound`, `TextNode`, `loadModule`; the server view and `mountApp` (`server-view.test.tsx`, see [ssg.md](ssg.md#tests)) |
| `packages/runtime/tests/render/router.test.ts`, `packages/components/tests/routing.test.tsx` | The router; Pages, Page, Link (see [routing.md](routing.md#tests)) |
| `packages/runtime/tests/render/wrap.test.tsx`, `packages/components/tests/mantine.test.tsx`, `text-heading.test.tsx` | `wrapComponent`; the Mantine components; Text and Heading (see [mantine.md](mantine.md#tests)) |
| `packages/compiler/tests/module/behaviors.test.ts`, `packages/components/tests/behaviors.test.tsx` | Behaviors: attachment, order, generated code; rendering (see [behaviors.md](behaviors.md#tests)) |
| `packages/components/tests/theming.test.ts`, `theme-components.test.tsx` | The theme engine tables; `App`/`Theme` and the globals (see [theming.md](theming.md#tests)) |
| `packages/components/tests/user-components.test.tsx` | User-defined components, one test per feature (see [user-components.md](user-components.md#tests)) |
| `packages/compiler/tests/module/contracts.test.ts` | The contract diagnostics table (see [contracts.md](contracts.md#tests)) |
| `packages/compiler/tests/module/user-components.test.ts` | Analysis, file forms, slots, isolation, code-behind diagnostics and code (see [user-components.md](user-components.md#tests)) |
| `packages/vite-plugin/tests/components.test.ts` | Component discovery and code-behind in the plugin |
| `packages/components/tests/ssg.test.tsx` | Compile, render statically, take over (see [ssg.md](ssg.md#tests)) |
| `tools/boundaries.test.ts` | Import extraction, relative-import closure, every boundary rule (positive and negative), the real repo has no violations |
| `tools/xmlui-corpus.test.ts` | Compatibility with the XMLUI repo (`$XMLUI_REPO` or the sibling folder `../xmlui`; skipped if absent). Every `.xmlui` file parses as markup, all script inside each file parses, and every `.xs` code-behind file parses, all with zero diagnostics. Every binding compiles to valid JavaScript; its expected findings (host functions) are listed in `EXPECTED_BINDING_DIAGNOSTICS`. Deliberate exclusions are listed, with reasons, in `EXCLUDED`. |
| `tools/sandbox-drift.test.ts` | The compiler's sandbox tables agree with the runtime's globals object |
| `tools/build-output.test.ts` | A real production build of `test-apps/hello` contains no compiler module and no eval, drops the standalone loader and the server renderer, maps back to `Main.pfui` with `build.sourcemap`, and has the app prerendered in `index.html`; prerender failures fail the build (see [build-time.md](build-time.md#tests), [ssg.md](ssg.md#tests)) |
| `packages/vite-plugin/tests/plugin.test.ts` | The plugin's hooks: ids, output, source-map modes, errors (see [build-time.md](build-time.md#tests)) |
| `packages/vite-plugin/tests/prerender.test.ts` | Prerender options, HTML injection, when the hook runs (see [ssg.md](ssg.md#tests)) |

Count after IDs in templates and extensions: 1,965 unit tests in 67 files.

- Compiler: 965, of which markup 115, script 331, codegen 207, module 286
  (user components 57, contracts 74, behaviors 19) and source 26.
- Runtime: 404, of which the script sandbox and async arrays are 210,
  reactivity 65, rendering 127 (the server view and `mountApp` 12,
  `wrapComponent` 19, the router 27), and the smoke test 2.
- Standalone: 25 (the cache 10, the loader 14, the hash 1).
- Vite plugin: 55 (the transform 27, the prerender 18, components 10).
- Tools: 371, of which the corpus is 327, the boundaries 29, the build
  output 10 and the sandbox drift test 5.
- Components: 145 (static generation 8, user components 11, the theme
  engine 29, theme components 5, behaviors 7, Mantine 6, Text and Heading
  21, routing 7).

### Benchmarks (Vitest 5)

- Files: `packages/<pkg>/bench/*.bench.ts(x)`, selected by the project's
  `benchmark.include`. Only `npm run bench` runs them.
- Vitest 5 API: a benchmark is a test that uses the `bench` fixture:
  `test("…", async ({ bench }) => { await bench("name", fn).run(); })`.
  There is no top-level `bench` export.
- `suppressExportGetterWarnings` is on: Vitest's dev module runner adds
  roughly 15–20% overhead through export getters, which bundled production
  code doesn't have, so the results are slightly pessimistic (rationale in
  `vitest.config.ts`).

| Benchmark | Measures |
|-----------|----------|
| `packages/compiler/bench/markup.bench.ts` | `parseMarkup` on generated realistic markup: 10 KiB, 100 KiB, 1 MiB (about 120 MB/s) |
| `packages/runtime/bench/reactivity.bench.tsx` | 1,000 rows, one or all updated: signals 0.15 ms / 2.3 ms; React state 2.3 ms / 2.6 ms; with memo 1.2 ms / 2.7 ms |
| `packages/compiler/bench/codegen.bench.ts` | Compiling typical bindings (about 0.45 µs each); compiled against hand-written evaluation (within about 10–15%); `compileModule` with a source map (about 38 µs for a small module) and without (26 µs) |
| `packages/compiler/bench/script.bench.ts` | `parseInterpolation` on typical bindings (about 2 µs each), `parseStatements` on a 15-line handler (about 15 µs) |

### E2E tests (Playwright)

- Specs live in `e2e/*.spec.ts`; the browser is Chromium.
- **Projects** pick specs by file and set `baseURL`:
  - `smoke` (5173);
  - `hello-dev` (5174: the hello specs `first-app`, `variables`,
    `async-handlers`, `ids`, `conditionals-templates`, `user-components`,
    `theming`, `behaviors` and `mantine`, plus `source-maps`);
  - `hello-build` (5176: the same hello specs plus `build` and `ssg`,
    against the prerendered production build under `script-src 'self'`);
  - `standalone` (5175, full URLs);
  - `routing-dev` (5177) and `routing-build` (5178): `routing.spec.ts`
    against `test-apps/routing`;
  - `playground` (5180): `playground.spec.ts` (every scenario opens without
    errors and shows its source) and `playground-scenarios.spec.ts` (each
    scenario does what its page says).
- `webServer` starts one server per fixture (reused locally if already
  running). `test-apps/hello` runs with `--configLoader runner` (see
  [build-time.md](build-time.md#using-it)). CI settings (retries,
  `forbidOnly`, the GitHub reporter) switch on when `CI` is set.
- Fixture apps live in `test-apps/<name>/`, each a workspace package with
  `index.html`, `src/main.tsx` and `vite.config.ts`.

| Spec | Covers |
|------|--------|
| `e2e/smoke.spec.ts` | The smoke app loads all three packages and **runs the markup parser in a real browser** (it renders a parse summary), with no page or console errors |
| `e2e/playground-scenarios.spec.ts` | Each playground scenario's key interactions (one test per scenario page) |
| `e2e/playground.spec.ts` | The playground's dashboard lists its scenarios; each opens, shows its source (monospace, line breaks and indentation), has no page or console errors, and leads back |
| `e2e/routing.spec.ts` | Routing in the routing fixture, dev and build (projects `routing-dev`, `routing-build`) |
| `e2e/mantine.spec.ts` | Mantine TextInput, Select, Checkbox and Button round-trips and theming; text variants and headings (dev and build) |
| `e2e/behaviors.spec.ts` | A tooltip on hover, a labeled input, a variant color (dev and build) |
| `e2e/theming.spec.ts` | Computed styles follow theme variables, a scoped `Theme`, and the tone switch (dev and build) |
| `e2e/user-components.spec.ts` | The XMLUI user-defined-components examples (component files, code-behind, an inline component; `$props`, events, methods, slots), in dev and in the prerendered build |
| `e2e/ssg.spec.ts` | Static generation: the content with JavaScript disabled; takeover at the prerendered breakpoint changes no DOM node; at desktop width only the responsive text switches; the app is live afterwards |
| `e2e/build.spec.ts` | The production build under a strict CSP: no violations (with a page-level eval as the control that the policy is enforced), no `.pfui` fetched |
| `e2e/standalone.spec.ts` | Standalone mode against the built `pfui.js`: compile on first load, cache on reload, live edit, error overlay and recovery; a component file with code-behind, and editing it (serial: the tests edit the served files) |
| `e2e/conditionals-templates.spec.ts` | Responsive `when` at three viewport sizes; `Items` add and remove |
| `e2e/source-maps.spec.ts` | Through CDP: a handler's exception resolves to its `throw` line in `Main.pfui` |
| `e2e/ids.spec.ts` | Reading and writing another component through its id |
| `e2e/async-handlers.spec.ts` | A slow handler's progress, responsiveness while waiting, double-click under each handler policy |
| `e2e/variables.spec.ts` | Counter and source/mirror (follow until assigned) in the hello app, with real clicks |
| `e2e/first-app.spec.ts` | **The first compiled app**: `test-apps/hello/src/Main.pfui`, compiled by `@patchfuil/vite-plugin`, renders the expected texts and buttons, lays out a horizontal `Stack` in a row, with no errors |

## Conventions

- **Naming:** the product is **patchfuil**, short name **pfui**. The npm
  scope is `@patchfuil/*` and markup files are `.pfui`. "XMLUI" refers only
  to the original framework (the reference implementation, compatibility
  tests and research notes). See *Decisions* in `AGENTS.md`.

- **Branches:** each proof-of-concept step is developed on `poc/NN-topic`,
  reviewed by the user, then merged.
- **Commits:** only when the user asks.
- **Placeholders:** the `*Info` exports existed only to prove the wiring.
  All are gone: `compilerInfo` was removed in step 1, `runtimeInfo` and
  `componentsInfo` in step 5.
- **Documentation:** every step ends by updating this file (see
  [README.md](README.md)).
