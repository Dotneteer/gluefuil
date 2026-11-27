# Step 33: structured errors

**Status:** Done (accepted 2026-11-27)

Phase G's first step ([poc-steps.md](poc-steps.md) row 33): `AppError`,
`<Fallback>`, `<RetryPolicy>`, `App onError`. Reference:
`website/content/docs/pages/managed-react/structured-exception-model.md`.
It continues step 20's open item ([poc-20-data.md](poc-20-data.md) *Open for
later steps*: "`<RetryPolicy>`, `AppError` everywhere, `<App onError>`").

## Goal

```xml
<App onError="(error, event) => { event.preventDefault(); lastError = error.code }">
  <Text when="{App.errors.length > 0}">Errors: {App.errors.length}</Text>

  <RetryPolicy attempts="4" backoff="exponential" delayMs="500"
               circuitBreaker="{{ failureThreshold: 5, resetMs: 30000 }}">
    <Fallback id="orders">
      <property name="errorTemplate">
        <Card>
          <H3>We hit a snag ({$error.category})</H3>
          <Text when="{$error.correlationId}">Reference: {$error.correlationId}</Text>
          <Button label="Try again" onClick="orders.reset()"/>
        </Card>
      </property>
      <DataSource id="recent" url="/api/orders/recent"/>
      <List data="{recent}"/>
    </Fallback>
  </RetryPolicy>

  <Button label="Export" onClick="throw new AppError({ code: 'export-off', category: 'validation', message: 'Exports are off' })"
          onError="(error) => toast(error.message)"/>
</App>
```

Every error has one shape, `AppError`. Each error goes to the nearest place
that handles it: the element's own `onError`, then the nearest `Fallback`
(render and loader errors), then `App onError`, then the default report. Retries
and a circuit breaker can be declared around a subtree.

## Background

### XMLUI

**The documented model** (`pages/managed-react/structured-exception-model.md`):

- An `AppError` has `code`, `category`, `message`, `retryable`,
  `correlationId` and `data`.
- The nine categories are `network`, `validation`, `authorization`,
  `not-found`, `conflict`, `rate-limit`, `server`, `user-cancelled` and
  `internal`. Each has a retryable default.
- Three channels: `<App onError>` (with `App.errors`, a buffer of 50),
  `<RetryPolicy>` and `<Fallback>`.
- A per-component `onError`.
- The `strictErrors` setting warns on a non-`AppError` throw.

**The source** (`xmlui/src/components-core/errors/`):

- `app-error.ts`:
  - `class AppError extends Error`, its data frozen, with `toJSON()`.
  - `AppError.from()` (line 122): an HTTP error becomes `http-<status>`, with
    the status, details, response and `retryAfterMs` in `data`. Any other
    value becomes `internal`/`unknown`.
  - `categorizeHttpStatus` (line 181); `DEFAULT_RETRYABLE` (line 33).
- `policy.ts`:
  - `executeWithPolicy` (line 183): attempts; `fixed`/`linear`/`exponential`
    backoff with ±25% jitter (line 89); `onlyCategories`; `timeoutMs` per
    attempt; `Retry-After` capped at 60 s; a circuit breaker
    (closed/open/half-open).
  - On exhaustion it throws a *new* error, `code: "retry-exhausted"` (line
    267), with the real one as `cause`.
- `RetryPolicyContext.ts`: React context.
  `components/RetryPolicy/RetryPolicyReact.tsx` provides it, with one
  circuit state per instance. The defaults (`RetryPolicy.defaults.ts`):
  3 attempts, exponential, 500 ms, jitter on, `honourRetryAfter` on.
- `components/Fallback/FallbackReact.tsx`:
  - A context that descendant loaders report to (`Loader.tsx` lines 179 and
    188), plus a class error boundary for render errors.
  - `errorTemplate` with `$error`; `loadingTemplate` shown while `isLoading`.
  - It shows the first reported error.
