# Code structure

> **Cornerstone document.** Describes the repository as it is now. It is
> updated at the end of every proof-of-concept step.
>
> **Last updated:** step 7 (async handlers).

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

## Subsystem documents

| Document | Subsystem |
|----------|-----------|
| [markup-parser.md](markup-parser.md) | `packages/compiler/src/markup/` and `src/source/`: `.pfui` markup text to a syntax tree with positions and diagnostics |
| [script-parser.md](script-parser.md) | `packages/compiler/src/script/`: pfui script (a JavaScript subset) to an ESTree-subset tree with file offsets; interpolated values |
| [reactivity.md](reactivity.md) | `packages/runtime/src/reactivity/`: signals, computed values, batching, the React hooks, the scope object |
| [modules.md](modules.md) | `packages/compiler/src/module/`, `packages/runtime/src/render/`, the built-in components: `.pfui` document to a JavaScript module, and how it renders |
| [async-handlers.md](async-handlers.md) | Handlers at runtime: implicit await, segments (batching across `await`), the watchdog, `$cancel`, policies, timeouts, async-aware array methods, app globals |
| [codegen.md](codegen.md) | `packages/compiler/src/codegen/` and `packages/runtime/src/script/`: bindings compiled to JavaScript, static name resolution, the sandbox, dependencies |

## Repository layout

```
.
├── packages/
│   ├── compiler/        @patchfuil/compiler    markup + script compiler
│   │   ├── src/source/      positions (LineMap) and diagnostics, shared by all stages
│   │   ├── src/markup/      markup parser: text -> syntax tree
│   │   ├── src/script/      script parser: expressions, statements, interpolation
│   │   ├── src/codegen/     bindings -> JavaScript; name resolution and the sandbox
│   │   ├── src/module/      .pfui document -> JavaScript module
│   │   ├── tests/           unit tests (mirrors src/)
│   │   └── bench/           benchmarks (npm run bench)
│   ├── runtime/         @patchfuil/runtime     what compiled code calls into
│   │   ├── src/script/      sandbox globals and helpers; loadBinding
│   │   ├── src/reactivity/  signal store, React hooks, scope object
│   │   ├── src/render/      what compiled modules render with (Bound, TextNode, useScope, loadModule), handler runtime, app globals
│   │   ├── src/errors.ts    the runtime error reporter
│   │   └── bench/           benchmarks (npm run bench)
│   └── components/      @patchfuil/components  built-in components (+ React-free metadata)
│       └── src/basic.tsx    App, Text, Button, Stack (minimal; Mantine in step 16)
├── tools/               repository tooling: package-boundary checker, XMLUI corpus test, sandbox drift test
├── test-apps/
│   ├── smoke/           @patchfuil/smoke-app   E2E fixture: packages load, parser runs in the browser
│   └── hello/           @patchfuil/hello-app   E2E fixture: the first compiled app (Main.pfui + minimal Vite plugin)
├── e2e/                 Playwright specs
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
| `@patchfuil/runtime` | Reactivity, scheduling, theming engine, wrapping API: everything compiled code calls. | `.` → `src/index.ts` | Browser; Node for server rendering |
| `@patchfuil/components` | Built-in components (own and Mantine-wrapped). | `.` → `src/index.ts`; `./metadata` → `src/metadata.ts` | Browser; Node for server rendering |

**Current contents:**

| File | Exports |
|------|---------|
| `packages/compiler/src/index.ts` | **Markup:** `parseMarkup`, the markup tree types, `MarkupDiagnostics`, `decodeEntities`, `decodeEntitiesWithOffsets`. **Script:** `parseExpression`, `parseStatements`, `parseInterpolation`, the segment types, `ScriptAst` (namespace of AST types), `ScriptDiagnostics`, `ScriptSourceOptions`. **Code generation:** `compileExpression`, `compileInterpolation`, `compileHandler`, `CompileOptions`, `CompileHandlerOptions`, `CompileResult`, `ScopeNames`, `EmitterOptions`, `CodegenDiagnostics`, and the sandbox tables `ALLOWED_GLOBALS`, `APP_GLOBALS`, `BANNED_GLOBALS`, `BANNED_MEMBERS`, `CONSTRUCTIBLE`, `RESTRICTED_GLOBAL_MEMBERS`. **Modules:** `compileModule`, `CompileModuleOptions`, `CompileModuleResult`, `ModuleDiagnostics`. **Shared:** `LineMap`, `Diagnostic`, `formatDiagnostic`. |
| `packages/runtime/src/index.ts` | **Script:** `loadBinding`, `assertBindingValue`, `Binding`, `BindingError`, `scriptGlobals`, `scriptRuntime`, `BANNED_MEMBERS`, `SandboxError`. **Reactivity:** `signal`, `computed`, `batch`, `startBatch`, `endBatch`, `isBatching`, `watch`, `untracked`, `observerCount`, `ReactivityError`, the signal types, `useSignal`, `useComputed`, `shallowEqual`, `createScope`, `ScopeEntry`, `variable`, `Variable`, `freezeDeep`. **Rendering:** `Bound`, `TextNode`, `useScope`, `VariableDefinition`, `HandlerFactory`, `loadModule`, `ARRAY_MUTATORS`, `ASYNC_ARRAY_METHODS`, `createAppScope`, `APP_GLOBAL_NAMES`. **Handlers:** `HandlerSlot`, `Invocation`, `HandlerCancelledError`, `HANDLER_POLICIES`, `setDefaultHandlerTimeout`, `currentInvocation`, `delay`, their types. **Errors:** `reportRuntimeError`, `setErrorReporter`. Also `createElement`, `Fragment`. |
| `packages/components/src/index.ts` | `App`, `Text`, `Button`, `Stack`; re-exports the metadata |
| `packages/components/src/metadata.ts` | `componentMetadata` (the four components and their props), `ComponentMetadata` |

### Compiler source layout

| Folder | Contents |
|--------|----------|
| `src/source/` | Stage-independent source utilities: `LineMap` (offset ↔ 0-based line and column) and the `Diagnostic` shape plus `formatDiagnostic`. Every compiler stage reports positions and problems through these. |
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
workspace symlinks in `node_modules/@patchfuil/`. A real build (compiled JS
plus type declarations) arrives with build-time compilation (step 12).

### Dependency rules

```
compiled app ──► @patchfuil/runtime ◄── @patchfuil/components
                                            │
