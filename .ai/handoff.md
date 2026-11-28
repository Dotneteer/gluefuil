# Handoff: where the work stands

> For the next AI session. Read `AGENTS.md` first (it links here), then this,
> then [`docs/code-structure.md`](docs/code-structure.md) before changing code.
> Update this file when you hand off again.
>
> **Written:** after proof-of-concept steps 0–19 (2026-11-23); updated
> after the inserted steps 19A–19C (the App shell), 19D–19F (the layout
> system), step 20 (data binding and the mock backend), and step 23 (text and
> display components; 2026-11-25), and after steps 24–28 (2026-11-26) and
> steps 29 and 30 (2026-11-26), and after step 31 (2026-11-26), and after
> step 32 and 32B (2026-11-27), and after step 33 (2026-11-27), and after step 34 (2026-11-28).

## Next step

**Step 35: observability** (`plan/poc-steps.md` row 35: a trace stream
emitted only when enabled, pointing at markup lines). XMLUI reference:
`website/content/docs/pages/managed-react/observability-substrate.md` (and
`audit-grade-observability.md`; its source: `xmlui/src/components-core/inspector/`,
`components-core/audit/`). What it builds on here:

- step 33's error pipeline (`runtime/src/errors/report.ts`: `ErrorSource`,
  sinks, `reportDiagnostic`; "step 35 will give them a trace" in
  `plan/poc-33-errors.md`);
- step 34's i18n diagnostics (missing keys, load failures);
- source maps (step 9, `docs/source-maps.md`): how a trace can point at a
  `.gui` line;
- the handler runtime (`render/handlers.ts`) and the data layer
  (`data/http.ts`), the likely emitters.

The kickoff routine (as for steps 33 and 34):

1. delete the merged branch (`poc/34-i18n`);
2. create `poc/35-observability`;
3. write `plan/poc-35-observability.md`, citing XMLUI by path; measure open
   library or rendering choices in `.tmp/vproto/`; ask the open decisions with
   `AskUserQuestion`;
4. implement only after the user accepts the plan.

## State

- **Step 29 (the virtualized List) is done and merged into master.** Plan and findings:
  [`plan/poc-29-list.md`](plan/poc-29-list.md); reference:
  [`docs/list.md`](docs/list.md). `npm run check`: 3,010 unit tests in
  108 files, 247 E2E tests. The virtualizer is TanStack Virtual (measured
  against virtua with a prototype in `.tmp/vproto/`, ignored by git).
- **Step 30 (Table and Column) is done and merged into master.** Plan and findings:
  [`plan/poc-30-table.md`](plan/poc-30-table.md); reference:
  [`docs/table.md`](docs/table.md). `npm run check`: 3,145 unit tests in
  111 files, 260 E2E tests. Our own column model, Columns compiled to data, a
  grid of divs (measured against a native table in `.tmp/vproto/`), the 45
  typed values with `Value`, `Pagination`.
