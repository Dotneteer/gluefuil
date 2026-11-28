# Proof-of-concept steps

**Status:** Draft

## Goal

Build the framework in small, verifiable increments: the core concepts first,
then more and more components. Each step is a proof of concept (POC) with
one clear subject, its own tests, and a "done when" condition. A step ends in
a working, tested state, so the next one can build on it.

This plan implements [architecture.md](architecture.md). When a step answers
an open question from there, the answer is recorded in architecture.md and,
if it's architectural, under *Decisions* in the root `AGENTS.md`.

## How every step works

1. **Before the step:** write a short plan (`.ai/plan/poc-NN-<topic>.md`) if
   the step needs design decisions. Trivial steps can skip it.
2. **Tests first or alongside**, never after the fact:
   - **Unit tests (Vitest)** for every step: compiler stages, runtime
     pieces and components (with React Testing Library in jsdom).
   - **E2E tests (Playwright)** whenever a step's claim can only be proven in
     a real browser: rendering a real app, user interaction, standalone
     loading, server-generated HTML, source maps, scrolling and
     virtualization, visual theme results.
   - **Conformance tables** (data-driven test cases: input, expected output
     or error) for the language: parser, code generation, semantics. They
     are the written spec of the scripting language, so they grow with
     every step and never shrink.
3. **Done when** all of the step's tests pass, previous steps' tests still
   pass, and the step's checklist is ticked.
4. **Record what was learned** in architecture.md (decisions, surprises,
   divergences from XMLUI).
5. **Update the development documentation:**
   [`../docs/code-structure.md`](../docs/code-structure.md) (the
   cornerstone) and any other `.ai/docs/` document the step affects, so they
   describe the code as it now is.
6. **Stop for review** before starting the next step.

The XMLUI reference for each step is listed under *Reference*. Paths are
relative to `/Users/dotneteer/source/xmlui`.

---

## Phase A: Foundation

### Step 0: Workspace and test harness ✅

- **Outcome:**
  - Packages are named `@gluefuil/*` and export their TypeScript source
    directly (no build step yet).
  - The boundary rules are enforced by `tools/boundaries.test.ts`, which
    also tests the checker itself on fixtures.
  - The compiler's tsconfig has no DOM lib, verified by a probe file that
    used `document` and failed the typecheck.
  - One-time machine setup: `npx playwright install chromium`.

- **Subject:** repository layout, toolchain and test infrastructure.
- **Proposed toolchain (to confirm):** TypeScript, npm workspaces, Vite,
  Vitest, Playwright, React 19.
- **Proposed packages:** `compiler` (pure TypeScript, no DOM), `runtime`
  (React side), `components`, plus a test-app folder for E2E fixtures.
  - *Why split:* the three parts ship in different combinations. Standalone
    mode ships all three. A build-time compiled app ships `runtime` and
    `components` only, and a package boundary makes "no compiler in the
    bundle" enforceable. The Vite plugin, static generation, CLI and editor
    tooling use `compiler` in Node, without React or a DOM.
  - Dependency direction: `components` → `runtime`; `compiler` reads
    component **metadata** only, through a React-free `components/metadata`
    entry point; compiled app code → `runtime` + `components`. No cycles.
  - Built-ins in `components` use only `runtime`'s public wrapping API, the
    same one extension packages use. That proves the API is sufficient.
- **Tests:**
  - Unit: a smoke test per package.
  - E2E: Playwright opens a static page served by the test server.
- **Done when:** `npm test` and `npm run test:e2e` both run from the root.

### Step 1: Markup parser ✅

- **Outcome:** see [poc-01-markup-parser.md](poc-01-markup-parser.md) and
  [`../docs/markup-parser.md`](../docs/markup-parser.md).
  - All 105 `.xmlui` files in the XMLUI repo parse without diagnostics.
  - Throughput is about 120 MB/s.
  - Helper-tag recognition moved to the later semantic stage. The parser is
    purely syntactic, as XMLUI's is.
