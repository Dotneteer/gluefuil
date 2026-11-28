# Step 35: observability

**Status:** Done (accepted 2026-11-28)

Phase G's third step ([poc-steps.md](poc-steps.md) row 35): a trace stream
emitted only when enabled, pointing at markup lines. Reference:
`website/content/docs/pages/managed-react/observability-substrate.md`.

## Goal

```
#1  12:04:31.210  handler    Button "Save" onClick         Main.gui:14:5   trace 4bf9…  38 ms  ok
#2  12:04:31.211  state      editing.name  "Ada" → "Ada L." Main.gui:3:3   trace 4bf9…
#3  12:04:31.214  fetch      PUT /api/users/7  204  21 ms  users.gui:8:3   trace 4bf9…
#4  12:04:31.236  fetch      GET /api/users    200  9 ms   Main.gui:5:3    trace 4bf9… (caused by #2)
#5  12:04:31.240  diagnostic Table: the 'id' values must be unique …        Main.gui:22:7
```

When tracing is on, the framework records what happens: handlers, the
variables they change, requests, navigations, errors, diagnostics, and
`console` calls from script. Each entry has the markup position it came
from and the trace of the user action that caused it. When tracing is off,
nothing is built or recorded. A developer reads the stream in an Inspector,
exports it as JSON, or subscribes to it from code.

## Background

### XMLUI

**The documented model** (`pages/managed-react/observability-substrate.md`,
`audit-grade-observability.md`):

- Every interesting event goes into "a single, structured trace" through
  `pushXsLog()`, a circular in-memory buffer, with a well-known `kind`
  (`app:fetch`, `navigate`, `clipboard:copy`, `ws:connect`, `sandbox:warn`,
  `log:info`, `reactive-cycle`).
- Each entry has its kind, a timestamp, "source location (if known)" and a
  payload. The Inspector overlay shows the stream live and filters it by
  kind.
- With `xsVerbose`, `render:pass` entries record each container's re-render:
  its causes (`state`, `loader`, `props`, `parent`, `mount`, `unknown`), what
  it rendered and how long it took. `xsVerboseLogMax` sizes the buffer.
- The audit pipeline (`audit-grade-observability.md`) redacts, scans for PII,
  samples, injects a W3C `traceparent` into every fetch, and forwards entries
  to an OTLP/JSON sink, with strict mode on by default.

**The source** (`xmlui/src/components-core/inspector/`, `components-core/audit/`;
a separate research pass, with the strongest claims checked again):

- **Enablement.** The switch is `xmluiConfig.xsVerbose`, or the
  `localStorage` key `xmlui:xsVerbose` (`StandaloneApp.tsx` lines 487–499).
  `AppContent.tsx` lines 1143–1168 then creates `window._xsLogs`, and
  `pushXsLog` does nothing when that array doesn't exist
  (`inspectorUtils.ts` lines 393–397).
  - The cost when it is off is **not zero**, despite
    `xmlui/dev-docs/guide/19-inspector-debugging.md`.
  - Handlers, loaders and render passes check `xsVerbose` first. `Log`,
    `App.*`, WebSocket, forms and the concurrency checks build their entry
    and then let `pushXsLog` discard it.
- **The entry** (`XsLogEntry`, `inspectorUtils.ts` lines 237–373):
  - Every field is optional except `ts`, and any extra key is allowed.
  - Payload fields sit at the top level.
  - A change is stored four times (`before`/`after`, `beforeJson`/`afterJson`,
    `diffText`, `diffPretty`).
  - About 60 kinds are emitted. `build` and `state:part:changed` are
    documented but never emitted (`state-logging.ts` is imported nowhere).
- **The buffer is not a ring.**
  - It holds 200 entries by default (`AppContent.tsx` line 1144).
  - Once it is full, every push repartitions and re-sorts the whole array to
    keep the "preserved" kinds (`splicePreservingInteractions`,
    `inspectorUtils.ts` lines 446–481). Preserved entries alone can grow
    past the limit.
  - Every entry is deep-copied through JSON (`safeClone`), whole API
    responses and native events included.
- **Locations.** The parser attaches offsets (`debug.source`), and the viewer
  resolves them against `window._xsSources`.
  - Handlers get the *container's* location when the attribute's isn't
    known (`handler-logging.ts` lines 318–333).
  - Variables sometimes get a file guessed by fuzzy-matching names
    (`variable-logging.ts` lines 163–186).
  - API, navigation, log and toast entries have no location.