- **Step 31 (`Tree`, `TileGrid`, `Items`) is done and merged into master.** Plan and findings:
  [`plan/poc-31-tree-tilegrid.md`](plan/poc-31-tree-tilegrid.md); reference:
  [`docs/tree.md`](docs/tree.md). `npm run check`: 3,244 unit tests in 113
  files, 274 E2E tests. The Tree is on `@headless-tree/core` (the user's
  choice over our own model; measured: a rebuild per change, about 2 µs a
  visible row); the TileGrid is rows of tiles on `useVirtualRows` (measured
  against TanStack's lanes in `.tmp/vproto/tiles.html`). `Bound` now computes
  each binding apart (a runtime change: a literal keeps its identity when
  another prop changes).
- **Step 32 (the remaining components, except files) is done and merged into master.** Plan and findings:
  [`plan/poc-32-remaining.md`](plan/poc-32-remaining.md); reference:
  [`docs/remaining-components.md`](docs/remaining-components.md).
  `npm run check`: 3,310 unit tests in 117 files, 288 E2E tests. The user
  split the step: **32B** (FileInput, FileUploadDropZone, uploads) gets its own
  plan after 32 is merged; its decisions are already recorded in the step 32
  plan (*Decisions* 3–6).
- **Step 32B (files and uploads) is done and merged into master.** Plan and findings:
  [`plan/poc-32b-files.md`](plan/poc-32b-files.md); reference:
  [`docs/files.md`](docs/files.md). `npm run check`: 3,364 unit tests in
  120 files, 296 E2E tests. Next: step 33 (`poc-steps.md`).
- **Step 33 (structured errors) is done and merged into master.** Plan and findings:
  [`plan/poc-33-errors.md`](plan/poc-33-errors.md); reference:
  [`docs/errors.md`](docs/errors.md). `npm run check`: 3,470 unit tests in
  125 files, 302 E2E tests. `AppError` everywhere, `App onError`/`App.errors`,
  a per-element `onError`, `Fallback`, boundaries around Pages and the App
  content, `RetryPolicy` with a circuit breaker. Next: step 34 (i18n).
- **Step 34 (internationalization) is done and merged into master.** Plan and findings:
  [`plan/poc-34-i18n.md`](plan/poc-34-i18n.md); reference:
  [`docs/i18n.md`](docs/i18n.md). `npm run check`: 3,579 unit tests in
  130 files, 308 E2E tests. ICU messages on `intl-messageformat`, locale files,
  `App.setLocale`, `I18n`, `Locale`, `gfui.*` framework strings, RTL. Next:
  step 35 (observability).
- **`master` holds steps 0–34, merged.** `origin/master`
  (as last fetched) is at the rename after step 22B; the later merges are not
  pushed. Pushing is the user's decision.
- **Step 28 (structure) is done and merged into master.** Plan and findings:
  [`plan/poc-28-structure.md`](plan/poc-28-structure.md); reference:
  [`docs/structure.md`](docs/structure.md). `npm run check`: 2,926 unit tests
  in 105 files, 235 E2E tests.
- **Step 27 (overlays and menus) is done and merged into master.** Plan and findings:
  [`plan/poc-27-overlays.md`](plan/poc-27-overlays.md); reference:
  [`docs/overlays.md`](docs/overlays.md). `npm run check`: 2,882 unit tests
  in 103 files, 220 E2E tests.
- **Step 26 (date and time inputs) is done and merged into master.** Plan and findings:
  [`plan/poc-26-dates.md`](plan/poc-26-dates.md); reference:
  [`docs/dates.md`](docs/dates.md). `npm run check`: 2,814 unit tests in
  99 files, 202 E2E tests.
- **Step 25 (choice inputs) is done and merged into master.** Plan and findings:
  [`plan/poc-25-choice.md`](plan/poc-25-choice.md); reference:
  [`docs/choice.md`](docs/choice.md). `npm run check`: 2,780 unit tests in
  98 files, 200 E2E tests.
- **Step 24 (inputs) is done and merged into master**
  Plan and findings: [`plan/poc-24-inputs.md`](plan/poc-24-inputs.md);
  reference: [`docs/inputs.md`](docs/inputs.md). `npm run check`: 2,743 unit
  tests in 96 files, 198 E2E tests.
- **Step 23 (text and display components) is merged into `master`.** Plan and findings:
  [`plan/poc-23-display.md`](plan/poc-23-display.md); reference:
  [`docs/display.md`](docs/display.md). `npm run check` passes: 2,697 unit
  tests in 95 files, 188 E2E tests. The bullets below predate steps 21–23
  where they say otherwise (21, 21B, 22, 22B are merged on `master`, and the
  project was renamed to gluefuil after 22B).

- **`master` holds steps 0–20, with 19A–19C (the App shell) and 19D–19F
  (the layout system), merged.** Each step's branch was deleted after its
  merge, by the user's request; `master` is the only branch. Step 21 has
  not started.
- **The remote `origin`** (github.com/Dotneteer/gluefuil) has `master` up
  to `1d8ac4d` (steps 0–19F), pushed by the user. Step 20's two commits are
  not pushed. Pushing is the user's decision.
- **`npm run check` passes and prints no warnings:** 2,228 unit tests in
  79 files and 148 E2E tests. A new warning is worth a look:
  `code-structure.md` § E2E says why the output is quiet.
- **Steps 0–20 of [`plan/poc-steps.md`](plan/poc-steps.md) are done**
  (✅), each with its plan `plan/poc-NN-*.md`, which ends in *Outcome*,
  *Findings* and *Open for later steps*. The inserted 19A–19C have one
  plan, [`plan/poc-19a-app-shell.md`](plan/poc-19a-app-shell.md), and so do
  19D–19F, [`plan/poc-19d-layout.md`](plan/poc-19d-layout.md). Step 20:
  [`plan/poc-20-data.md`](plan/poc-20-data.md).

### Where the work deviated from `poc-steps.md`

- **Step 16 (Mantine)** was skipped after 15 and done after 18, with a
  reduced scope: `Button`, `TextBox`, `Select` and `Checkbox` as Mantine
  components, and our own `Text` variants and `Heading`/`H1`–`H6`.
  - `wrapComponent` (runtime) is the wrapper API.
  - Steps 17 and 18 were first built on our own components, then adapted.
- **Step 19 was reduced to routing:** `Pages`/`Page`/`Link`, `navigate`,
  `$pathname`/`$routeParams`/`$queryParams`, on our own small router with
  hash mode by default. The App shell and the layout model were done as
  the inserted 19A–19C and 19D–19F. Step 21 (Routing) is partly done.
- **Done beyond the steps:**
  - **IDs inside templates:** each template instance has its own ID scope,
    and E014 is retired.
  - **An app's own React components:** the Vite plugin's `extensions`
    option, with `componentModules` in `compileModule`.
  - **`?raw` imports** of `.gui` files are not compiled.
  - **The playground** (below).

### The playground (`playground/`)

- **`npm run playground`** starts it on http://localhost:5190 (use
  `playground:preview` for the prerendered build, on 5191).