- **Subject:** `.gui` markup text becomes an AST of elements, attributes and
  text, with exact source positions (line, column, offset) on every node.
  Includes error recovery and diagnostics with locations, and helper tags
  (`<property>`, `<event>`, `<variable>`, `<method>`, `<script>`) recognized
  as such.
- **Proves:** positions survive for source maps (step 9) and diagnostics;
  parsing is fast enough for startup.
- **Tests:**
  - Unit: a conformance table of valid and invalid markup with expected
    AST shapes and diagnostics.
  - Benchmark: parse a large markup file (performance baseline).
- **Reference:** `xmlui/src/parsers/`, `.ai/xmlui/parsers.md`.

### Step 2: Expression and statement parser (the JS subset) ✅

- **Outcome:** see [poc-02-expression-parser.md](poc-02-expression-parser.md)
  and [`../docs/script-parser.md`](../docs/script-parser.md).
  - It is an ESTree-subset parser with file offsets.
  - It parses all script in XMLUI's `.xmlui` and `.xs` files.
  - Typical bindings parse in about 2 µs.
  - The step found that XMLUI decodes entities in attribute values (a
    step-1 correction).

- **Subject:** attribute values are split into literal and `{expression}`
  segments; expressions, statements and arrow functions are parsed into an
  AST with positions. The supported subset is defined by tests.
- **Proves:** the language accepts exactly the intended subset, with clear
  errors for unsupported syntax.
- **Tests:**
  - Unit: a conformance table per construct (literals, operators, optional
    chaining, template strings, object and array literals, destructuring,
    arrows, statements, `var` vs `let`/`const`), plus rejected constructs
    with their expected messages.
- **Reference:** `.ai/xmlui/expression-eval.md` § "Differences from
  JavaScript", `pages/scripting.md`.

### Step 3: Expression code generation and the sandbox ✅

Plan and findings: [poc-03-codegen.md](poc-03-codegen.md).

- **Subject:** compile a binding expression's AST to a JS function.
  Includes static name resolution against a scope and an allowlist, which
  makes the compiler the sandbox; optional chaining by default; and
  dependency extraction for each binding.
- **Proves:** compiled output matches the language semantics. Banned access
  (`eval`, `window`, DOM, raw `fetch`, …) fails at compile time or is
  guarded at runtime.
- **Tests:**
  - Unit: a semantic conformance table (expression plus scope gives the
    expected value), dependency-set tests, and sandbox-escape tests (every
    case must be rejected).
- **Reference:** `pages/managed-react/code-injection-prevention.md`,
  `dom-api-isolation.md`.

### Step 4: Reactivity core (decides the open area-1 question) ✅

Plan, measurements and decision: [poc-04-reactivity.md](poc-04-reactivity.md).

- **Subject:** how compiled reactivity drives React. Build the same tiny
  scenario on (a) signals plus a subscription per component and (b) plain
  React state, then measure.
- **Proves:** a change re-renders only the components that read the
  changed value; works with concurrent React; no tearing.
- **Tests:**
  - Unit (React Testing Library): render-count assertions for an
    independent sibling, a deep child, a derived value and batch updates.
  - Micro-benchmark.
- **Done when:** the option is chosen and recorded in architecture.md and
  `AGENTS.md` *Decisions*.

---

## Phase B: Basic concepts, end to end

### Step 5: First running app ✅

Plan and findings: [poc-05-first-app.md](poc-05-first-app.md).

- **Subject:** the pipeline from markup to a compiled module to React to the
  browser, for `<App><Text value="{1 + 2}"/></App>`. Own minimal `App`,
  `Text`, `Button` and `Stack`.
- **Proves:** the whole pipeline works end to end.
- **Tests:**
  - Unit: the compiled module renders the expected DOM.
  - E2E: the first Playwright test of a real app.

### Step 6: Reactive variables and synchronous handlers ✅

Plan and findings: [poc-06-variables-handlers.md](poc-06-variables-handlers.md).

- **Subject:** `var.x`, `<variable>`, global variables, and the "follows its
  expression until assigned" semantics; handler statements (`count++`,
  assignments) compiled to signal writes.
- **Tests:**
  - Unit: a variable semantics table, including the follow-until-assigned
    case from `pages/markup.md`.
  - E2E: counter and mirror examples.
