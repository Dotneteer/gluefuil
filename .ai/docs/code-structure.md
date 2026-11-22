# Code structure

> **Cornerstone document.** Describes the repository as it is now. It is
> updated at the end of every proof-of-concept step.
>
> **Last updated:** step 0 (workspace and test harness).

## What this repository is

A re-invention of the XMLUI framework: XML markup plus a JavaScript subset,
**compiled** to JavaScript that renders with React (and Mantine for most
components). The design rationale is in
[`../plan/architecture.md`](../plan/architecture.md); the build order is in
[`../plan/poc-steps.md`](../plan/poc-steps.md).

Current state: the workspace, the three framework packages (placeholders) and
the test infrastructure exist. There is no framework functionality yet.

## Repository layout

```
.
├── packages/
│   ├── compiler/        @patchfuil/compiler    markup + script compiler
│   ├── runtime/         @patchfuil/runtime     what compiled code calls into
│   └── components/      @patchfuil/components  built-in components (+ React-free metadata)
├── tools/               repository tooling (package-boundary checker)
├── test-apps/
│   └── smoke/           @patchfuil/smoke-app   E2E fixture app
├── e2e/                 Playwright specs
├── .ai/                 AI working material: plans (plan/), docs (docs/)
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
| `@patchfuil/compiler` | Turns `.xmlui` markup and scripts into JS modules. | `.` → `src/index.ts` | Node (build tools, static generation, editor) **and** the browser (standalone mode) |
| `@patchfuil/runtime` | Reactivity, scheduling, theming engine, wrapping API: everything compiled code calls. | `.` → `src/index.ts` | Browser; Node for server rendering |
| `@patchfuil/components` | Built-in components (own and Mantine-wrapped). | `.` → `src/index.ts`; `./metadata` → `src/metadata.ts` | Browser; Node for server rendering |

**Current contents** (placeholders proving the wiring):

| File | Exports |
|------|---------|
| `packages/compiler/src/index.ts` | `compilerInfo` (`{ name }`) |
| `packages/runtime/src/index.ts` | `runtimeInfo` (`{ name }`) |
| `packages/components/src/index.ts` | `componentsInfo` (`{ name, runtime }`), re-exports `componentMetadata` |
| `packages/components/src/metadata.ts` | `componentMetadata` (empty object) |

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
| runtime | React, relative files | compiler, components |
| components | runtime, React (later Mantine) | compiler |
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
| Vitest | 5.1.1 | `vitest.config.ts` |
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
| `packages/compiler` | `lib: ["ES2023"]` (no DOM) |
| `packages/runtime`, `packages/components`, `test-apps/smoke` | none |
| `tools` | `lib: ["ES2023"]`, `types: ["node"]` |
| `e2e` | `types: ["node"]`; also covers `playwright.config.ts` |

## Commands

Run from the repository root.

| Command | Does |
|---------|------|
| `npm install` | Installs everything and links the workspace packages |
| `npm test` | All unit tests (Vitest, every project) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright; starts the Vite dev server for `test-apps/smoke` on port 5173 |
| `npm run typecheck` | `tsc -p` for each package and folder, each with its own settings |
| `npm run check` | typecheck, then unit tests, then E2E. Must pass before a step is done. |

One-time machine setup for E2E: `npx playwright install chromium`.

## Tests

### Unit tests (Vitest)

`vitest.config.ts` defines one project per package:

| Project | Root | Environment | Files |
|---------|------|-------------|-------|
| `compiler` | `packages/compiler` | `node` (no DOM, matching the compiler's constraint) | `tests/**/*.test.ts` |
| `runtime` | `packages/runtime` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}` |
| `components` | `packages/components` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}` |
| `tools` | `tools` | `node` | `**/*.test.ts` |

Conventions:

- Tests live in each package's `tests/` folder and import from `../src/…`.
- Import test functions explicitly (`import { test, expect } from "vitest"`);
  there are no globals.
- React tests use `@testing-library/react` (`render`, `screen`).
- Behavior that defines the language goes into data-driven conformance
  tables (`test.each`), which act as the written spec.

| Test file | Covers |
|-----------|--------|
| `packages/compiler/tests/smoke.test.ts` | Package loads; no `document` in its environment |
| `packages/runtime/tests/smoke.test.tsx` | Package loads; React 19 renders in jsdom |
| `packages/components/tests/smoke.test.ts` | Package loads and resolves the runtime; the metadata entry point loads on its own |
| `tools/boundaries.test.ts` | Import extraction, relative-import closure, every boundary rule (positive and negative), the real repo has no violations |

### E2E tests (Playwright)

- Specs live in `e2e/*.spec.ts`; there is one browser project, Chromium.
- `webServer` runs Vite with `test-apps/smoke/vite.config.ts` and is reused
  locally if already running. CI settings (retries, `forbidOnly`, the GitHub
  reporter) switch on when `CI` is set.
- Fixture apps live in `test-apps/<name>/`, each a workspace package with
  `index.html`, `src/main.tsx` and `vite.config.ts`.

| Spec | Covers |
|------|--------|
| `e2e/smoke.spec.ts` | The smoke app renders the names of all three packages in a real browser, with no page or console errors |

## Conventions

- **Branches:** each proof-of-concept step is developed on `poc/NN-topic`,
  reviewed by the user, then merged.
- **Commits:** only when the user asks.
- **Placeholders:** the `*Info` exports exist only to prove the wiring. They
  are removed once a package has real exports.
- **Documentation:** every step ends by updating this file (see
  [README.md](README.md)).