- **A dashboard of 20 scenarios,** one per concept of steps 2–20, on the
  App shell (a side nav lists them). `layouts.html?layout=…` is a second
  page: one App shell demo per XMLUI layout, and the spacing demo
  (`?layout=spacing`, with the `SpacingInspector`). Each page shows its own
  source (`ScenarioSource`, an app React component).
- **The playground has a mock backend** (`src/backend.ts`) in a service
  worker, in dev and in the preview build. The Data scenario's network
  panel steers it.
- **The playground sets no `gap` or `padding`:** the spacing is automatic
  (19D–19F). Keep it that way in new scenarios.
- **"Live compiler"** compiles markup in the browser (`LiveMarkup`).
- **Tests:** `e2e/playground.spec.ts` (smoke) and
  `e2e/playground-scenarios.spec.ts` (one interaction test per scenario).
- **Adding a scenario:** see `playground/README.md`. Add its test too.

### How decisions are made now (steps 29–30)

- **The user asks for measurements, not opinions:** for a library or
  rendering choice, build a throwaway prototype in `.tmp/vproto/` (ignored by
  git; Vite build plus Playwright scripts there) and put a table of results in
  the plan's *Options considered*. Then ask with `AskUserQuestion`, the
  recommended option first.
- **Record the answers** under *Decisions* in the plan, and an architectural
  one as a line in `AGENTS.md` *Decisions*.

## How the user works (keep doing this)