- **Reference:** `pages/markup.md` § Variables, `pages/reactive-intro.md`.

### Step 7: Async handlers (smart sync/async) and concurrency basics ✅

Plan, design of the async batching, and findings: [poc-07-async-handlers.md](poc-07-async-handlers.md).

- **Subject:** handlers that implicitly await promise-returning calls,
  including async-aware array methods (`map` sequential; `filter`/`some`/…
  in parallel); bindings stay synchronous (a promise in a binding is an
  error); a basic `$cancel` token and handler policy.
- **Tests:**
  - Unit: an async conformance table (ordering, parallel vs sequential,
    errors, cancellation).
  - E2E: a slow handler, plus double-click under each policy.
- **Reference:** `.ai/xmlui/expression-eval.md` §5–6,
  `.ai/xmlui/concurrency.md`.

### Step 8: Scoping, component IDs, context variables ✅

Plan and findings: [poc-08-scoping-ids.md](poc-08-scoping-ids.md).

- **Subject:** downward scope flow; `id` exposes a component's values and
  methods (`input.value`, `dialog.open()`); `$`-context variables injected
  by a component into the templates it owns.
- **Tests:**
  - Unit: name resolution (shadowing, unresolved names as compile errors).
  - E2E: cross-component reads and writes by `id`.
- **Reference:** `pages/scoping.md`, `pages/context-variables.md`.

### Step 9: Source maps ✅

Plan and findings: [poc-09-source-maps.md](poc-09-source-maps.md).

- **Subject:** compiled modules carry source maps back to the `.gui` file
  (attributes, handlers and code-behind).
- **Tests:**
  - Unit: map generated positions back and assert the original line and
    column for each construct.
  - E2E: a thrown handler error's stack resolves to the markup line
    (through the Chrome DevTools Protocol).
- **Reference:** `.plan/source-maps-for-compiled-scripts.md`.

### Step 10: Conditional rendering and templates ✅

Plan and findings: [poc-10-conditionals-templates.md](poc-10-conditionals-templates.md).

- **Subject:** `when`, responsive `when-*`, `Items` with `$item` and
  `$itemIndex`, template properties (`<property name="…Template">`), and
  `onMount`/`onUnmount`.
- **Tests:**
  - Unit: mount and unmount and template context.
  - E2E: a responsive `when` at different viewport sizes.
- **Reference:** `pages/visibility.md`, `pages/template-properties.md`.

---

## Phase C: Delivery modes (proven early, so the architecture can't drift away from them)

### Step 11: Standalone mode ✅

Plan and findings: [poc-11-standalone.md](poc-11-standalone.md).

- **Subject:** one HTML file plus one JS file. Fetches `Main.gui` and the
  components, compiles them in the browser, caches the result in
  `localStorage` (keyed by content hash), and watches markup files for
  changes.
- **Tests:**
  - Unit: cache hit, miss and invalidation logic.
  - E2E: first load compiles; second load hits the cache (no compile);
    editing a file on the test server updates the app.

### Step 12: Build-time compilation ✅

Plan and findings: [poc-12-build-time.md](poc-12-build-time.md).

- **Subject:** a Vite plugin compiles `.gui` files at build time; the
  shipped bundle contains no parser or compiler.
- **Tests:**
  - Unit: the plugin's transform output.
  - E2E: the built app runs.
  - Bundle check: compiler modules are absent from the output.

### Step 13: Static site generation and takeover ✅

Plan and findings: [poc-13-ssg.md](poc-13-ssg.md).

- **Subject:** render the app to static HTML at build time, show it before
  the engine loads, then hydrate (signals must resume their state without
  re-rendering everything).
- **Tests:**
  - E2E: content is visible with JavaScript disabled; with JavaScript
    enabled, no hydration mismatch warnings; interaction works after
    takeover.

---

## Phase D: Component model

### Step 14: User-defined components ✅

Plan and findings: [poc-14-user-components.md](poc-14-user-components.md).

