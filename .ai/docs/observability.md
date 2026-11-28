# Observability

Step 35 ([`../plan/poc-35-observability.md`](../plan/poc-35-observability.md)):
a trace stream that the framework emits only while tracing is on. Each entry
points at its markup line and names the user action that caused it. The
**Inspector** shows the stream in another tab.

| File | What |
|------|------|
| `runtime/src/trace/core.ts` | The switch (`tracing`, `renderTracing`), the ring (`emit`, `entries`, `clearTrace`, `droppedEntries`), subscribers (`subscribeTrace`, `flushTrace`), `exportTrace`, trace and span IDs (`newTrace`, `childSpan`, `traceFields`), the running segment's trace (`activeTrace`, `setActiveTrace`), the Inspector's URL. A leaf module: types only |
| `runtime/src/trace/entries.ts` | The entry kinds (`TRACE_KINDS`), one interface each (`HandlerEntry` … `RenderEntry`), `TraceContext`, `Cause` |
| `runtime/src/trace/location.ts` | `SourceLocation`, `locations(file, triples)` (a module's table), `formatLocation` |
| `runtime/src/trace/preview.ts` | `preview(value)` (bounded, JSON-safe), `MASK` |
| `runtime/src/trace/emitters.ts` | Entry builders: `traceError`, `traceDiagnostic`, `traceLog`, `traceState`; `renderGroup`, `uniqueCauses` |
| `runtime/src/trace/bridge.ts` | The app's side of the Inspector channel (`startBridge`; `TRACE_CHANNEL`, `BridgeMessage`) |
| `runtime/src/trace/index.ts` | `trace` (the API), `autoEnableTrace`, `TRACE_ATTRIBUTE`, `INSPECTOR_ATTRIBUTE`, `TRACE_PARAM`, `TRACE_STORAGE_KEY` |
| `runtime/src/reactivity/signals.ts` | Write marks: `markWrite`, `lastWrite`; a computed keeps the newest mark among what it read |
| `runtime/src/reactivity/variable.ts` | `variable(init, { name, at })`; `set` records a state entry and marks the write |
| `runtime/src/render/handlers.ts` | `HandlerSlot`'s fifth argument (`HandlerTraceInfo`: event, `at`, id, `sensitive`); an `Invocation` carries its trace; handler entries |
| `runtime/src/render/elements.ts` | `Bound`'s `at`, `sensitive`, `traced`; `TraceCell` and `takeCauses`; render entries; `VariableDefinition.at` |
| `runtime/src/data/http.ts`, `loader.ts`, `api-call.ts`, `transfer.ts` | `FetchOrigin` and `fetchContext`; fetch entries; a loader's or a call's result marked with its request |
| `runtime/src/render/router.ts` | Navigate entries; the location marked with the navigation |
| `runtime/src/errors/report.ts` | Error entries from the pipeline; `reportDiagnostic(problem, { category, at })` |
| `runtime/src/script/sandbox.ts` | Script's `console.*` traced |
| `runtime/src/render/mount.ts` | `autoEnableTrace(container)` before the first render; `MountOptions.trace: false` |
| `compiler/src/module/compile-module.ts` | The location table (`$$L`); `at`, `traced`, `sensitive` on elements; `at` on variables; `locationFile` |
| `components/src/metadata.ts` | `ComponentMetadata.traced` (Form, DataSource, APICall, List, Tree, Table) and `sensitive` (PasswordInput) |
| `components/src/data.tsx`, `list.tsx`, `table.tsx`, `tree.tsx`, `forms.tsx` | The `$$trace` cell: a fetch's owner and causes; diagnostics at their element's line |
| `components/src/errors.tsx` | A `Fallback` traces the errors it handles (`handledBy: "fallback"`) |
| `packages/inspector/` | The Inspector: `Inspector.gui`, `TraceFeed` (`feed.tsx`, metadata in `metadata.ts`), the model (`model.ts`), `main.tsx` |
| `vite-plugin/src/index.ts` | `inspector` option; the container attributes; `/__gfui/inspector/` on the dev server; the build's virtual page; compiling the Inspector's markup; `locationFile` |
| `standalone/src/inspector.ts`, `loader.tsx`, `index.ts` | `?gfui-inspector`; `gfui.trace` |

## Turning it on

- **The dev server** traces by default. The plugin writes
  `data-gfui-trace="on"` and `data-gfui-inspector="<base>__gfui/inspector/"`
  on the root container. `inspector: false` turns both off.
- **Elsewhere** (a build, standalone mode), any of these turns it on:
  - `?gfui-trace` in the URL, remembered for the tab in `sessionStorage["gfui.trace"]`;
  - `?gfui-trace=0`, which turns it off for the tab, the dev server's default included;
  - `localStorage["gfui.trace"] = "1"`;
  - `trace.enable()`, or `gfui.trace.enable()` in standalone mode.
- **`mountApp` and standalone** call `autoEnableTrace(container)` before the
  first render. `mountApp(…, { trace: false })` never traces: the Inspector
  uses it, because a stored setting applies to the whole origin.
- **`trace.enable({ size, render, inspector })`:**
  - `size` is the ring's length (5,000 by default);
  - `render: true` adds render entries;
  - `inspector` names the Inspector's URL.

## The API

`import { trace } from "@gluefuil/runtime"`, or `gfui.trace` in standalone
mode. `trace` is a frozen object:

| Member | What |
|---|---|
| `enable(options?)`, `disable()` | The switch |
| `enabled`, `render` | Whether tracing is on, and whether it records render entries |
| `entries()`, `dropped` | The ring, oldest first; how many entries it dropped |
| `subscribe(fn)` | New entries in batches (every 50 ms: a timer, because a hidden tab's frames stop); returns the function that stops it |
| `clear()`, `export()`, `flush()` | Forget the entries; versioned JSON (`{ format: "gfui-trace", version: 1, … }`); deliver pending batches now |
| `inspect()` | Opens the Inspector in a new tab, with `noopener` |

Script has no read access to the trace (XMLUI's apps don't have one either).
Script's `console.*` calls are traced.

## Entries

Every entry has these fields:

- `seq`, from 1 for the page's life;
- `time`, in wall-clock milliseconds;
- `traceId` and `spanId` (W3C shapes: 32 and 16 hex digits), and
  `parentSpanId` for a span inside another;
- `at`: `{ file, line, column, element }`, for entries about an element or a
  variable.

Every field is JSON data.

| Kind | Emitted by | Fields |
|---|---|---|
| `handler` | `HandlerSlot`, when a call ends (with its `start`) | `event`, `id`, `policy`, `outcome` (`ok`, `error`, `cancelled`, `dropped`), `reason`, `durationMs`, `args` (previews), `error` |
| `state` | `VariableNode.set` | `variable`, `before`, `after` (previews) |
| `fetch` | `sendRequest`: a `start` and an `end` with one span; the attempts of a request share it | `method`, `url`, `owner` (`{ component, id }`), `attempt`, `status`, `durationMs`, `outcome` (`ok`, `http`, `network`, `timeout`, `parse`, `cancelled`, `circuit-open`, `error`), `correlationId`, `causes` |
| `navigate` | The router: `navigate`, `redirect`, the browser's own moves | `from`, `to`, `outcome` (`done`, `cancelled`, `error`), `durationMs` |
| `error` | `reportRuntimeError`; an element's `onError`; a `Fallback` | `source`, `code`, `category`, `message`, `status`, `handledBy` (`onError`, `fallback`, `app`, `console`) |
| `diagnostic` | `reportDiagnostic` | `message`, `category` (`i18n`, `data`, `component`, `hydration`, `general`) |
| `log` | `console.*` from script | `level`, `args` (previews) |
| `render` | `Bound`, only with `render: true` | `changed` (the bindings), `causes`, `group` (one per synchronous run) |

## Traces and causes

- **A trace is one user action:** a handler call that no other handler
  started. A handler started inside another handler's segment (a method,
  `emitEvent`, `onError`) is a child span of that handler's trace.
  - The `Invocation` carries the trace, and the core's active trace follows
    `currentInvocation()` segment by segment.
  - This holds across `await`, with any number of concurrent handlers: no
    global stack and no time window (XMLUI's mistake).
- **Work that started on its own** gets a new trace: a mount's fetch, a
  poll, a write outside a handler, a URL typed by the user.
- **A request in a handler** (an APICall, an upload) is a span of the
  handler's trace.
- **Causes across a re-render.** A DataSource refetch starts in a React
  render, after the handler's segment closed.
  - While tracing, each write marks its signal with `{ traceId, spanId, entry }`
    (`markWrite`).
  - A computed keeps the newest mark among the values it read (`track`); a
    computed that reads another computed gets that computed's mark.
  - `Bound` compares each binding's newest mark with the one it saw before.
    The bindings whose mark is newer changed, and their marks are the causes:
    - a traced component's cell gets them (`takeCauses`: a fetch takes them once);
    - a render entry lists them.
  - An unchanged dependency is never a cause.
  - Loader and APICall results, and the router's location, are marked with
    their request or navigation, so the renders they cause name them too.
- **The cost while tracing is off:**
  - `markWrite` and `track` check one boolean;
  - a computed keeps no marks;
  - `Bound` keeps a ref that stays empty.

## Markup positions

- **The compiler** emits one table per module:

  ```js
  const $$L = $$locations("src/Main.gui", ["count",1,6,"DataSource",2,3,"Button",3,3,"#text",4,9]);
  ```

  - Each `Bound`/`BoundUser`, each text binding (`#text`) and each variable
    definition passes `at: $$L[i]`.
  - Elements with nothing dynamic get no position: they render as plain
    elements.
  - A traced component always renders as a `Bound`, so it gets its cell.
- **The file** is `locationFile`. The plugin gives the path from the Vite root
  (`src/components/Orders.gui`); it defaults to `fileName`, the source map's
  name.
- **Positions** are 1-based. An element points at its `<`, a variable at its
  attribute (`var.count`), text at its first non-blank character.
- **`traced`** on a component's metadata gives it a `$$trace` prop: a stable
  cell with its `at`, its `id` and the causes of its latest change.
  - Data components use it for their fetches.
  - List, Table and Tree put their diagnostics at their line.
- **`sensitive`** (PasswordInput, and a `TextBox` with `type="password"`)
  masks the element's handler arguments and every write its handlers make.
- **Size:** 77 playground modules with 913 positions add about 3.2 KiB
  gzipped (60.8 → 64.0 KiB of compiled code).

## Values (previews)

- **A preview** has at most 40 nodes, 2 levels and 80 characters per string.
  - What is cut is counted (`"…98 more"`, `[Array(10000)]`, `[Object(3)]`).
  - Files are recorded as their name and size; other non-plain objects as
    their kind; cycles as `[circular]`.
  - A preview of 10,000 rows takes about 0.5 µs; `JSON.stringify` takes 1 ms.
- **Masked as `•••`:** a sensitive element's arguments and writes.
- **Never recorded:** keystrokes, request and response bodies, headers.

## The Inspector

- **A separate page,** fed over the `gfui-trace` `BroadcastChannel`, opened
  with `noopener`.
  - It runs on its own thread: measured in Chromium, a busy viewer didn't
    delay the app's timers (1 ms worst lag), against 1.5 s for a viewer in
    the same page or a popup with an opener.
  - Its renders never show up in the app's trace.
  - It survives the app's reloads.
- **The app's side** (`bridge.ts`):
  - while tracing, the app posts each batch of entries (`entries`);
  - an Inspector's `hello` gets a `snapshot` of the ring;
  - at start, the app posts a `snapshot` with `reloaded: true`;
  - each tab has an id kept across reloads (`sessionStorage["gfui.trace.tab"]`).
- **The page** is `Inspector.gui`, a gfui app with one React component,
  `TraceFeed`:
  - **sources:** each app tab, and each imported file;
  - **a table of entries:** time, kind, what, summary, where, duration,
    trace;
  - **filters:** by kind and by text;
  - **the selected entry:** its trace as a tree (`· ` per level: a handler,
    what happened in it, a request's span inside it), and the entry as JSON;
  - **toolbar:** pause and resume, clear, export, import of an export;
  - **"Open file:line"** in the editor, on the dev server: Vite's
    `/__open-in-editor` with the project root the page was given.
- **Where it is served:**
  - the dev server: `<base>__gfui/inspector/`;
  - a build with `inspector: true`: the same path (a virtual input,
    `__gfui/inspector/index.html`);
  - standalone mode: the app's page with `?gfui-inspector`.
  - `trace.inspect()` opens whichever the page was given.
- **The model** (`model.ts`):
  - a source accepts entries with a `seq` above the last one it saw;
  - a reload starts again and adds a `page reload` row;
  - a source keeps its newest 20,000 entries.

## Cost

Measured with `npm run bench` (`runtime/bench/trace.bench.tsx`, Vitest's
runner, jsdom) and in an esbuild bundle in Node:

| | Off | On |
|---|---|---|
| A handler call that writes a variable | 0.50 µs (master's code: 0.45 µs under the runner; bundled, 575–593 ns against 563–577 ns) | 1.2 µs (IDs from a random pool, two entries, previews) |
| 100 elements re-render after one write | 0.54 ms (master: within noise) | 0.54 ms; 0.56 ms with render entries |

- **Off** costs 15–20 ns per handler call in a bundle, about 2–4%: a field of
  the `Invocation` and a few boolean checks. Renders are within noise.
- **Under Vitest's runner** the gap looks larger: each read of an imported
  binding (`tracing`) is an export getter there.
- **Bundle size:** see the plan's *Outcome*.

## Divergences from XMLUI

| XMLUI | Here |
|-------|------|
| `xsVerbose`; some subsystems build entries even when off | A switch with one boolean per site; nothing is built while off |
| An open entry type; documented kinds never emitted | A union of typed kinds; a test checks emitters and this table |
| A 200-entry array, re-sorted on every push once full | A ring of 5,000 (O(1)), with a `dropped` count |
| Full values, deep-copied; keystrokes, passwords | Bounded previews; masks; no keystrokes or bodies |
| A global trace stack and a 2-second window | The `Invocation` carries the trace; causes from tracked reads |
| W3C IDs and `traceparent` documented, never wired | W3C-shaped IDs; no header (deferred) |
| Locations on a few kinds, sometimes guessed | An exact position on every entry about an element or a variable |
| An iframe reading `window.parent` on the app's thread | A page of its own over `BroadcastChannel` |
| `Log.*`, `App.mark`/`measure` | Script's `console.*` is traced; no new globals |
| Render passes per container | Optional render entries per element |
| The audit pipeline (redaction, sampling, OTLP) | Not yet (decision 5) |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/trace/core.test.ts` | The ring, subscribers, the export, IDs, locations, previews, the switch (URL, session, local storage, the container's attributes), `trace.inspect()` |
| `runtime/tests/trace/causes.test.tsx` | Causes from tracked reads: a write in a handler named by later re-evaluations (through a computed); an unchanged dependency isn't a cause; off keeps no marks |
| `runtime/tests/trace/emitters.test.ts` | One table per kind through the real code: handler outcomes and spans (concurrent async handlers kept apart), masking, onError; state; fetch outcomes, an APICall's retries sharing a span; navigate; errors by who handled them; diagnostics; console; nothing recorded while off |
| `compiler/tests/module/locations.test.ts` | The table against the markup text (elements, text, variables, multi-line tags, entities); `locationFile`; `traced` and `sensitive` |
| `components/tests/trace.test.tsx` | Compiled markup in jsdom against the mock backend: a click, its write and the refetch it caused; render entries; a password masked; a Table diagnostic at its line; errors by who handled them (an element, the App, a Fallback); off records nothing |
| `inspector/tests/model.test.ts` | Each kind's row; sources (no duplicates, a reload, following the last tab, the limit); filters; the trace tree; details; import, export, clear |
| `vite-plugin/tests/inspector.test.ts`, `prerender.test.ts` | The page's HTML, the build input, the virtual page and entry, the Inspector's markup; the container attributes |
| `tools/trace-kinds.test.ts` | Every kind has an emitter in the runtime and a row in this document |
| `e2e/trace.spec.ts` (playground) | The "Tracing" scenario and the Inspector: live entries at their lines, causes, masking, errors, cancellation, filters, the trace tree, pause, a reload, export and import, the app's timers while the Inspector works |
| `e2e/trace-build.spec.ts` (hello build) | Off by default under a strict CSP; `?gfui-trace` on, remembered for the tab; entries at `src/Main.gui` lines |
| `e2e/standalone.spec.ts` | `?gfui-trace`, `gfui.trace.inspect()`, the Inspector compiled from `gfui.js` |