- **One step at a time.** For a step:
  1. write `plan/poc-NN-topic.md`, citing XMLUI sources by path (status "In
     progress", then "Done; awaiting review");
  2. implement on branch `poc/NN-topic` with unit and E2E tests;
  3. update `docs/code-structure.md` and the subsystem docs in
     `.ai/docs/`;
  4. run `npm run check`;
  5. **stop and report.**
- **Report style:**
  - what works now, with a short usage example;
  - the evidence (tests, measurements);
  - findings;
  - divergences from XMLUI;
  - what is open;
  - then ask: "Should I commit and merge step N and start step N+1?"
- **On "commit and merge":**
  1. flip the plan to "**Status:** Done" and remove "(awaiting review)" in
     `poc-steps.md`;
  2. commit; the message ends with
     `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  3. `git switch master && git merge --no-ff <branch> -m "Merge step N: …"`.

  Commit **only** when asked.
- **The user sometimes reshapes a step** (skip, reduce, reorder) or adds
  side tasks. Follow that, and record it in `poc-steps.md` and the plan.
- **Verify, don't assume.** Run the tests, probe the real browser, measure.
  Twice the user's manual testing found what tests didn't, and twice a new
  test found a weak scenario.

## Practical notes (learned the hard way)

- **`/Users/dotneteer/source/xmlui` is read-only:** read it, cite it,
  never modify it. The XMLUI MCP server may fail to connect; read the
  files directly instead.
- **Vite configs** that load the workspace TypeScript packages need
  `--configLoader runner`.
- **Ports:**

  | Port | Server |
  |------|--------|
  | 5173 | E2E smoke app |
  | 5174 | hello dev server |
  | 5175 | standalone site |
  | 5176 | hello build |
  | 5177 | routing dev server |
  | 5178 | routing build |
  | 5180 | playground under E2E |
  | 5181 | playground production build under E2E |
  | 5182 | data fixture, mock backend in a service worker |
  | 5183 | data fixture, mock backend in the dev server |
  | 5184 | routing-browser fixture, prerendered build (step 21) |
  | 5185 | routing-browser fixture built under `base: "/app/"` (step 21, part 2) |
  | 5186 | forms fixture, dev server (step 22) |
  | 5187 | forms fixture, prerendered build (step 22) |
  | 5190 | playground for the user |
  | 5191 | playground preview |

  Playwright **reuses** a server already running on a port. A clash once
  made the smoke test open the playground.
- **Fixture Vite configs** list `optimizeDeps.include` (Mantine, React).
  Otherwise a cold cache reloads the page mid-test.
  - Only list packages the app itself can resolve. One unresolvable entry
    made Vite drop the whole list silently. The mock plugin pre-bundles MSW
    for the app (`@gluefuil/mock-backend > msw`).
  - Two Vite servers must not share a cache folder. The prerender's server
    now has its own (step 20 found the 504 "Outdated Optimize Dep" it
    caused).
- **The mock backend in E2E:** steer it through `/__mock` with `fetch` from
  the page. The dev-server host's backend is shared across tests (the
  project runs with `workers: 1`, each test resets it); the worker host's is
  new with each page.
- **jsdom tests with Mantine** need `packages/components/tests/jsdom-setup.ts`
  (stubs for `matchMedia` and `ResizeObserver`). The components and
  standalone test projects load it.
- **Shell edits with Python heredocs** are reliable. The `Write` tool
  turned `\u` escapes into literal characters once (U+2028, U+E000), so
  write those through a script.
- **The compiler must stay free of React, the DOM and Node**
  (`tools/boundaries.ts`). The metadata module
  `@gluefuil/components/metadata` must stay React-free; the theme engine
  and the behavior metadata live there for that reason.
- **`navigate()` returns a promise (step 21).** In jsdom tests, write
  `act(() => { void navigate("/x"); })` or `await act(async () => …)`.
  `act(() => navigate("/x"))` is an async act nobody awaits, and later
  renders queue behind it (an empty `<div>`).
- **Don't reset the router while an app is mounted** in a test: unmount
  first. Otherwise the next render attaches the router inside a computed
  value (`ReactivityError`).
- **Lazy chunks and the prerender (step 23):** a component that suspends on
  a dynamic import records it with `noteServerLoad`; the prerender renders the
  route again once it loaded. Call `use()` on every render, and memoize the
  Suspense boundary on its inputs: an update to a boundary that is still
  dehydrated makes React drop the server HTML.
- **New dependencies need `optimizeDeps.include`** in every fixture config,
  including those found only by a dynamic import (the Markdown parser);
  otherwise the dev server reloads the page mid-test.
- **The sandbox invariant:** no platform object reaches script.
  `wrapComponent` calls an unconfigured `on*` handler without arguments for
  this reason. Pointer events pass `pointerData(event)` (step 27), and an
  event without arguments for statements is marked `args: "none"` in its
  metadata (else its statement handlers declare a `$param` that hides a
  dialog's).
- **Virtualized components in jsdom (step 29):** a List stays in its static
  window (the first 20 rows) until it has a layout box, which jsdom never gives;
  prove scrolling, measuring and anchoring in `e2e/list.spec.ts`. A List without
  a height scrolls with the page: in E2E, scroll it into view before looking
  for rows below the window (they aren't mounted).
- **Bundle sizes are in KiB** (bytes ÷ 1024), as in every plan's *Size*.
- **Hunting a flaky E2E test:** run many copies in parallel so they load the
  machine (`--repeat-each=30 --workers=8 -g "<title>"`). That reproduced step
  29's Select race (1 in 30), which passed alone every time. Don't use
  `--repeat-each` on the standalone project: its tests edit served files and
  must run one at a time.
- **headless-tree in tests (step 31):** its keys track pressed keys from
  `keydown` to `keyup`; a jsdom test must send both (`press` in
  `tree.test.tsx`), or the next key is read as a chord.
- **Built-in names grow:** a user component named like a new built-in is
  E016 (step 31's `Tree` clashed with a test's component).
- **Mantine overlays in jsdom (step 27):** no CSS transitions, so content
  mounts a moment after opening and may stay `display: none`. Use
  `findBy*` with `hidden: true`; prove visibility, focus and placement in
  `e2e/overlays.spec.ts`. Reset with `resetOverlayState()` after each test.

- **The prerender's passes (step 32):** a component can read
  `staticRenderInfo()` and ask for another pass with `requestServerRender()`;
  `previous` is set only for the same app and path. Hydration can read what
  the server rendered back from the DOM (find it by `useId`) as
  `getServerSnapshot` (the TableOfContents).
- **The mock backend's worker and media (step 32):** MSW's passthrough broke
  video seeking in Chrome; `MEDIA_BYPASS` in the plugin's worker script fixes
  it. A port taken by an old prototype server (5199) answered a probe once:
  check `lsof -iTCP:<port>` when a dev server's answer looks wrong.

- **jsdom and files (step 32B):** jsdom's `Blob`/`FormData` aren't Node
  fetch's. Tests that send files through real `fetch` run in Node's
  environment (`// @vitest-environment node`); component tests stub `fetch`.
  Check a Blob by its shape where two realms meet.

- **Timing in jsdom tests:** don't assert a final state after a fixed short
  `settle(ms)`; a loaded machine (two `npm run check`s at once, found after
  step 32B) runs late. Poll for the final state (`eventually` in
  `components/tests/step32.test.tsx`, a `vi.waitFor`) and make in-progress
  windows wide (hundreds of ms). Check with several runs in parallel.

- **Errors (step 33):** a handler or DataSource error nobody handles now
  shows a toast (when an App is mounted). Tests that capture errors use
  `setErrorReporter` (the console stage) and, for developer warnings
  (duplicate ids, an unbound input), `setDiagnosticReporter`. A test that
  clicks a throwing button must await the click before it ends.
- **i18n (step 34):** in jsdom `navigator.languages` is `["en-US"]`, so an app
  with an `en` bundle resolves `en-US`. Tests that set a locale call
  `resetI18nState()` and `localStorage.clear()` after. A new dependency of
  the runtime (here `intl-messageformat`) goes into every fixture's
  `optimizeDeps.include`. Don't re-render the App (or anything above a lazy
  Suspense boundary) right after a takeover for a change that shows nothing:
  React drops a still-dehydrated boundary's HTML.