@patchfuil/compiler ──► @patchfuil/components/metadata (React-free)
```

| Package | May import | Must not import |
|---------|-----------|-----------------|
| compiler | relative files; `@patchfuil/components/metadata` | anything else: React, runtime, components' main entry, Node built-ins (`node:*`), third-party packages |
| runtime | React, relative files | compiler, components (its *tests* may import the compiler, a devDependency) |
| components | runtime, React (later Mantine) | compiler (its *tests* may import the compiler, a devDependency) |
| everything reachable from `components/src/metadata.ts` | relative files only | any bare import (React, Mantine, runtime, …) |

**Why:** the packages ship in different combinations. Standalone mode
bundles all three; a build-time compiled app ships only runtime plus
components and must contain no compiler; Node tooling uses the compiler
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
| npm workspaces | npm 10 | `workspaces: ["packages/*", "test-apps/*"]` in the root `package.json` |
| TypeScript | 7.0.2 | `tsconfig.base.json` plus one `tsconfig.json` per package or folder |
| Vite | 8.3.8 | `test-apps/smoke/vite.config.ts` (with `@vitejs/plugin-react`) |
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
| `packages/components`, `test-apps/smoke` | none |
| `test-apps/hello` | `types: ["node"]` (its `vite.config.ts` holds the plugin) |
| `tools` | `lib: ["ES2023"]`, `types: ["node"]` |
| `e2e` | `types: ["node"]`; also covers `playwright.config.ts` |

## Commands

Run from the repository root.

| Command | Does |
|---------|------|
| `npm install` | Installs everything and links the workspace packages |
| `npm test` | All unit tests (Vitest, every project) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright; starts a Vite dev server per fixture app: `test-apps/smoke` on port 5173, `test-apps/hello` on 5174 |
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
| `components` | `packages/components` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}` |
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
| `packages/compiler/tests/source/line-map.test.ts` | `LineMap` and `formatDiagnostic` |
| `packages/runtime/tests/smoke.test.tsx` | Package loads; React 19 renders in jsdom |
| `packages/runtime/tests/reactivity/*` | The signal store, the React integration (StrictMode, unmounting, server rendering, tearing) and the scenario that compares signals with plain React state (see [reactivity.md](reactivity.md#tests)) |
| `packages/runtime/tests/script/*.test.ts` | Compiled bindings run in the sandbox: semantics table, equivalence with native JavaScript, escape attempts (see [codegen.md](codegen.md#tests)) |
| `packages/components/tests/smoke.test.ts` | Package loads; every component has metadata; the metadata entry point loads on its own |
| `packages/components/tests/first-app.test.tsx` | Markup → `compileModule` → `loadModule` → DOM (see [modules.md](modules.md#tests)) |
| `packages/compiler/tests/module/*.test.ts` | `compileModule` (see [modules.md](modules.md#tests)) |
| `packages/runtime/tests/render/*.test.tsx` | `Bound`, `TextNode`, `loadModule` |
| `tools/boundaries.test.ts` | Import extraction, relative-import closure, every boundary rule (positive and negative), the real repo has no violations |
| `tools/xmlui-corpus.test.ts` | Compatibility with the XMLUI repo (`$XMLUI_REPO` or the sibling folder `../xmlui`; skipped if absent). Every `.xmlui` file parses as markup, all script inside each file parses, and every `.xs` code-behind file parses, all with zero diagnostics. Every binding compiles to valid JavaScript; its expected findings (host functions) are listed in `EXPECTED_BINDING_DIAGNOSTICS`. Deliberate exclusions are listed, with reasons, in `EXCLUDED`. |
| `tools/sandbox-drift.test.ts` | The compiler's sandbox tables agree with the runtime's globals object |

Count after step 7: 1,420 unit tests in 37 files.

- Compiler: 721, of which markup 115, script 331, codegen 200, module 67
  and source 8.
- Runtime: 307, of which the script sandbox and async arrays are 210,
  reactivity 65, rendering and handlers 30, and the smoke test 2.
- Tools: 355, of which the corpus is 327, the boundaries 23 and the
  sandbox drift test 5.
- Components: 37, of which async handlers are 9, variables and handlers
  12, the first app 14 and the smoke test 2.

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
| `packages/compiler/bench/codegen.bench.ts` | Compiling typical bindings (about 0.3 µs each); compiled against hand-written evaluation (within about 10–15%) |
| `packages/compiler/bench/script.bench.ts` | `parseInterpolation` on typical bindings (about 2 µs each), `parseStatements` on a 15-line handler (about 15 µs) |

### E2E tests (Playwright)

- Specs live in `e2e/*.spec.ts`; there is one browser project, Chromium.
- `webServer` starts one Vite dev server per fixture app (reused locally if
  already running). `baseURL` is the smoke app; specs for other apps use
  full URLs. `test-apps/hello` runs with `--configLoader runner` (see
  [modules.md](modules.md#build-time-integration-fixture-only)). CI settings (retries, `forbidOnly`, the GitHub
  reporter) switch on when `CI` is set.
- Fixture apps live in `test-apps/<name>/`, each a workspace package with
  `index.html`, `src/main.tsx` and `vite.config.ts`.

| Spec | Covers |
|------|--------|
| `e2e/smoke.spec.ts` | The smoke app loads all three packages and **runs the markup parser in a real browser** (it renders a parse summary), with no page or console errors |
| `e2e/async-handlers.spec.ts` | A slow handler's progress, responsiveness while waiting, double-click under each handler policy |
| `e2e/variables.spec.ts` | Counter and source/mirror (follow until assigned) in the hello app, with real clicks |
| `e2e/first-app.spec.ts` | **The first compiled app**: `test-apps/hello/src/Main.pfui`, compiled by the fixture's Vite plugin, renders the expected texts and buttons, lays out a horizontal `Stack` in a row, with no errors |

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