- **Subject:** one file compiles to one React component. Covers `$props`,
  private variables, `emitEvent`, methods and `$self`, the default and
  named slots, slot props flowing back as `$item`, scope isolation (a
  parent variable referenced inside is a compile error), inline
  `<Component>` in `Main.gui`, and code-behind.
- **Tests:**
  - Unit: one test per feature.
  - E2E: the examples from `pages/user-defined-components.md`.

### Step 15: Component metadata and compile-time contracts ✅

Plan and findings: [poc-15-contracts.md](poc-15-contracts.md).

- **Subject:** one metadata format for built-ins, wrapped components and
  UDCs. Diagnostics for unknown or missing props, wrong types, invalid
  enums, unknown events and methods, and deprecations.
- **Tests:**
  - Unit: a diagnostics table (markup gives the expected diagnostic at the
    expected position).
- **Reference:** `pages/managed-react/verified-type-contracts.md`,
  `build-validation-analyzers.md`.

### Step 16: Wrapping React components (Mantine) ✅

Skipped after step 15 and done after step 18, with a reduced scope (Button,
TextBox, Select, Checkbox; plus Text variants and Heading). Plan and findings:
[poc-16-mantine.md](poc-16-mantine.md).

- **Subject:** the lightweight wrapper API. Covers forwarding by default,
  renames, events, controlled values (`value`/`onChange`), exposed methods
  and templates as render props. Proven on Mantine `Button`, `TextInput`
  and `Select`, inside `MantineProvider`.
- **Tests:**
  - Unit: the wrapper mapping for each feature.
  - E2E: a typed value round-trips through a wrapped `TextInput` into a
    variable.
- **Reference:** `.ai/xmlui/wrapcomponent.md`.

### Step 17: Theming ✅

Plan and findings: [poc-17-theming.md](poc-17-theming.md).

- **Subject:** theme definitions (`extends`, tones, derived tokens, `$ref`)
  compiled to CSS variables; XMLUI-style variable names mapped onto
  Mantine's `--mantine-*` variables and Styles API parts; a `<Theme>` scope;
  switching light and dark tones.
- **Tests:**
  - Unit: theme compilation tables.
  - E2E: computed styles of a Mantine `Button` follow a theme variable, a
    scoped `<Theme>` and a tone switch.
- **Reference:** `.ai/xmlui/theming-styling.md`.

### Step 18: Behaviors ✅

Plan and findings: [poc-18-behaviors.md](poc-18-behaviors.md).

- **Subject:** behaviors attached by trigger props, in a fixed order.
  Starts with `tooltip`, `label` and `variant`. Decides whether behaviors
  apply to UDC tags.
- **Tests:**
  - Unit: attach and skip rules, and ordering.
  - E2E: a tooltip on a wrapped component.
- **Reference:** `.ai/xmlui/behaviors.md`.

### Step 19: Layout model and App shell — reduced to routing ✅

At the user's request only rudimentary routing was built (Pages, Page, Link,
navigate, $pathname/$routeParams/$queryParams); the layout model and App
shell remained, and were done as the inserted steps 19A–19C (the App shell)
and 19D–19F (the layout system). Plan and findings:
[poc-19-routing.md](poc-19-routing.md).

- **Subject:** the new layout primitives (area 6 design) and the App shell
  with region-owned settings (`placement`, `span`, `sticky`, `scroll`,
  `drawerBelow`, `collapsible`).
- **Tests:**
  - Unit: compile-time validation of invalid combinations.
  - E2E: each of the 8 XMLUI layouts expressed with the new settings, at
    desktop and mobile widths: what scrolls, what sticks, and the drawer.

### Steps 19A–19C: The App shell, redesigned (inserted) ✅

Inserted at the user's request, before step 20, and built together on one
branch. They replace the App-shell half of step 19 with a structure
modelled on Mantine's `AppShell`: XMLUI's markup, without the `layout`
property. Plan and findings: [poc-19a-app-shell.md](poc-19a-app-shell.md).

- **19A, the shell structure:** the regions as compile-time slots, one CSS
  grid, `scroll`, per-region `sticky`, `NavPanel placement`/`fullHeight`,
  migration errors for `layout`.
