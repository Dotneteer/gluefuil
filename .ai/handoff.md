# Handoff: where the work stands

> For the next AI session. Read `AGENTS.md` first (it links here), then this,
> then [`docs/code-structure.md`](docs/code-structure.md) before changing code.
> Update this file when you hand off again.
>
> **Written:** after proof-of-concept steps 0–19 (2026-11-23); updated
> after the inserted steps 19A–19C (the App shell), 19D–19F (the layout
> system) and step 20 (data binding and the mock backend).

## State

- **`master` holds steps 0–20, with 19A–19C (the App shell) and 19D–19F
  (the layout system), merged.** Earlier branches were deleted after their
  merges, by the user's request; `poc/20-data` still exists. Step 21 has
  not started.
- **The remote `origin`** (github.com/Dotneteer/patchfuil) **has nothing
  pushed.** Pushing is the user's decision.
- **`npm run check` passes and prints no warnings:** 2,228 unit tests in
  79 files and 148 E2E tests. A new warning is worth a look:
  `code-structure.md` § E2E says why the output is quiet.
- **Steps 0–19 of [`plan/poc-steps.md`](plan/poc-steps.md) are done**
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
  - **`?raw` imports** of `.pfui` files are not compiled.
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
  | 5190 | playground for the user |
  | 5191 | playground preview |

  Playwright **reuses** a server already running on a port. A clash once
  made the smoke test open the playground.
- **Fixture Vite configs** list `optimizeDeps.include` (Mantine, React).
  Otherwise a cold cache reloads the page mid-test.
  - Only list packages the app itself can resolve. One unresolvable entry
    made Vite drop the whole list silently. The mock plugin pre-bundles MSW
    for the app (`@patchfuil/mock-backend > msw`).
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
  `@patchfuil/components/metadata` must stay React-free; the theme engine
  and the behavior metadata live there for that reason.
- **The sandbox invariant:** no platform object reaches script.
  `wrapComponent` calls an unconfigured `on*` handler without arguments for
  this reason.

## Open questions for the user

- **Numeric character references** (`&#169;`) are kept literally, as in
  XMLUI, which decodes only `&amp; &lt; &gt; &quot; &apos; &nbsp;`. Should
  we decode them anyway?
- **Push to GitHub?** Nothing has been pushed.

## Candidates for what comes next (the user decides)

- **Step 21: routing** (the rest): `willNavigate`/`didNavigate`,
  prerendering every static route.
- **Step 22: forms**, which can now submit to `APICall` and map a 422's field
  errors (`error.body.errors`).
- **Gaps recorded in the plans' "Open for later steps":**
  - global variables in user components;
  - `<script>` blocks;
  - `Select`'s `Option` children;
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