- **Render errors in tests:** `{null.x}` doesn't throw (null-safe member
  access); use `JSON.parse('{oops')`.

## Open questions for the user

- **Numeric character references** (`&#169;`) are kept literally, as in
  XMLUI, which decodes only `&amp; &lt; &gt; &quot; &apos; &nbsp;`. Should
  we decode them anyway?
- **Multi-line `<Text>`** keeps a collapsed space at each end (found in
  step 20). Trim it? XMLUI's behavior is to be checked first.

## Candidates for what comes next (the user decides)

- **Step 31's open items** (`poc-31-tree-tilegrid.md`).
- **Step 31: `Tree`, `TileGrid`, `Items`** (on the shared virtualizer).
- **Step 30's open items** (`poc-30-table.md`).
- **Step 29's open items** (`poc-29-list.md`): paging with DataSource's
  `nextPageSelector`, the data-refresh modes, the checkbox theme variables.
- **Step 28's open items** (`poc-28-structure.md`).
- **Step 27's open items** (`poc-27-overlays.md`).
- **Step 26's open items** (`poc-26-dates.md`).
- **Step 25's open items** (`poc-25-choice.md`).
- **Bundle size:** let unused built-ins drop (step 24 finding).
- **Step 23's open items** (`poc-23-display.md`): compile-time icon imports
  (size), Markdown code highlighting and `highlightText`, Text search
  highlighting.

- **Step 21: routing** (the rest): `willNavigate`/`didNavigate`,
  prerendering every static route.
- **Step 22: forms**, which can now submit to `APICall` and map a 422's field
  errors (`error.body.errors`).
- **Gaps recorded in the plans' "Open for later steps":**
  - global variables in user components;
  - `<script>` blocks;
  - `Button` variants;
  - app components in standalone mode;
  - state-preserving hot reload;
  - bundle size (Mantine doubled it);
  - App-level theme variable overrides (XMLUI's `desktop` padding 0);
  - the App shell's open items (`poc-19a-app-shell.md`, *Open for later
    steps*): RTL drawer, scroll lock, more NavLink props, an `Aside`,
    an icon library;
  - the layout system's open items (`poc-19d-layout.md`): responsive layout
    props (`width-md`), `dock`, `Card`/`ModalDialog` as surfaces; the
    context's cost (about 5 µs per stack in jsdom);
  - runtime contract checks of bound values;
  - the data layer's open items (`poc-20-data.md`): `<RetryPolicy>`,
    notifications and confirmations on `APICall`, `deferredMode`, paging,
    uploads and downloads, a mock backend in standalone mode.