- **19B, navigation and small screens:** `NavLink` (with the active state, so
  step 21's "active links" is done),
  `NavGroup`, `drawerBelow`, `collapsible`, the logo.
- **19C, playground and docs:** the playground on the new shell, a
  layouts scenario.
- **Tests:** E2E: each of the 8 XMLUI layouts expressed with the new
  settings, at desktop and phone widths (what scrolls, what sticks, the
  drawer), and prerendering at both widths.

### Steps 19D–19F: The layout system, with automatic spacing (inserted) ✅

Inserted at the user's request, before step 20. This is the layout half of
step 19: `Stack` and its variants, wrapping instead of `FlowLayout`, layout
props, and gaps and paddings that follow the nesting automatically. Plan:
[poc-19d-layout.md](poc-19d-layout.md).

- **19D, containers and layout props:** `Stack`/`VStack`/`HStack`/
  `CVStack`/`CHStack`, `SpaceFiller`, `wrapContent`, sizing (percentages,
  star sizes), alignment, `$token` values, E031/E032.
- **19E, automatic spacing:** levels from a layout context, a four-step
  ladder of theme variables, surfaces, the phone step, `density`.
- **19F, playground and docs:** the playground without hand-written gaps, a
  layout scenario with a spacing inspector.
- **Tests:** E2E: measured gaps and paddings at desktop and phone widths,
  sizing, wrapping, prerendering.

---

## Phase E: Data, routing, forms

### Step 20: Data binding: `DataSource`, `APICall`, `data` URL shorthand ✅

Plan and findings: [poc-20-data.md](poc-20-data.md), with a mock backend the app
can't tell from a real one, and a catalog of the scenarios to test
(cancellation, retry, errors, slow network, out-of-order responses).

- **Subject:** loader state (`value`, `inProgress`, `loaded`, `error`),
  `refetch`, dependent queries, `transformResult`, `APICall.execute` with
  its events, `invalidates`, and request cancellation. Uses
  `@tanstack/react-query`.
- **Tests:**
  - Unit: loader state transitions.
  - E2E: against a mocked API (MSW or a Playwright route): list loads,
    mutation, then invalidation and refresh; a stale response must not win.
- **Reference:** `.ai/xmlui/data.md`, `pages/managed-react/fetch-lifecycle.md`.

### Step 21: Routing ✅ (part 2 awaiting review)

Partly done in step 19 (reduced): `Pages`/`Page`, dynamic segments, query
parameters, `navigate()`, hash and standard modes, deep links, back button,
fallback ([poc-19-routing.md](poc-19-routing.md)). Active links came with
`NavLink` (steps 19A–19C). Step 21 added the rest:
`willNavigate`/`didNavigate` (guarding back and forward too) and
prerendering every static route with browser routing
([poc-21-routing.md](poc-21-routing.md)). Part 2, added after the first
review: `navigate(-1)`, `navigate(to, { target: "_blank" })` and a basename
from Vite's `base`. A `200.html` fallback file is out; per-`Page` guards,
route constraints and nested pages moved to Phase G (step 38).


- **Subject:** `Pages`/`Page`, dynamic segments, query parameters, active
  links, `navigate()`, hash and standard modes, and `willNavigate` and
  `didNavigate`.
- **Tests:**
  - E2E: navigation, deep links, the back button and the fallback route.
- **Reference:** `pages/routing-and-links.md`.

### Step 21B: Global variables in user components (inserted) ✅

Plan: [poc-21b-globals.md](poc-21b-globals.md).

- **Subject:** `global.*` variables declared on the root of `Main.gui`
  are readable and writable in every file, user components included, and
  can be shadowed by a local variable of the same name (XMLUI:
  `website/content/docs/pages/scoping.md`, line 148). A `Globals.xs` file
  is included if it is cheap. The playground's routing scenario drops its
  `onUnsavedChange` event for a global.
- **Tests:**
  - Unit: compile-time resolution (global, shadowed, undeclared), reactivity
    across files.
  - E2E: a user component writes a global that `App` reads.
- **Reference:** `pages/scoping.md`, `pages/globals.md`, `pages/app-globals.md`.

### Step 22: Forms ✅ (client side)

Plan: [poc-22-forms.md](poc-22-forms.md). No `FormItem`: inputs bind through the
`formBinding` and `validation` behaviors. Step 22 is the client side;
step 22B (inserted) is submission and server errors.

- **Subject:** `Form`, `bindTo` on any input with a value API, `$data`,
  declarative validation with severities and late display, `onValidate`,
  dirty tracking, reset, and a validating submit through `onSubmit`.
- **Tests:**
  - Unit: the rules, display and error-shape tables; the store.
  - E2E: fill in, validate, submit (`test-apps/forms`).
- **Reference:** `pages/forms.md`.

### Step 22B: Forms, submission and server errors (inserted) ✅ (awaiting review)

- **Subject:** `submitUrl`/`submitMethod` through the step 20 data layer,
  `data` as a URL, `cancel()`, the server-error mapping onto inputs (RFC 7807
  `invalid-params`, Spring, Laravel, `issues`) and the summary; a playground
  Forms scenario with the routing guard using `isDirty()`.
- **Tests:** tables for the error shapes; E2E against the mock backend (422
  on the right inputs, a general error, a slow server).
- **Plan:** [poc-22b-forms-submit.md](poc-22b-forms-submit.md), part B of [poc-22-forms.md](poc-22-forms.md).

---

## Phase F: Components, in batches

**Step 31 (Tree, TileGrid, Items) ✅.** Plan and findings:
[poc-31-tree-tilegrid.md](poc-31-tree-tilegrid.md). The Tree on headless-tree
(its state controlled by the component) and the shared virtualizer, a working
copy of the data that a new value replaces, all of XMLUI's API; the TileGrid as
rows of tiles (measured against TanStack's lanes), prerendered as a CSS grid;
Items keyed by id (the user's choices). `Bound` now computes each binding apart.

**Step 30 (Table and Column) ✅.** Plan and findings:
[poc-30-table.md](poc-30-table.md). Our own column model, Columns compiled to
data, a grid of divs with table roles (measured against a native `<table>`),
all 45 typed values with `Value`, edited cells saved through the variable,
`Pagination` moved here (the user's choices).

**Step 29 (the virtualized List) ✅.** Plan and findings:
[poc-29-list.md](poc-29-list.md). TanStack Virtual, measured against virtua
in a prototype; everything but paging and the data-refresh modes;
`syncWithVar` resolved at compile time; the first window prerendered;
`availableGroups` filters (the user's choices).

**Step 28 (structure) ✅.** Plan and findings:
[poc-28-structure.md](poc-28-structure.md). Tab and step headers compiled to
data with the content in place, our own Splitter, `$overflow` per child,
CSS-sticky StickyBox (the user's choices).

**Step 27 (overlays and menus) ✅.** Plan and findings:
[poc-27-overlays.md](poc-27-overlays.md). Mantine's Modal, Drawer, Menu,
Tooltip and `@mantine/notifications`; pointer handlers get a frozen snapshot,
and argument-free events declare no `$param` (the user's choices); the items
earlier steps deferred here (Form in a dialog, warnings, notifications).

**Step 26 (date and time) ✅.** Plan and findings:
[poc-26-dates.md](poc-26-dates.md). `@mantine/dates` in a lazy chunk;
XMLUI's string values (the user's choices).

**Step 25 (choice) ✅.** Plan and findings:
[poc-25-choice.md](poc-25-choice.md). Option children compile to data; Select
and AutoComplete are one component on Mantine's Combobox (the user's choices).

**Step 24 (inputs) ✅.** Plan and findings:
[poc-24-inputs.md](poc-24-inputs.md).

**Step 23 (text and display) ✅.** Plan and findings:
[poc-23-display.md](poc-23-display.md). Icons are Lucide (the user's choice)
behind a registry of XMLUI's names. Markdown is our own renderer on mdast in a
lazy chunk (prerendered and hydrated), with an HTML allowlist; `@{…}` is
compiled.

Each batch: wrap or build the components listed in the *Component
implementation map* (architecture.md), with unit tests per component and
E2E tests for interaction-heavy ones.

| Step | Batch | E2E needed for |
|------|-------|----------------|
| 23 ✅ | Text and display: `Text`, `Heading`, `Link`, `Icon`, `Image`, `Avatar`, `Badge`, `ProgressBar`, `Spinner`, `ContentSeparator`, `Card`, `Markdown` | `Link` navigation, `Markdown` rendering |
| 24 ✅ | Inputs: `TextBox`, `PasswordInput`, `TextArea`, `NumberBox`, `Checkbox`, `Switch`, `RadioGroup`, `Slider`, `ColorPicker` | Keyboard input, form binding |
| 25 ✅ | Choice: `Select`, `AutoComplete`, `Option` | Search, multi-select, keyboard |
| 26 ✅ | Date and time: `DateInput`, `DatePicker`, `TimeInput` | Calendar interaction, locale |
| 27 ✅ | Overlays and menus: `ModalDialog` (declarative and imperative), `Drawer`, `DropdownMenu`, `SubMenuItem`, `ContextMenu`, `Tooltip`, `toast()`, `confirm()` | Focus trap, Escape, outside click |
| 28 ✅ | Structure: `Tabs`, `ExpandableItem`, `Stepper`, `Splitter`, `ScrollViewer`, `StickyBox`, `StickySection`, `ResponsiveBar` | Resizing, sticky, overflow |
| 29 ✅ | **Virtualized `List`** (also decides the virtualizer: TanStack Virtual) | Scrolling, bottom anchoring, dynamic heights, grouping, selection |
| 30 ✅ | **`Table` + `Column`** (our own column model; `Value`, `Pagination`) | Sorting, selection, resizing, pinning, pagination, editable cells |
| 31 ✅ | `Tree`, `TileGrid`, `Items` (`Pagination` moved to step 30) | Virtualized scrolling |
| 32 ✅ | Remaining: `QRCode`, `IFrame`, `MediaPlayer`, `TableOfContents`, `Bookmark`, `SkipLink`, `LiveRegion`, `FocusScope`, `Logo`, `NoResult`, `ToneSwitch`, `ToneChangerButton`, non-visual components (`ChangeListener`, `Timer`, `Queue`, `MessageListener`, `Redirect`, `PageMetaTitle`; `AppState` removed) ([poc-32-remaining.md](poc-32-remaining.md)) | Accessibility, media, messages |
| 32B ✅ | Files: `FileInput`, `FileUploadDropZone`, files in script, multipart uploads, `FileUpload`/`FileDownload` (split from 32 by the user; [poc-32b-files.md](poc-32b-files.md)) | File drop, paste, upload |

---

## Phase G: Managed React hardening

| Step | Subject | Reference |
|------|---------|-----------|
| 33 | Structured errors: `AppError`, `<Fallback>`, `<RetryPolicy>`, `App onError` (plan: [poc-33-errors.md](poc-33-errors.md)) ✅ | `pages/managed-react/structured-exception-model.md` |
| 34 | Internationalization: locale bundles, ICU messages, formatters, RTL (plan: [poc-34-i18n.md](poc-34-i18n.md)) ✅ | `pages/managed-react/i18n-foundations.md` |
| 35 | Observability: trace stream emitted only when enabled, pointing at markup lines | `pages/managed-react/observability-substrate.md` |
| 36 | Reactive cycle detection, versioning diagnostics, centralized HTTP, UDC sandbox | the matching `pages/managed-react/*.md` |
| 37 | Enforced accessibility checks | `pages/managed-react/enforced-accessibility.md` |
| 38 | Defended routing: per-`Page` guards, route and query constraints (`int`, `enum(...)`, `min`/`max`), nested pages (moved from step 21) | `pages/managed-react/defended-routing.md` |

---

## Open questions

1. Confirm the step-0 toolchain (TypeScript, npm workspaces, Vite, Vitest,
   Playwright, React 19) and the package split.
2. Is the phase order right? In particular, delivery modes (phase C) come
   before the component model (phase D), so that standalone mode, build
   mode and static generation constrain the design early.
