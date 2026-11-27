# AGENTS.md — gluefuil

Read this first for any task in this repository. It is the single source of
truth for AI agents; `CLAUDE.md` only imports it.

## What this project is

**gluefuil** (short name **gfui**) is a **re-invention of the XMLUI
framework**: a declarative, reactive UI framework where applications are
written as XML markup (`.gui` files, using XMLUI's markup syntax), with
spreadsheet-like reactive expressions in `{...}` and no manual state wiring.

We are not forking XMLUI. We learn from its design, its documented behavior and
its mistakes, then build a fresh implementation. Where we deliberately diverge
from XMLUI, record the decision and the reason (see *Decisions* below).

## Status

Proof-of-concept phase: steps 0–19 and the inserted 19A–19C (the App
shell) of [.ai/plan/poc-steps.md](.ai/plan/poc-steps.md) are done (16 and
19 with a reduced scope); the inserted 19D–19F (the layout system) are done too.
Steps 20 (data binding and the mock backend), 21 (routing), 21B (globals),
22 (client-side forms), 22B (form submission and server errors), 23 (text
and display components), 24 (inputs), 25 (choice inputs), 26 (date and time inputs), 27 (overlays and menus), 28 (structure), 29 (the virtualized `List`), 30 (`Table`, `Value`, `Pagination`), 31 (`Tree`, `TileGrid`, `Items`), 32 (the remaining components, except files) and 32B (files and uploads) are done; step 33 is next. **Start a new session with [.ai/handoff.md](.ai/handoff.md)**:
the current state, how the user works, practical notes, open questions.
**Stop after each step so the user can review it.** Each step is developed on
its own branch (`poc/NN-topic`).

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
- **Naming.** The project and product are **gluefuil**, short name **gfui**; XMLUI is only the origin and reference. (Renamed from patchfuil/pfui with `.pfui` files after step 22B.)
  - The npm scope is `@gluefuil/*`.
  - Markup files use `.gui` (`Main.gui`, `components/Name.gui`). Code-behind uses `.gui.xs`; the app-wide script stays `Globals.xs`.
  - The short name `gfui` is used for the CSS custom-property prefix (`--gfui-*`), the standalone browser global, the CLI command and the docs code-fence language.
  - In prose, say "XMLUI" only when referring to the original framework.
- **Toolchain:** TypeScript 7, npm workspaces, Vite 8, Vitest 5 (jsdom for React packages), Playwright, React 19. Packages: `compiler`, `runtime`, `components` (see [.ai/docs/code-structure.md](.ai/docs/code-structure.md)). See [.ai/plan/poc-steps.md](.ai/plan/poc-steps.md) step 0.
- **Reactivity: signals with one `useSyncExternalStore` subscription per component**, using our own small store (`packages/runtime/src/reactivity/`). Plain React state was measured and rejected. See [.ai/plan/poc-04-reactivity.md](.ai/plan/poc-04-reactivity.md).
- **The App shell has no `layout` property.** `App`'s regions (`AppHeader`, `NavPanel`, `Footer`) each carry their own literal settings (`sticky`, `placement`, `fullHeight`, `drawerBelow`, `collapsible`; `App scroll`); the defaults are XMLUI's `condensed-sticky`; the compiler passes the regions to `App` and CSS does the layout. See [.ai/plan/poc-19a-app-shell.md](.ai/plan/poc-19a-app-shell.md).
- **Layout: `Stack` (with `VStack`/`HStack`/`CVStack`/`CHStack`) is the only layout container; `wrapContent` replaces `FlowLayout`.** Gaps and paddings are automatic: a four-level ladder (`space-level0`–`3`) chosen by nesting, orientation, surfaces and screen size, and every spacing value is a multiple of `space-base`. See [.ai/plan/poc-19d-layout.md](.ai/plan/poc-19d-layout.md).
- **Data: `@tanstack/query-core` bridged to our signals, behind one HTTP gate.** `DataSource` and `APICall` keep XMLUI's markup. See [.ai/plan/poc-20-data.md](.ai/plan/poc-20-data.md).
- **Mock backend: a Fetch-API handler (`Request` → `Response`) in `@gluefuil/mock-backend`, hosted by a service worker (MSW), dev-server middleware or a test server (MSW node).** The app makes real requests and can't tell; faults and holds are driven through `/__mock`. See [.ai/plan/poc-20-data.md](.ai/plan/poc-20-data.md).
- **Globals are known at compile time.** Every file sees the globals of `Main.gui`'s root and `Globals.xs` (an unknown name stays an error); React context carries their scope to user components. See [.ai/plan/poc-21b-globals.md](.ai/plan/poc-21b-globals.md).
- **Icons are Lucide** (`lucide-react`) behind our own name registry (XMLUI's names); only registered icons ship. See [.ai/plan/poc-23-display.md](.ai/plan/poc-23-display.md).
- **Markdown: micromark/mdast (GFM) with our own renderer, in a lazy chunk;** raw HTML passes an allowlist; `@{…}` is compiled from markup, never evaluated from runtime strings. See [.ai/plan/poc-23-display.md](.ai/plan/poc-23-display.md).
- **Select and AutoComplete: `Option` children compile to data** (one reactive options array, so the prerender shows the selection; XMLUI registers Options in effects), **on Mantine's Combobox primitives**; `data`/`valueField`/`labelField` replace step 16's `options`. See [.ai/plan/poc-25-choice.md](.ai/plan/poc-25-choice.md).
- **Dates: `@mantine/dates` (with `dayjs`) in a lazy chunk; XMLUI's string values** (a date in `dateFormat` or `{ from, to }`, `HH:mm`; `isoValue()`). See [.ai/plan/poc-26-dates.md](.ai/plan/poc-26-dates.md).
- **Overlays: Mantine's Modal, Drawer, Menu and Tooltip, toasts on `@mantine/notifications`;** pointer handlers (`click`, `contextMenu`) receive a frozen pointer snapshot, never the DOM event, and handlers of events without arguments declare no `$param` (`EventMetadata.args`), so a dialog's shows through. See [.ai/plan/poc-27-overlays.md](.ai/plan/poc-27-overlays.md).
- **Tab and step headers are compiled to data** (`childrenAsHeaders`, as step 25's Options) while the TabItem/Step content compiles in place with file-scoped IDs; our own Splitter; `$overflow` in a scope per child. See [.ai/plan/poc-28-structure.md](.ai/plan/poc-28-structure.md).
- **Virtualizer: TanStack Virtual** (`@tanstack/react-virtual`), shared by List, Table, Tree and TileGrid; measured against virtua in a prototype. See [.ai/plan/poc-29-list.md](.ai/plan/poc-29-list.md).
- **Table: our own column model (no TanStack Table), Column children compiled to data, rendered as a grid of divs with table roles.** See [.ai/plan/poc-30-table.md](.ai/plan/poc-30-table.md).
- **Tree: `@headless-tree/core` with its state controlled by the component (headless-tree gives the visible items, ARIA, focus and the navigation keys); our own data index, working copy and lazy loading. TileGrid: rows of tiles on the shared virtualizer.** See [.ai/plan/poc-31-tree-tilegrid.md](.ai/plan/poc-31-tree-tilegrid.md).
- **QRCode: `uqr`'s module matrix drawn as one SVG path** (measured against `react-qr-code`, `qrcode`, `qrcode-generator`). **The TableOfContents is prerendered** through extra passes of the prerender's loop (`requestServerRender`), and hydration reads the prerendered list back from the DOM. Step 32B: `react-dropzone`, papaparse in a lazy chunk, `File` objects in script, multipart bodies with `FileUpload`/`FileDownload`. See [.ai/plan/poc-32-remaining.md](.ai/plan/poc-32-remaining.md).
- **Files (step 32B):** `File` objects in script (an allowed platform value); a body with a file goes as multipart (`payloadType` chooses); action elements (`APICall`, `FileUpload`, `FileDownload`) inside `<event>` and `Actions.upload()`/`download()`; downloads always fetched. See [.ai/plan/poc-32b-files.md](.ai/plan/poc-32b-files.md).
- **Base component library is Mantine.** Its styling is exposed only through XMLUI-style theme variables; Mantine's own theme API is an internal detail. See [.ai/plan/architecture.md](.ai/plan/architecture.md) § "Notes for area 5".

## Working agreements

- Commit only when asked. Don't commit to `master` without being asked; use a branch for larger work.
- Keep this file short. Detail belongs in `.ai/`; link to it from here.
- When you learn something that would change how a future agent works in this
  repo, update this file or the right `.ai/` document instead of saving private memory.
