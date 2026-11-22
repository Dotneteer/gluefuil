# AGENTS.md — patchfuil

Read this first for any task in this repository. It is the single source of
truth for AI agents; `CLAUDE.md` only imports it.

## What this project is

**patchfuil** (short name **pfui**) is a **re-invention of the XMLUI
framework**: a declarative, reactive UI framework where applications are
written as XML markup (`.pfui` files, using XMLUI's markup syntax), with
spreadsheet-like reactive expressions in `{...}` and no manual state wiring.

We are not forking XMLUI. We learn from its design, its documented behavior and
its mistakes, then build a fresh implementation. Where we deliberately diverge
from XMLUI, record the decision and the reason (see *Decisions* below).

## Status

Early proof-of-concept phase. The framework is being built step by step
following [.ai/plan/poc-steps.md](.ai/plan/poc-steps.md). **Stop after each
step so the user can review it.** Each step is developed on its own branch
(`poc/NN-topic`).

Only what is recorded under *Decisions* is chosen. Do not assume anything
else (for example the signals library) until it is recorded here or in an
accepted plan; propose options in a plan instead of picking silently.

**Read [.ai/docs/code-structure.md](.ai/docs/code-structure.md) before
changing code.** It is the cornerstone development document and describes the
code as it is. Every step ends by updating it in the same change as the code.

## Essentials

The full description (layout, packages, dependency rules, tooling, tests,
conventions) is in [.ai/docs/code-structure.md](.ai/docs/code-structure.md).
The short version:

- Packages: `packages/compiler` (no React, no DOM), `packages/runtime`,
  `packages/components` (`./metadata` is React-free). Package boundaries are
  enforced by `tools/boundaries.test.ts`.
- `npm run check` runs the typecheck, the unit tests (Vitest) and the E2E
  tests (Playwright); it must pass before a step is done. `npm run bench`
  runs the benchmarks.
- Subsystems have their own documents in `.ai/docs/` (for example
  `markup-parser.md`), linked from `code-structure.md`.
- Every step adds unit tests; E2E tests are added when a claim can only be
  proven in a real browser. Language behavior goes into data-driven
  conformance tables (`test.each`).

## The reference implementation (read-only)

The original XMLUI lives at `/Users/dotneteer/source/xmlui`.
**Never modify anything there.** Read it freely.

Where to look, in order of usefulness:

| Need | Location (relative to the xmlui repo) |
|------|----------------------------------------|
| What XMLUI *is* from an app developer's view | `.ai/xmlui/overview.md`, `website/content/docs/pages/intro.md`, `markup.md`, `reactive-intro.md` |
| User-facing concepts (markup, scripting, scoping, forms, routing, themes, …) | `website/content/docs/pages/*.md` |
| Concrete, working usage patterns (~220 guides) | `website/content/docs/pages/howto/*.md` |
| Per-component API (props, events, methods, theme vars) | `website/content/docs/reference/components/*.md` |
| Step-by-step tutorial app | `website/content/docs/pages/tutorial-01.md` … `tutorial-12.md` |
| Internals, condensed for AI | `.ai/xmlui/*.md` (start with `mental-model.md`, `rendering-pipeline.md`, `container-state.md`, `expression-eval.md`) |
| Internals, long-form | `xmlui/dev-docs/guide/01-*.md` … (index: `xmlui/dev-docs/guide/index.md`) |
| Actual source | `xmlui/src/` (`components/`, `components-core/`, `parsers/`) |
| Repo-wide agent notes | `AGENTS.md` at the xmlui repo root |

The docs describe **intended behavior**; the source is the ground truth for
**actual behavior**. When they disagree, note it — it is often a spec question
for us to decide.

The XMLUI MCP server (`xmlui_search`, `xmlui_component_docs`,
`xmlui_search_howto`, …) indexes the same material and is a faster way to
search it when connected.

When you cite XMLUI behavior in a plan or discussion, give the file path you
got it from. Don't describe XMLUI from memory.

## The `.ai/` folder

All AI-oriented material for this project lives under `.ai/`. See
[`.ai/README.md`](.ai/README.md) for the layout and its conventions.

- **Plans** go in [`.ai/plan/`](.ai/plan/) and follow
  [`.ai/plan/README.md`](.ai/plan/README.md). When asked to create or record a
  plan, put it there unless the user names another location.

## Decisions

Architectural decisions (stack, divergences from XMLUI, naming) are recorded
here as one line each, with a link to the plan that justified them:

- **Rendering target is React.** Existing React components must be wrappable with lightweight code and usable directly from markup. See [.ai/plan/architecture.md](.ai/plan/architecture.md) § Area 1.
- **Naming.** The project and product are **patchfuil**, short name **pfui**; XMLUI is only the origin and reference.
  - The npm scope is `@patchfuil/*`.
  - Markup files use `.pfui` (`Main.pfui`, `components/Name.pfui`).
  - The short name `pfui` is used for the CSS custom-property prefix (`--pfui-*`), the standalone browser global, the CLI command and the docs code-fence language.
  - In prose, say "XMLUI" only when referring to the original framework.
- **Toolchain:** TypeScript 7, npm workspaces, Vite 8, Vitest 5 (jsdom for React packages), Playwright, React 19. Packages: `compiler`, `runtime`, `components` (see [.ai/docs/code-structure.md](.ai/docs/code-structure.md)). See [.ai/plan/poc-steps.md](.ai/plan/poc-steps.md) step 0.
- **Base component library is Mantine.** Its styling is exposed only through XMLUI-style theme variables; Mantine's own theme API is an internal detail. See [.ai/plan/architecture.md](.ai/plan/architecture.md) § "Notes for area 5".

## Working agreements

- Commit only when asked. Don't commit to `master` without being asked; use a branch for larger work.
- Keep this file short. Detail belongs in `.ai/`; link to it from here.
- When you learn something that would change how a future agent works in this
  repo, update this file or the right `.ai/` document instead of saving private memory.