- `rendering/AppContent.tsx` lines 1622–1700 (`signErrorWithHandler`):
  - Converts the error, appends it to `App.errors` (`errorBufferSize`,
    default 50), and calls `<App onError>` as `(error, event)`.
  - `event.preventDefault()` or returning `false` (also from an async
    handler) suppresses the default report. A throwing handler is logged.
  - The default report (`signError`, line 1896) is a toast, a live-region
    announcement and `console.error`.
- **Who calls `signError`:**
  - handler errors (`container/event-handlers.ts` line 825);
  - loader errors without `errorNotificationMessage`, unless `onError`
    returned `false` (`loader/DataLoader.tsx` lines 632–662);
  - `Queue`.
- `rendering/ComponentAdapter.tsx` lines 455–505:
  - When an element declares `onError`, its other handlers' errors go there
    and not to `signError`. Lifecycle errors are reported the same way.
  - The handler receives `{ source, error: { message, stack } }` (line 149),
    not an `AppError`.
- The how-tos (`howto/branch-on-structured-loader-errors.md`,
  `retry-retryable-loader-errors.md`, `show-section-fallback-from-loader-error.md`,
  `collect-global-errors-with-app-onerror.md`) read `loader.error.category`,
  `error.data.statusCode`, `App.errors` and `onError="(error, event) => …"`.

**Where the docs and the source disagree** (we follow neither blindly):

| Docs say | Source does |
|----------|-------------|
| Render errors reach `App onError` (`App.tsx` line 270; `.ai/xmlui/errors.md`) | `ErrorBoundary.tsx` line 56 only logs and traces; it never calls `signError`. A render error outside a `Fallback` shows "There was an error!" in place of the container (`StateContainer.tsx` line 638) |
| `X-Correlation-Id` becomes `correlationId` (`errorCorrelationIdHeader`, `abstractions/standalone.ts` line 111) | Nothing reads the header. `correlationId` is never set |
| `RetryPolicy` covers `DataSource`, `APICall`, `WebSocket`, `EventSource` (`.ai/xmlui/errors.md`) | Only `Loader` reads the policy (`Loader.tsx` line 90) |
| `onlyCategories` can add categories ("use `onlyCategories` to override", `RetryPolicy.md`) | It can only narrow: a non-retryable error is rethrown first (`policy.ts` line 239) |
| `App onError`'s handler reads `event.error` (structured-exception-model.md) | The handler is called as `(error, event)` (`AppContent.tsx` line 1677), as the how-to uses it |
| Per-component `onError` gets "the structured `AppError`" | It gets `{ source, error: { message, stack } }` |
| `strictErrors` nudges toward `throw new AppError({...})` | `AppError` isn't constructible in script (`script-runner/eval-tree-common.ts` line 732) |
| `network` category for TCP/DNS failures | A failed `fetch` (a `TypeError`) has no `statusCode` and becomes `internal` |
| — | Once a `Fallback` shows its error template its children are unmounted, so the loader that failed can never clear the error. The section stays failed until the page is left |

### Here

- **Data errors** (`runtime/src/data/errors.ts`, step 20):
  - A frozen plain object, `DataError`: `message`, `category`, `code`,
    `status`, `statusText`, `retryable`, `body`, `method`, `url`, `attempts`,
    `retryAfterMs`.
  - Its categories are XMLUI's plus `timeout` and `parse`, without
    `user-cancelled`: a cancellation is an outcome (`RequestCancelledError`,
    `HandlerCancelledError`), never reported.
  - The HTTP gate (`data/http.ts`) already maps a failed fetch to `network`
    and parses `Retry-After`.
  - Forms map a 422 from `error.body` (`forms/server-errors.ts` line 83).
- **Retries** (`data/retry.ts`): `retries` and `retryDelay` per DataSource
  (default 2 retries for a `get`, `components/src/data.tsx` line 118) and per
  APICall (0, line 272). Exponential backoff with jitter, capped at 30 s;
  `Retry-After` capped at 60 s.
  - DataSource retries through query-core's `retry`/`retryDelay`
    (`data/loader.ts`).
  - APICall retries in `runWithRetry`.