- **Trace IDs.**
  - They come from a module-global stack mirrored in
    `window._xsCurrentTrace` (`inspectorUtils.ts` lines 551–598), plus a
    2-second "last interaction" window (`handler-logging.ts` lines 264–280).
  - `popTrace` pops the top of the stack, not its own ID, so concurrent async
    handlers pop each other's IDs. A cancelled handler pops twice
    (`event-handlers.ts` lines 806–807 and 841).
  - The W3C half is never connected: `withSpan` has no caller, so
    `injectTraceparent` (`RestApiProxy.ts` lines 674–682) never adds a header.
    The docs promise it on every fetch.
- **Variables.** `StateContainer.tsx` lines 429–442 creates a new variable
  logger on every effect run, so `prevVarsRef` (`variable-logging.ts` line
  120) is always null. Every update is logged as `component:vars:init`, and
  `component:vars:change` never appears.
- **No limits and no redaction in the buffer.**
  - Handler arguments, full request and response bodies, and variable values
    are stored whole.
  - Interaction entries record the key and code of every keystroke, in
    password fields too (`AppContent.tsx` lines 1470–1480).
  - Redaction exists only on the audit sink's path (`inspectorUtils.ts`
    lines 426–435).
- **The audit pipeline needs `xsVerbose`.** No buffer means no sink, so a
  production audit trail pays all of the Inspector's costs.
  - Its api-key heuristic (`heuristics.ts`) matches relative URLs and file
    paths, so in strict mode (the default) most `api:*` entries are dropped.
  - Retention settings are stored but never read.
  - The OTLP sink sends *logs* (the docs' example is `/v1/traces`) with
    trace IDs that are not 32 hex digits.
- **The Inspector** (`components/Inspector/InspectorReact.tsx`) is an icon
  that opens an iframe (`website/public/xmlui/xs-diff.html`). The iframe
  reads `window.parent._xsLogs` directly: same origin, same main thread.
  - It polls every 250 ms and redraws only when `logs.length` changes
    (lines 7354–7362), so it freezes once the buffer is full.
  - It exports JSON and replays a saved trace.
- **For apps:**
  - `Log.debug/info/warn/error` writes entries and mirrors them to the
    console (`appContext/log.ts`).
  - `App.mark` and `App.measure` are available.
  - Apps cannot read or subscribe to the trace.

### Here

- **Error pipeline (step 33).** `runtime/src/errors/report.ts` has
  `reportRuntimeError(error, source)` with `ErrorSource` and sinks, and
  `reportDiagnostic(problem)`, which only calls `console.warn`. It has 12
  callers:
  - the List, Table and Tree duplicate-id and column diagnostics;
  - Form;
  - the seven i18n diagnostics in `runtime/src/i18n/` (an invalid locale, a
    bundle that failed to load, a missing key, an ICU error).
  - `plan/poc-33-errors.md` says "step 35 will give them a trace".
- **Handlers.** `render/handlers.ts` runs every handler through
  `HandlerSlot`, which already knows the outcome: done, error, cancelled
  with a reason, dropped by the policy, or timed out. `currentInvocation()`
  is set for each synchronous segment (`open`/`close` around every
  `await`).
  - An entry made inside a handler can therefore find its handler with no
    global stack and no time window. This is the explicit context XMLUI
    lacks.
- **Variables** are created by `useScope` (`render/elements.ts` line 195),
  which knows their names. `VariableNode.set` is the single write path
  (`reactivity/variable.ts`).
- **The HTTP gate.** All DataSource, APICall, upload and download traffic
  goes through `sendRequest` (`data/http.ts`), with `correlationId` read
  from `x-correlation-id` (step 33).
  - A DataSource refetch caused by a write starts in a React re-render after
    the handler's segment has closed, so `currentInvocation()` is empty
    there.
- **Navigation.** `navigate` and the guards are in `render/router.ts`.
- **Source maps (step 9,** [`docs/source-maps.md`](../docs/source-maps.md)).
  Every expression, statement and element maps to its `.gui` line, but only
  inside the source map. The emitted code carries no position. For example,
  `$$h($$Bound, { type: $$C_Button, bindings: $$b1, handlers: $$e2, scope: $$c })`
  has no location, so a runtime entry can't name a line without one.
- **Build modes.** Nothing in the runtime checks `import.meta.env.DEV`; the
  same runtime runs in dev, production builds and standalone mode.
- **Script** may call `console` (`compiler/src/codegen/names.ts` line 27).

## Options considered

Measured in `.tmp/vproto/obs/` (Node 22 and Chromium through Playwright;
`size.ts`, `cost.ts`, `measure.mjs`, `thread.mjs`).

### A. How tracing is switched on

The constraint: when tracing is off, no entry is built. Every emitting
site is `if (tracing) emit(...)`, with one module-level boolean.

| Mode | µs per handler call (a handler that writes one variable, through `HandlerSlot`) |
|---|---|
| no instrumentation | 0.90–0.95 |
| instrumented, tracing off | 0.86–0.88 (within noise) |
| tracing on (two entries with value previews, into a ring) | 0.99–1.03 |

1. **On by default on the dev server; off in builds and standalone mode,
   where a URL parameter, a stored setting or a call turns it on**
   *(recommended)*.
   - The Vite plugin's dev server turns it on, so a developer always has a
     trace.
   - In a build or in standalone mode, any of these turns it on: `?gfui-trace`
     in the URL (remembered for the tab in `sessionStorage`),
     `localStorage["gfui.trace"]`, or `gfui.trace.enable()` from the console.
   - It is the visitor's own browser and memory, so the switch is safe to
     leave in production.
2. **Off everywhere until turned on,** dev included.
3. **Compiled out of production builds:** zero bytes, but no trace can be
   taken from a deployed app.

### B. How an entry points at a markup line

1. **Locations compiled into the module, always** *(recommended)*.
   - Each element with bindings, handlers or an `id`, and each variable
     definition, carries a compact position (`at`), plus one file-name
     constant per module.
   - Entries name the line in every mode (dev, build, standalone) without a
     source map at runtime.
   - Measured on the playground (77 modules, 913 located elements):

     | Encoding | compiled code | gzipped |
     |---|---|---|
     | none (today) | 465.1 KiB | 60.8 KiB |
     | `at: "12:5"` | 479.8 KiB | 64.4 KiB |
     | `at: 12293` (packed line and column) | 475.5 KiB | 63.9 KiB |
     | `at: 7` (index into a table per module) | 478.8 KiB | 64.0 KiB |

   - About +3.2–3.6 KiB gzipped for the whole playground: under 1% of its
     365 KiB gzipped eager bundle.
2. **Only when the plugin compiles with tracing (dev).** Build traces would
   name the component, its `id` and the event, but no line.
3. **Resolved at runtime from stack traces and source maps.** This needs
   the map shipped, a stack captured per entry and asynchronous resolution.
   Rejected.

### C. Values in entries

XMLUI stores everything whole, keystrokes in password fields included.

1. **Bounded previews, with secrets masked** *(recommended)*.
   - A preview has at most 40 nodes, depth 2, and strings cut at 80
     characters, with "…98 more" markers.
   - Measured on 10,000 rows: `JSON.stringify` 974 µs, the bounded preview
     0.5 µs (377 characters).
   - Masked: the values of `PasswordInput` and `TextBox type="password"`
     (the value is recorded as `"•••"`), and the `Authorization`, `Cookie`
     and `Set-Cookie` headers.
   - Keystrokes are never recorded: an entry records the handler, not the
     key.
2. **No values:** names, kinds and sizes only (`Array(10000)`). The
   safest choice, but a state change can't show what it changed to.
3. **Full values (XMLUI's):** memory grows with the data, the export holds
   whatever the app handled, and a deep copy costs milliseconds per entry.

### D. Where the Inspector runs

The workload is 1,000 entries/s in bursts of 10 every 10 ms, for 3 s,
three runs each, in Chromium. The table shows the cost on the app's main
thread.

| Viewer | µs per entry emitted | viewer work on the app's thread |
|---|---|---|
| none (ring buffer only) | 0.72 | 0 |
| other window, `BroadcastChannel`, a message per entry | 4.53 | 0 |
| other window, `BroadcastChannel`, a batch per frame | 0.53 | 1.3 ms/s (0.02 ms/frame) |
| in-page overlay, plain DOM, last 60 rows per frame | 1.46 | 9.7 ms/s |
| in-page overlay, React with TanStack Virtual | 1.12 | **144.6 ms/s (2.4 ms/frame)** |

Does another window share the app's main thread? In this test, the viewer
busy-looped for 1.5 s while the app measured its worst timer lag:

| Viewer window | app's worst lag |
|---|---|
| another tab (no opener) | 1 ms |
| `window.open` with an opener (as XMLUI's same-origin iframe) | **1,491 ms** |
| `window.open(…, "noopener")` | 1 ms |
| the same page (control) | 1,490 ms |

1. **A separate Inspector page, fed over `BroadcastChannel` in one batch per
   frame, opened with `noopener`** *(recommended)*.
   - It runs on its own thread: the measured cost to the app is 1.3 ms per
     second.
   - Its own renders never show up in the app's trace.
   - It survives the app's reloads, so it can show a trace across a reload.
   - The dev server serves it at `/__gfui/inspector`; standalone mode serves
     `gfui.js` with `?gfui-inspector`. In a build it is opt-in (a plugin
     option).
   - It is written in `.gui` markup with our own components (`Table`,
     `Select`, `TextBox`): the framework inspecting itself.
2. **An in-page panel or iframe (XMLUI's).** It shares the app's thread
   (2.4 ms per frame with React), and its renders are part of what it
   measures.
3. **No Inspector UI in this step:** the API, the console and the JSON
   export, plus a viewer scenario in the playground. The page comes later.

### E. Audit features (redaction rules, sampling, OTLP sinks, `traceparent`)

1. **Not in this step** *(recommended)*.
   - IDs are W3C-shaped (32 and 16 hex digits) and entries are typed, so an
     OTLP exporter can be added later without a schema change.
   - `trace.subscribe(fn)` is the sink hook an app or a later step can use.
   - No `traceparent` header: a custom header on a cross-origin request
     costs a CORS preflight.
2. **`traceparent` now, opt-in per App** (`<App traceHeaders>`), same-origin
   only by default.
3. **XMLUI's audit pipeline now** (policies, redaction, PII heuristics,
   sampling, OTLP and custom sinks). That is a step of its own in size.

### F. Render entries

1. **One entry per re-render of an element, in a `render` category that is
   off unless asked for** (`gfui.trace.enable({ render: true })`)
   *(recommended)*.
   - The entry gives the element, its position, the bindings that changed and
     the traces that caused them (below).
   - Re-renders of one commit are grouped, so "this click re-rendered 12
     elements" is one row in the Inspector.
   - Our unit is the element (`Bound`) because each element has one
     subscription. XMLUI's unit is the container.
2. **XMLUI's container passes** (`render:pass` with causes and folding). We
   have no state containers to report.
3. **No render entries in this step.**

## Design

### The trace core (`runtime/src/trace/`)

- **`trace.ts`:**
  - the switch, a module-level `tracing` boolean;
  - the ring buffer: a fixed array and a head index, O(1) per entry,
    default 5,000 entries, sized by `enable({ size })`. The oldest entries
    go first, nothing is "preserved", and a `dropped` count is kept;
  - `emit(entry)`, which stamps `seq` and `t` (`performance.now()` plus a
    wall-clock origin);
  - subscribers notified once per animation frame, in a batch;
  - `entries()`, `clear()`, and `export()` (versioned JSON with the app's
    files and a schema version).
- **`entries.ts`:** a discriminated union, one interface per kind with
  typed fields. A test checks that every kind has an emitter and a row in
  the docs, which is XMLUI's drift turned into a test.
- **`preview.ts`:** bounded previews and masking (option C1).
- **`ids.ts`:** trace and span IDs from `crypto.getRandomValues`, made only
  while tracing.
- **The public API:**
  - `import { trace } from "@gluefuil/runtime"`;
  - in standalone mode, `gfui.trace`;
  - `enable(options)`, `disable()`, `enabled`, `entries()`, `subscribe(fn)`,
    `clear()`, `export()`.
  - Script gets no read access to the trace; XMLUI's apps can't read it
    either.

### The entries

| Kind | Emitted by | Fields (besides `seq`, `t`, `traceId`, `spanId`, `at`) |
|---|---|---|
| `handler` | `HandlerSlot` at the end of each call (one entry with the start time) | component, `id`, event, policy, outcome (`ok`, `error`, `cancelled:<reason>`, `dropped`, `queued`, `timeout`), duration, an argument preview |
| `state` | `VariableNode.set` (when tracing, the scope gives each variable its name and position) | variable, file, before and after previews |
| `fetch` | `sendRequest`: one entry at the start, one at the end, joined by `spanId` | method, URL, owner (`DataSource`/`APICall` with `id` and `at`), attempt, status, duration, `correlationId`, outcome (`ok`, `http`, `network`, `timeout`, `cancelled`, `circuit-open`), `causes` |
| `navigate` | the router | from, to, outcome (`done`, `cancelled by guard`, `redirect`), the guard's duration |
| `error` | `reportRuntimeError` and the element-level `onError` path | the AppError's fields, `source`, who handled it (`onError`, `Fallback`, `App onError`, default) |
| `diagnostic` | `reportDiagnostic` (one call site change: an optional `{ category, at }`) | message, category (`i18n`, `data`, `hydration`, `component`) |
| `log` | `console.*` called from script while tracing | level, argument previews (the console still prints) |
| `render` | `Bound` (option F1, only with `render: true`) | element, changed bindings, `causes` |

The cost when tracing is off is one boolean check at each of these sites.

### Traces and causes

- **A trace** is one user action: a handler call that no other handler
  started.
  - Its handler entry gets a new `traceId`.
  - A handler started from inside it (a method, `emitEvent`, an
    `onSuccess`) gets a child `spanId` in the same trace.
  - The `Invocation` carries both, so this holds across `await` with any
    number of concurrent handlers: no global stack and no time window.
- **A write inside a segment** records the current invocation's trace. The
  variable remembers the trace of its last write (one field, set only while
  tracing).
- **Causes across a re-render.** While tracing, a binding evaluation collects
  the last-write traces of the variables it reads.
  - A DataSource whose `url` binding read `filter` gets `filter`'s trace as
    the fetch's `causes`.
  - A `render` entry gets its causes the same way.
  - The causes are found by tracking what was read, not by timing. This is
    to be proven in the implementation's first step. If it fails, the
    fallback is the most recent trace, marked `inferred`.
- **Outside any trace:** a mount, a timer, a poll or a navigation from the
  URL starts its own trace (`origin: "mount" | "timer" | "poll" | "url"`).

### Markup positions (option B1)

- **The compiler** adds `at` to each `Bound`/`BoundUser` element that has
  bindings, handlers, an `id` or lifecycle handlers, and to each variable
  definition, plus one `$$file` constant per module. Elements with nothing
  dynamic stay as they are.
  - The encoding is the one the implementation measures smallest; the table
    above gives a 0.5 KiB spread.
- **The runtime** passes `at` to `HandlerSlot` and the variable, and to
  `Loader`/`ApiCaller` (a fetch's owner). Components that report diagnostics
  (List, Table, Tree, Form) receive their element's `at` as a prop, through
  a metadata flag (`diagnosticAt`), so the duplicate-id diagnostics name
  their line.
- **The Inspector** opens the line in the editor on the dev server through
  Vite's `/__open-in-editor`, the same mechanism as Vite's error overlay. In
  builds it shows `file:line:column`.

### The Inspector (option D1)

- **A `.gui` app** that reads the stream from a `BroadcastChannel`. It is
  served at `/__gfui/inspector` by the plugin's dev server, by a build when
  the plugin's `inspector: true` option is set, and in standalone mode
  through `gfui.js?gfui-inspector`.
- **Features:**
  - a virtualized table (seq, time, kind, element and position, summary,
    duration);
  - filters by kind, trace, element and text;
  - one trace's entries as a tree of handler, writes, fetches and renders;
  - the details of an entry;
  - pause, clear, export, and import of a saved JSON.
- **The app** answers a hello on the channel with its buffer, so an
  Inspector opened later shows the past as well. When several apps are open,
  the channel name includes the app's origin and the tab's ID.
- **Opening it:** `gfui.trace.inspect()` from the console, or
  Ctrl+Shift+` on the dev server, opens it with `noopener`.

### Divergences from XMLUI (proposed)

| XMLUI | Here |
|---|---|
| Building an entry costs something even when tracing is off in several subsystems | One boolean check per site; no entry is built |
| Open-ended entries (`[key: string]: any`); documented kinds never emitted | A typed union; a test checks emitters and docs |
| A 200-entry array re-sorted on every push once full; "preserved" kinds grow without limit | An O(1) ring of 5,000, with a `dropped` count |
| Full deep copies of every value, responses and keystrokes included; redaction only on the sink's path | Bounded previews; passwords and auth headers masked in the buffer itself; no keystrokes |
| Trace IDs from a global stack and a 2-second window; wrong with concurrent async handlers | The `Invocation` carries the trace; causes found from tracked reads |
| W3C IDs and `traceparent` documented, never wired | W3C-shaped IDs; no header (option E) |
| Locations only on some kinds, sometimes guessed | Every entry with an element or variable has its exact position |
| An iframe on the app's thread, reading `window.parent` | A separate page over `BroadcastChannel` (option D) |
| `Log.*`, `App.mark`, `App.measure` | `console.*` in script is traced; no new globals |
| Render passes per container | Optional render entries per element (option F) |

## Steps

- [x] Prototype of causes from tracked reads, the risky part, in the real
      store: a write in a handler, then a DataSource refetch and a render
      attributed to it.
- [x] The trace core (`runtime/src/trace/`): the switch, the ring, entries,
      previews and masking, IDs, the API; `gfui.trace` in standalone mode.
- [x] The compiler: `at` (a location table, `$$L`) on located elements and variables;
      `diagnosticAt`; the size measured on the playground and the hello
      build.
- [x] Emitters: handlers (spans in the `Invocation`), state, fetch,
      navigation, errors, diagnostics (with their categories and
      positions), `console`, render.
- [x] Enablement: the dev server on by default, `?gfui-trace`, the stored
      setting.
- [x] The Inspector page; the plugin's route; standalone's
      `?gfui-inspector`; opening it and jumping to the editor.
- [x] Unit tests, a playground scenario, E2E.
- [x] Docs: `code-structure.md`, a new `docs/observability.md`, `errors.md`,
      `source-maps.md` and `i18n.md` where they change; *Decisions* in
      `AGENTS.md`.
- [x] `npm run check`; the bundle size; the benchmarks (a handler call and a
      render, with tracing off and on).

## Verification

- **Unit tables:**
  - one row per kind: the action, the entry and its fields;
  - the ring (wrapping, `dropped`, size);
  - previews and masking (passwords, headers, depth, size);
  - the IDs: a child span inside one trace, concurrent async handlers kept
    apart, cancellation and policies giving the right outcome;
  - causes (a refetch and a render attributed to their write);
  - the docs and kinds drift test.
- **Off means off:** with tracing off, a test counts the objects the
  emitters allocate (a spy on `emit` and on the preview function) and
  expects zero. A benchmark compares a handler call and a re-render with
  tracing off and with no instrumentation.
- **The compiler:** the `at` values against `markup.slice` (as the source-map
  tests do); E-codes unchanged; the size.
- **jsdom:**
  - a Button click traced end to end (handler, state, a fetch to the mock
    backend, the refetch it caused, the render);
  - the duplicate-id and i18n diagnostics with their positions;
  - an error traced with who handled it.
- **E2E:**
  - in the playground on the dev server, click, open the Inspector page, and
    see the trace live (filter, a trace tree, export, import);
  - a production build with `?gfui-trace`;
  - with tracing off, no entry and no channel;
  - the app's frame timing unchanged while the Inspector is open.

## Outcome

- **The runtime** (`runtime/src/trace/`):
  - the switch (`tracing`, one boolean) and the ring (5,000 entries, O(1),
    `dropped`);
  - eight typed kinds: `handler`, `state`, `fetch`, `navigate`, `error`,
    `diagnostic`, `log`, `render`;
  - previews and masks;
  - W3C-shaped IDs, from a random pool;
  - subscribers, batched every 50 ms;
  - the export (`gfui-trace`, version 1);
  - the `BroadcastChannel` bridge;
  - `trace` (the API) and `autoEnableTrace`.
- **The emitters:**
  - `HandlerSlot`: an `Invocation` carries its trace; a call inside another
    handler's segment is a child span;
  - variables (state entries and write marks);
  - the HTTP gate (`FetchOrigin`: owner, span, causes, attempt), Loader,
    ApiCaller, uploads and downloads;
  - the router;
  - the error pipeline, an element's `onError` and `Fallback`;
  - `reportDiagnostic(problem, { category, at })`;
  - script's `console`;
  - `Bound` (render entries).
- **Causes from tracked reads:**
  - the store keeps write marks (`markWrite`, `lastWrite`); a computed keeps
    the newest one among what it read;
  - `Bound` sees which bindings changed and why;
  - a traced component's cell hands the causes to its next fetch;
  - loader, API call and navigation results are marked too.
- **The compiler:**
  - one location table per module (`$$L`, `locationFile`);
  - `at` on located elements, text and variables;
  - `traced` (Form, DataSource, APICall, List, Tree, Table) and `sensitive`
    (PasswordInput, a password TextBox) from the metadata;
  - traced components always render as a `Bound`.
- **The Inspector** (`@gluefuil/inspector`, a new package):
  - `Inspector.gui` on our own components, with one React component,
    `TraceFeed`, and a tested model;
  - served by the dev server at `<base>__gfui/inspector/`, by a build with
    `inspector: true` (a virtual input), and by standalone mode at the app's
    page with `?gfui-inspector`;
  - it never traces itself (`mountApp(…, { trace: false })`).
- **The plugin:**
  - `inspector` option;
  - the root container's `data-gfui-trace` and `data-gfui-inspector`, so no
    inline script is needed and a strict CSP is unaffected;
  - the dev route; the Inspector's own markup compiled with `TraceFeed`;
  - `locationFile` from the Vite root.
- **The playground:** "Tracing" (59 scenarios), with `TraceControls` (an app
  React component: on and off, render entries, the Inspector).
- **Evidence:** `npm run check` passes and prints no warnings: 3,711 unit
  tests in 138 files, 318 E2E tests. New:
  - `runtime/tests/trace/` (59: core, causes, emitters);
  - `compiler/tests/module/locations.test.ts` (14);
  - `components/tests/trace.test.tsx` (7);
  - `inspector/tests/model.test.ts` (27);
  - `vite-plugin/tests/inspector.test.ts` (10, and 5 in `prerender.test.ts`);
  - `tools/trace-kinds.test.ts` (10);
  - `e2e/trace.spec.ts` (7; 70 of 70 under `--repeat-each=10 --workers=8`);
  - `e2e/trace-build.spec.ts` (2);
  - one more in `e2e/standalone.spec.ts`.
- **Cost** (`runtime/bench/trace.bench.tsx`; master's code measured the same
  way in a worktree):

  | | Master | Off | On |
  |---|---|---|---|
  | A handler call that writes a variable (Vitest's runner) | 0.45 µs | 0.50 µs | 1.2 µs |
  | The same, in an esbuild bundle in Node | 563–577 ns | 575–593 ns | |
  | 100 elements re-render after one write | 0.52–0.61 ms | 0.54–0.57 ms (within noise) | 0.54 ms; 0.56 ms with render entries |

- **Size** (against a build of `master`):
  - the hello app's eager JavaScript: 1,314 → 1,328 KiB (365 → 371 KiB
    gzipped), from the trace runtime and the location tables;
  - `gfui.js`: 1,789 → 1,817 KiB (507 → 517 KiB gzipped), with the Inspector
    bundled for `?gfui-inspector`;
  - the Inspector page is a chunk of its own in a build with
    `inspector: true`.

### Findings

- **Causes from tracked reads work as designed.** The first test passed as
  written: a write in a handler is named by a refetch and by re-renders that
  run after the handler's segment closed, through a computed in between, and
  an unchanged dependency is never a cause. In the browser, typing in the
  playground's search shows the people fetch "caused by #5", the TextBox's
  write.
- **"Off costs nothing" needed work.**
  - The first version cost about 0.3 µs per element re-render, from two extra
    `useMemo` hooks in `Bound`, and about 50 ns per handler call, from a
    try/finally and the active-trace updates.
  - Now `Bound` keeps one ref that stays empty while off; the handler runtime
    touches the trace only while tracing; `disableTrace` clears the active
    trace.
  - What remains is 15–20 ns per handler call in a bundle (2–4%); renders
    are within noise.
  - Under Vitest's runner the gap looks larger: each read of an imported
    binding is an export getter there.
- **Trace IDs dominated the traced cost.** `crypto.getRandomValues` with a
  new array per ID made a traced handler call 3.3 µs; drawing from a 4 KiB
  pool made it 1.2 µs.
- **The Inspector must not trace itself.** `localStorage["gfui.trace"]`
  applies to the whole origin, so the Inspector would have broadcast its own
  entries to itself. Hence `MountOptions.trace: false`.
- **The Select's `initialValue` is read once.** The source picker follows
  the feed through a `ChangeListener` and `setValue`.
- **Spaces don't indent in HTML cells.** The trace tree marks each level
  with `· `.
- **Playwright matches `hasText` against `textContent`,** where table cells
  run together ("stateq"), so `\b` patterns don't match; the specs avoid
  them. The Table is virtualized: a row far down is found after filtering.
- **A standalone page can be its own Inspector:** the engine has the
  compiler, so `?gfui-inspector` compiles the bundled markup in the browser.
- **One full `npm run check` failed three timing-sensitive playground tests**
  (two in `errors.spec.ts`, one upload in `files.spec.ts`). They passed alone,
  65 of 65 under `--repeat-each=5 --workers=8`, in a whole-project run, and
  in two later full checks. It was the first E2E run after the new package
  and scenario; a cold dev server is the likely cause, not proven.

### Deviations from this plan

- **`at` is a table per module** (`const $$L = $$locations(file, […])`;
  elements pass `at: $$L[i]`), not a `$$file` constant beside each
  position. One prop, frozen objects made once; measured as cheap as the
  index-and-table encoding.
- **No request or response bodies, and no headers, are recorded** (the plan
  said to mask the auth headers). Nothing to mask, nothing to leak.
- **No `queued` handler outcome:** a queued call records its entry when it
  runs. `timeout` is `cancelled` with the reason `timeout`.
- **The render group is a synchronous run** (closed by a microtask), not a
  React commit.
- **The Inspector's "Open file:line"** works on the dev server only: a
  build's page has no project root.
- **No keyboard shortcut opens the Inspector** (the plan named
  Ctrl+Shift+`): the playground's "Open the Inspector" button and
  `trace.inspect()` from the console do. A shortcut in every app is the
  user's decision (it takes a key from the app).
- **No `origin` field** on traces that start on their own (a mount, a poll,
  a URL): they get a new trace, without saying why. Left for later.
- **One channel per origin** (`gfui-trace`), not one per app: the Inspector
  tells the tabs apart by their source id.

### Open for later steps

- XMLUI's audit features: redaction rules, sampling, OTLP and custom sinks,
  `traceparent` (decision 5). `trace.subscribe()` is the hook.
- Toggling render entries from the Inspector (a message back to the app).
- Entries for theme changes, locale switches and toasts; timers' and polls'
  own origins (`origin: "timer" | "poll"`).
- Trace replay and tests generated from a trace (XMLUI's Inspector has both).

## Open questions

None: A–F are under *Decisions*. Proposed without asking (say if you want otherwise):

- A ring of 5,000 entries by default.
- `console.*` in script traced; no `Log` global, so XMLUI's `Log.info`
  remains an unknown name.
- The Inspector written in `.gui` markup.
- A JSON export with a schema version and the app's file names.
- Diagnostics gain an optional category and position; their console output
  is unchanged.

## Decisions (asked 2026-11-28)

1. **Enablement** (option A1): on by default on the Vite dev server; in
   builds and standalone mode, turned on by `?gfui-trace`,
   `localStorage["gfui.trace"]` or `gfui.trace.enable()`. Off means one
   boolean check per site and no entry built.
2. **Positions** (option B1): compiled into every module, always, on
   located elements and variable definitions.
3. **Values** (option C1): bounded previews; password values and the
   `Authorization`/`Cookie`/`Set-Cookie` headers masked in the buffer;
   no keystrokes.
4. **The Inspector** (option D1): a separate `.gui` page fed over
   `BroadcastChannel`, one batch per frame, opened with `noopener`.
5. **Audit features** (option E1): deferred; W3C-shaped IDs, typed entries
   and `trace.subscribe()` now; no `traceparent` header.
6. **Render entries** (option F1): one per element re-render, with causes,
   only when `enable({ render: true })`.