- **One reporter, `reportRuntimeError`** (`runtime/src/errors.ts`), which
  calls the platform's `reportError` (the console). It reports:
  - handler errors without a waiting caller (`render/handlers.ts` line 249);
  - watcher errors;
  - the router's navigation-event errors;
  - the form store's errors;
  - hydration's recoverable errors (`render/mount.ts` line 77);
  - **developer diagnostics:** List, Table and Tree with duplicate ids, a
    Table column's bad type.

  Nothing is shown to the user.
- **What the user sees:**
  - A DataSource error without `onError` is only `users.error`: nothing
    reports it.
  - An APICall error without `onError` rejects `execute()`, which fails the
    calling handler, which is reported.
- **No error boundaries anywhere.** A render error blanks the whole app.
  The prerender fails the build, which is the intended behavior
  ([ssg.md](../docs/ssg.md)).
- **Script** can already `throw new Error(...)` (`Error` is in the
  compiler's `CONSTRUCTIBLE`, `compiler/src/codegen/names.ts`).

## Options considered

All four choices below were measured in a prototype under
`.tmp/vproto/errors/`:

- `ssr.mjs`: the server render.
- `main.jsx` with `run.mjs`: hydration, roots and boundary cost, in Chromium
  (a production Vite build, React 19.3.1).
- `retry.mjs` and `offline.mjs`: query-core 5.108.4.

### A. Render errors in the prerender (inside a `Fallback`)

Our prerender uses `renderToString`. Measured (`ssr.mjs`, production build):

| Tree | `renderToString` |
|------|------------------|
| a throwing child, no boundary | throws: the build fails (today) |
| a class error boundary around it | **throws too**: boundaries don't run on the server |
| `Suspense` around the boundary | returns the page with `<!--$!--><template></template><!--/$-->` where the child was. **No error is reported:** `renderToString`'s `onError` is an empty function (`react-dom-server-legacy.node.production.js` line 7005). In development the template carries the message and the stack, including file paths |

Hydrating that HTML (`run.mjs`):

| Client | Result |
|--------|--------|
| the child throws again | the boundary inside shows its error UI (`onCaughtError`, `componentDidCatch`); the nodes before and after are **the same DOM nodes** |
| the child renders (only the server failed) | the real content appears; same nodes kept; React reports a *recoverable* error, #419 ("switched to client rendering") |

Options:

1. **`Fallback` puts a `Suspense` boundary inside itself** *(recommended)*.
   - A render error in the prerender turns that section into "render on the
     client". The client shows the content, or the error template if the error
     recurs.
   - The rest of the page is prerendered and kept.
   - The prerender finds the `<!--$!-->` markers in its output and prints a
     build warning (it can't learn the message).
   - Hydration's #419 is kept out of the app's errors (below).
2. **Keep failing the build** for every render error, even inside a
   `Fallback`. Strict, but a `Fallback` then means nothing in a prerendered
   app.
3. **Move the prerender to `react-dom/static`'s `prerender`**, which has an
   `onError`. This gives the message in the build log, but rewrites the
   prerender's passes (step 32's `requestServerRender`) around an async,
   streaming API. That's too much for this step.

### B. Render errors outside any `Fallback`

Measured in Chromium (`run.mjs`):

| Root | A render error |
|------|----------------|
| `createRoot`, no boundary | the **whole app is removed** (empty container); `onUncaughtError` |
| a boundary around the failing part | only that part is replaced; `onCaughtError` and `componentDidCatch` |

**The cost of a boundary** (median of 7, ms; mount / re-render):

| Each of n leaves wrapped in | n = 1,000 | n = 10,000 |
|-----------------------------|-----------|------------|
| nothing | 0.5 / 0.6 | 3.7 / 3.0 |
| a class error boundary | 0.7 / 0.6 | 4.7 / 3.4 |
| `Suspense` | 0.7 / 0.9 | 5.0 / 3.9 |
| a context provider (for scale: our layout context) | 0.6 / 0.5 | 4.5 / 3.5 |

A boundary costs about 0.1 µs per element, the same as a context provider.
Cost doesn't decide this; the scope does:

1. **One built-in boundary around each `Page` and around the App's content**
   *(recommended)*. A failing page shows a small error panel in its place
   (the message, and a "Reload" button), and the shell (header, nav) stays.
   The error goes to `App onError` and the default report.
2. **Also one around every user-component instance:** closer to XMLUI's
   per-container boundaries (`StateContainer.tsx` line 638). The failure is
   smaller, but a broken component inside a table cell shows the panel in the
   cell.
3. **None** (today): the app goes blank.

### C. How `RetryPolicy` reaches the query engine

Measured with query-core (`retry.mjs`; a 503 each attempt, 100 ms delay):

| | (1) query-core's `retry`/`retryDelay` (today's mechanism) | (2) a loop inside `queryFn`, `retry: false` (XMLUI's) |
|---|---|---|
| While backing off | `fetching`, `failureCount` 2: the attempts are visible | `fetching`, `failureCount` 0 |
| At the end (3 attempts) | `failureCount` 3 (our `error.attempts`) | `failureCount` 1: the attempts are lost |
| `cancelQueries` during a backoff | stops: 1 call | stops: 1 call |
| The last observer leaves during a backoff | stops: 1 call | stops: 1 call |
| Two observers of one key with different policies | the first fetch's policy applies (2 calls) | the first fetch's policy applies (2 calls) |
| Offline (query-core's `onlineManager`) | pauses; **stays paused** unless `QueryClient.mount()` runs (`offline.mjs`) | not affected |

Our client uses `networkMode: "always"` (`data/client.ts`), so the offline
row doesn't apply here: an offline network is an error to show (step 20).
**Proposed without asking:** (1), the mechanism DataSource already has. The
policy supplies `retry` and `retryDelay`, and the circuit breaker sits in
`queryFn`. Requests with one key are still shared; the first fetch's policy
applies, as in XMLUI.

### D. What `AppError` is

1. **A class, `AppError extends Error`**, frozen and constructible from
   script *(recommended)*.
   - It replaces `DataError`: `isDataError` becomes `instanceof AppError`.
   - Every error then has a `stack` that maps to the `.gui` line through
     source maps (step 9).
   - `catch (e)` sees a real `Error`, and `JSON.stringify` uses `toJSON()`.
   - It is our own class, so the sandbox invariant (no platform object) holds.
   - HTTP details stay where step 20 put them (`status`, `body`, `url`,
     `method`, `attempts`, `retryAfterMs`). `data` carries XMLUI's names
     (`statusCode`, `response`, `retryAfterMs`), so XMLUI's how-tos work.
2. **A frozen plain object** (today's `DataError`, extended). Simple and
   cloneable, but it is not an `Error`, has no stack, and `instanceof` can't
   test it.
3. **The class, with XMLUI's shape only** (HTTP details only in `data`). One
   place for everything, but `error.body.errors` (step 22B's forms, step 20's
   docs) becomes `error.data.response.errors`.

### E. What `RetryPolicy` covers

1. **DataSources only** *(recommended)*, as XMLUI's source does. Writes keep
   `retries` on the APICall: a policy around a form must not repeat a `POST`
   that may have reached the server (step 20's decision 6).
2. **Every request under it:** DataSource, APICall, FileUpload, FileDownload.
   This matches XMLUI's AI notes, not its source.
3. **Every `GET` under it:** DataSource, a `get` APICall, FileDownload.

### F. The default report for an unhandled error

1. **A toast and the console** *(recommended)*. This is XMLUI's `signError`,
   plus a live-region announcement through step 32's `LiveRegion`.
   `App onError` can suppress it.
2. **The console only** (today). A user never learns that a save failed
   unless the app handles it.

### G. A per-element `onError`

1. **Yes, on every element** *(recommended)*.
   - It handles the errors of that element's other handlers and of its
     `onMount`/`onUnmount`.
   - It receives `(error: AppError, source)`, where `source` is `"action"`,
     `"mount"` or `"unmount"`. This diverges from XMLUI, which passes
     `{ source, error: { message, stack } }`.
   - Components with their own `error` event (DataSource, APICall,
     FileUpload) keep their meaning.
   - Compiled as a third lifecycle entry beside `mount`/`unmount`
     (`render/elements.ts`).
2. **Later.** Only `App onError` and the components' own `error` events.

## Design

### The error pipeline

- **`runtime/src/errors/`** (`errors.ts` becomes a folder):
  - `app-error.ts`: `AppError`, `AppError.from()`, `categoryOfStatus`, the
    retryable defaults.
  - `pipeline.ts`: `reportAppError(error, { source, element? })` →
    `App.errors` → `App onError` → the default report.
  - `diagnostics.ts`: `reportDiagnostic(message)`, `console.warn` only.
- **The categories:**
  - XMLUI's nine, plus ours: `timeout` and `parse`.
  - `user-cancelled` exists for script (`new AppError({ category:
    "user-cancelled" })`). Our own cancellations stay outcomes and are never
    reported.
- **Where errors come from** (`source`): `handler`, `lifecycle`, `loader`,
  `render`, `navigation` (the router's events) and `internal` (watchers, the
  form store).
- **Developer diagnostics** (duplicate ids, a column's type) move from
  `reportRuntimeError` to `reportDiagnostic`. They are not the user's
  errors: no toast, no `App onError`. Step 35 (observability) will give them
  a trace.
- **Hydration's recoverable errors** (#419 and mismatches) go to
  `reportDiagnostic`. React recovered, so the app has nothing to handle.
- **`AppError.from()`:**
  - An `AppError` is returned unchanged.
  - An `Error` becomes `internal`/`unknown`, keeping it as `cause` (the
    message and stack stay).
  - Any other thrown value becomes `internal`/`unknown`, with its string as
    the message.
- **Strict mode is not copied:** `throw new Error("…")` is fine and becomes
  `internal`; there's no `strictErrors` warning.
- **The chain** (the first that handles the error wins):
  1. The element's own `onError`. For DataSource, APICall and FileUpload this
     is their existing `error` event, with today's rules.
  2. The nearest `Fallback`, for render and loader errors only. A handler
     error doesn't replace a section.
  3. `App onError`.
  4. The default report (decision F).

### `AppError`

```ts
class AppError extends Error {
  readonly name: "AppError";
  readonly code: string;            // "http-503", "network", "timeout", "parse", "circuit-open", "unknown", or the app's own
  readonly category: AppErrorCategory;
  readonly retryable: boolean;      // the category's default unless given
  readonly correlationId?: string;  // from the response's X-Correlation-Id
  readonly data: Readonly<Record<string, unknown>>; // XMLUI's: statusCode, response, retryAfterMs, … and the app's own
  // HTTP errors also have, as today: status, statusText, body, method, url, attempts, retryAfterMs
  toJSON(): Record<string, unknown>;
}
```

- **Frozen** (data deeply), as `DataError` is now.
- **Constructible from script:** `new AppError({ code, category, message,
  retryable?, data? })`. It is added to `ALLOWED_GLOBALS`, `CONSTRUCTIBLE` and
  the runtime's globals; `tools/sandbox-drift.test.ts` checks that they
  agree.
- **The correlation ID** is read from the `X-Correlation-Id` response header
  of a failed request (case-insensitive; XMLUI's documented default). The
  header name isn't configurable yet.
- **`DataError`** stays as a type alias for `AppError`, so step 20–32B code
  keeps compiling.

### `App onError` and `App.errors`

- **`onError="(error, event) => …"`** (XMLUI's source signature):
  - `event` is a frozen object with `preventDefault()` and
    `defaultPrevented`.
  - Returning `false`, or `preventDefault()` (also after an `await`),
    suppresses the default report.
  - A handler that throws is logged once and never fed back into itself.
- **Which errors it receives:** only the errors nothing else handled.
  Telemetry of handled errors is step 35's trace.
- **`App.errors`:** a new app global, the namespace `App` with `errors`
  only. It is a reactive, frozen array of the last 50 `AppError`s, the
  unhandled ones only. `App.errors` is XMLUI's name; its buffer size is
  fixed (XMLUI's `errorBufferSize` has no config file here yet).
- **One sink per App.** The App registers its handler on mount, as
  `willNavigate` does (`setNavigationHandlers`). Without an App (tests), the
  default report runs.

### `Fallback`

- **Props:** `errorTemplate` (`$error`), `loadingTemplate`, `isLoading`, as
  in XMLUI.
- **API:** `reset()` clears the error and mounts the children again. A
  DataSource refetches its failed query on mount (query-core's
  `retryOnMount`). In XMLUI the section can't recover: its children are gone.
  Also `error`, the current `AppError` or `undefined`.
- **What it catches:**
  - render errors in its children (a class boundary);
  - errors of descendant DataSources that their own `onError` didn't handle.
    DataSources find the nearest Fallback through context.
  - The first error wins.
- **What it doesn't catch:**
  - handler errors and APICall errors (they go on to `App onError`);
  - errors inside its own templates (they go to the next `Fallback` out).
- **A `Suspense` boundary inside it** (option A1), so the prerender keeps the
  page and the section renders on the client. `renderStatic` warns about
  `<!--$!-->` markers.
- Templates compile as other templates do; `$error` is a context variable.

### `RetryPolicy`

- **Props, as in XMLUI:**
  - `attempts` (total, default 3);
  - `backoff` (`fixed`, `linear`, `exponential`; default exponential);
  - `delayMs` (500);
  - `jitter` (true, ±25%);
  - `onlyCategories` (a comma list or an array);
  - `timeoutMs` (per attempt);
  - `honourRetryAfter` (true; capped at 60 s);
  - `circuitBreaker` (`{ failureThreshold, resetMs }`).
- **What applies to a DataSource:** its own `retries`/`retryDelay`/`timeoutMs`
  props, else the nearest `RetryPolicy`, else today's default. The nearest
  policy wins; policies don't combine.
- **`onlyCategories`** is the set of categories that are retried. It
  replaces the `retryable` flags, so it can retry a 409. In XMLUI it can
  only narrow. `user-cancelled` is never retried.
- **On exhaustion,** the last error is kept, with `attempts`. XMLUI wraps it
  as `retry-exhausted`, so `code` loses `http-503`.
- **The circuit breaker:** one state per `RetryPolicy` instance, shared by
  its DataSources.
  - `failureThreshold` failed attempts in a row open it.
  - While open, a request fails at once with `code: "circuit-open"`,
    `category: "server"`, not retryable, and `data.resetInMs`.
  - After `resetMs`, one probe; a success closes it.
- `retry.ts` gains `fixed` and `linear` backoff; the 30 s cap on one backoff
  stays.

### The mock backend and the playground

- **The mock backend:** fault responses can carry `X-Correlation-Id`
  (`/__mock` fault option `correlationId`), so E2E can prove the header
  reaches `error.correlationId`.
- **The playground:** a scenario, "Errors and recovery":
  - a flaky endpoint under a `RetryPolicy`, with the attempts shown;
  - a circuit breaker opening and closing;
  - a `Fallback` with "Try again";
  - a throwing component;
  - an `App.errors` panel;
  - `App onError` with the toast suppressed by a switch.

### Divergences from XMLUI (proposed)

| XMLUI | Here |
|-------|------|
| Render errors outside a `Fallback` show a box per container and never reach `App onError` | A panel per `Page` (decision B), and they reach `App onError` |
| `RetryPolicy` exhaustion is `retry-exhausted` | The last error, with `attempts` |
| `onlyCategories` only narrows | It is the set of retried categories |
| A `Fallback` can't recover | `reset()` |
| `strictErrors` warns on `throw new Error` | No warning; `AppError` is constructible |
| Categories without `timeout` and `parse` | With them (step 20) |
| Per-element `onError` gets `{ source, error: { message, stack } }` | `(error: AppError, source)` |
| `X-Correlation-Id` documented, never read | Read |
| Hydration and developer warnings would go through `signError` | Diagnostics, console only |

## Steps

- [x] `AppError` and the pipeline (`runtime/src/errors/`); `DataError`
      becomes `AppError`; the correlation ID; `reportDiagnostic` for the
      component diagnostics and hydration; `AppError` in the sandbox.
- [x] `App onError`, `App.errors`, the default report (toast and live region).
- [x] `RetryPolicy` (backoff kinds, `onlyCategories`, the circuit breaker)
      through the Loader's query options.
- [x] `Fallback` (boundary, loader reports, `reset()`, Suspense) and the
      boundaries around Pages and the App content; the prerender's marker
      warning.
- [x] Per-element `onError` (if decision G1).
- [x] Unit tests, playground scenario, E2E.
- [x] Docs: `code-structure.md`, a subsystem document (`errors.md`),
      `data.md`, `async-handlers.md`, `ssg.md`, `codegen.md`; *Decisions* in
      `AGENTS.md`.
- [x] `npm run check`; the bundle size.

## Verification

- **Unit (tables):**
  - `AppError.from()` for every kind of thrown value;
  - the status → category → retryable table;
  - the delays for each backoff kind, with jitter off, `Retry-After` and its
    cap;
  - the circuit breaker's states over a sequence of outcomes;
  - `onlyCategories`.
- **Unit (jsdom):**
  - `App onError`: the order of the chain, `preventDefault`, `false`, an
    async handler, a throwing handler, the buffer of 50, `App.errors`
    reactive;
  - `Fallback`: a render error, a loader error, a handled loader error not
    reaching it, nested Fallbacks, an error in the template going out,
    `reset()` refetching, `loadingTemplate`;
  - per-element `onError` with each `source`;
  - script `throw new AppError(...)` and `instanceof`;
  - the developer diagnostics not reaching `App onError`.
- **Prerender:** a `Fallback` whose child throws on the server prerenders
  the rest of the page and warns; a render error outside a `Fallback` still
  fails the build.
- **E2E (mock backend, both hosts):**
  - 503 twice then 200 under a `RetryPolicy`, with the attempts seen;
  - a 429 with `Retry-After` honoured (timed);
  - the circuit opening after the threshold and probing after `resetMs`;
  - `X-Correlation-Id` shown in an error template;
  - the default toast, and its suppression;
  - a failing Page leaving the shell usable.
- **E2E (prerendered build):** a section whose child fails only on the
  server is rendered on the client, and the takeover changes no other DOM
  node (as `ssg.spec.ts` checks).
- **Size:** the eager bundle before and after (no new dependency).

## Outcome

- **The runtime:**
  - `runtime/src/errors/` replaces `errors.ts`: `AppError` (`app-error.ts`)
    and the pipeline (`report.ts`: sinks, the console stage,
    `reportDiagnostic`).
  - The App's sink (`render/app-errors.ts`): `App.errors`, `App onError`,
    the default report.
  - `HandlerSlot` error options; `lifecycle.error`.
  - Data errors are AppErrors with `correlationId` and XMLUI's `data`.
  - `RetryPolicySpec` and `CircuitBreaker` (`data/retry.ts`) through the
    Loader's query options.
  - Root error callbacks in `mountApp`.
- **The components** (`components/src/errors.tsx`): `Fallback`,
  `RetryPolicy`, `ErrorBoundary` and `RenderBoundary` around each `Page`
  and inside Shell around the content.
  - DataSource sends unhandled errors to the nearest Fallback, else the
    pipeline.
  - The App renders an assertive announcer (`.gfui-ErrorAnnouncer`).
- **Developer diagnostics:** List, Table and Tree duplicate ids, a column's
  type, an unbound input and hydration's recoverable errors go to the console
  as warnings.
- **The compiler:** `onError` on any element (a lifecycle entry unless the
  component has its own `error` event); `AppError` allowed and constructible;
  `App` an app global.
- **The plugin:** a build warning for `<!--$!-->` markers
  (`clientRenderedSections`).
- **The playground:** "Errors and recovery" (57 scenarios), with error
  routes in its backend, and `onError` on its App (a switch keeps the toasts
  quiet).
- **Evidence:** `npm run check` passes and prints no warnings: 3,470 unit
  tests in 125 files, 302 E2E tests. New:
  - `runtime/tests/errors/app-error.test.ts` and `pipeline.test.ts` (51);
  - `runtime/tests/data/retry-policy.test.ts` (23);
  - `compiler/tests/module/errors.test.ts` (8);
  - `components/tests/errors.test.tsx` (20, the prerender and hydration
    included);
  - four plugin cases;
  - `e2e/errors.spec.ts` (6; 60 of 60 under `--repeat-each=10 --workers=8`).
- **Size** (against a build of `master`): the hello app's eager JavaScript
  1,259 → 1,268 KiB (348 → 351 KiB gzipped); `gfui.js` 1,725 → 1,737 KiB
  (488 → 493 KiB gzipped). No new dependency.

### Findings

- **A boundary catches before the App can hear it.** On a first render,
  the boundary's `componentDidCatch` runs in the commit, before the App's
  layout effect registers its sink (effects run child-first). So
  `RenderBoundary` reports one microtask later; a jsdom test found it.
- **Shell counts its children** for the layout's wrapper rule, so the
  content's boundary must sit inside Shell, after the count, not around
  App's children.
- **The announcer must not take the `LiveRegion` class or the `alert`
  role:**
  - with the class, step 32's LiveRegion E2E test matched two regions;
  - with the role, `getByRole("alert")` in the forms and LiveRegion unit
    tests found two alerts.

  It has its own class (the same hidden style) and `aria-live="assertive"`.
- **Two source-map E2E tests never awaited their click.** A handler error
  now also shows a toast, so the click finished after the test, and
  Playwright reported "Test ended". They await it after resuming the
  debugger.
- **Our sandbox's member access is null-safe:** `{null.x}` doesn't throw,
  so the render-error tests use `JSON.parse('{oops')`.
- **React's default `onCaughtError` logs every caught render error;**
  `mountApp` silences it, since the boundary reported or handled the error.
- **The mock backend's faults already take `headers`,** so
  `X-Correlation-Id` needed no new option (the plan proposed one).
- **Unhandled DataSource errors now show a toast.** No existing test relied
  on the silence.

### Deviations from this plan

- No `correlationId` fault option in the mock backend (`headers` does it).
- The App's content boundary is in `Shell`, not in `App` (the wrapper rule).
- The prerender's hydration is proven in jsdom with React's real
  `hydrateRoot` (`components/tests/errors.test.tsx`) and was measured in
  Chromium in the prototype. No E2E fixture got a server-only failure: markup
  can't fail only on the server.
- Errors of `Items`/`List` `data` URLs (not DataSources) don't report to a
  Fallback.

### Open for later steps

- `errorBufferSize` and the correlation header name as App settings.
- RetryPolicy for APICall `GET`s and FileDownload, if wanted (decision E
  kept it to DataSources).
- The data URLs of Items, List and Forms reporting to a Fallback.
- Upload progress, and per-error traces (step 35 observability).

## Open questions

None: A, B, D, E, F and G are under *Decisions*. Proposed without asking (say
if you want otherwise):

- C1, query-core's retry for the policy.
- `App onError` receives only unhandled errors.
- `App.errors` as XMLUI's name, a buffer of 50.
- No `strictErrors`.
- `onlyCategories` replaces the retryable flags.
- Exhaustion keeps the last error.
- `Fallback.reset()`.
- The correlation header is fixed as `X-Correlation-Id`.
- Developer diagnostics and hydration's recoverable errors stay out of the
  pipeline.

## Decisions (asked 2026-11-27)

1. **Render errors in the prerender** (option A1): `Fallback` has a
   `Suspense` boundary inside it; a section that fails on the server renders
   on the client, and the build warns about the `<!--$!-->` markers.
2. **Built-in boundaries** (option B1): one around each `Page` and one around
   the App's content; the shell stays usable.
3. **`AppError`** (option D1): `class AppError extends Error`, frozen,
   constructible from script; it replaces `DataError`, keeps step 20's HTTP
   fields and adds XMLUI's `data`.
4. **`RetryPolicy`** (option E1) applies to DataSources only; APICall keeps
   its own `retries`.
5. **The default report** (option F1): a toast, a live-region announcement and
   the console; `App onError` can suppress it.
6. **A per-element `onError`** (option G1): every element, `(error, source)`;
   DataSource, APICall and FileUpload keep their own `error` events.
