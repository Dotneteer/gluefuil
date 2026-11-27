# Structured errors

Step 33 ([`../plan/poc-33-errors.md`](../plan/poc-33-errors.md)): one error
shape (`AppError`), one pipeline for the errors nothing handled, `App onError`
and `App.errors`, a per-element `onError`, `Fallback`, the built-in render
boundaries, and `RetryPolicy` with a circuit breaker.

| File | What |
|------|------|
| `runtime/src/errors/app-error.ts` | `AppError` (frozen, constructible from script), `AppError.from`, the categories and their retryable defaults, `categoryOfStatus`, `withFields`, `freezeData` |
| `runtime/src/errors/report.ts` | The pipeline: `reportRuntimeError(error, source)`, error sinks (`pushErrorSink`), the console stage (`reportToConsole`, `setErrorReporter`), `reportDiagnostic` (`setDiagnosticReporter`), `scheduleMicrotask`. Imports no reactivity (the store reports through it) |
| `runtime/src/render/app-errors.ts` | The App's sink (`registerAppErrors`): `App.errors` (`appErrors`, 50), `App onError`'s event, the default report (`defaultErrorReport`: a toast, `errorAnnouncement`, the console); the `App` app global (`AppGlobal`) |
| `runtime/src/render/handlers.ts` | `HandlerSlot`'s fourth argument: `{ onError, source }` (where its errors go) |
| `runtime/src/render/elements.ts` | The per-element `onError`: `lifecycle.error`, a slot that receives the other slots' errors (`"action"`) and the lifecycle's (`"mount"`, `"unmount"`) |
| `runtime/src/render/mount.ts` | Root callbacks: `onCaughtError` silent (a boundary handled it), `onUncaughtError` reported as a render error, `onRecoverableError` a diagnostic |
| `runtime/src/data/errors.ts` | Data errors are AppErrors: `httpError` (with `correlationId`), `toDataError`, `withAttempts`; `DataError` is an alias |
| `runtime/src/data/retry.ts` | `RetryPolicySpec` (attempts, backoff, delayMs, jitter, onlyCategories, timeoutMs, honourRetryAfter), `shouldRetry`, `retryDelay`, `policyOf`, `CircuitBreaker`, `RetryPolicy` |
| `runtime/src/data/loader.ts` | `LoaderOptions.policy`: the spec through query-core's `retry`/`retryDelay`, the breaker in `queryFn` |
| `runtime/src/data/http.ts` | `X-Correlation-Id` of a failed response → `correlationId` |
| `components/src/errors.tsx` | `ErrorBoundary`, `RenderBoundary` (Pages and the App content), `Fallback` (with `useLoaderErrorReport`), `RetryPolicy` (with `useRetryPolicy`, `retryPolicySpec`, `categoryList`) |
| `components/src/data.tsx` | DataSource: the nearest policy unless it has `retries`/`retryDelay`; its timeout, else the policy's; an error without `onError` to the nearest Fallback, else the pipeline |
| `components/src/theme.tsx`, `shell.tsx`, `routing.tsx` | App registers its sink and renders the `ErrorAnnouncer`; Shell wraps the content in a `RenderBoundary` (reset by the path); each `Page` has one |
| `compiler/src/module/compile-module.ts` | `onError` on an element whose component has no `error` event becomes `lifecycle.error`; `onError` is never E004 |
| `compiler/src/codegen/names.ts`, `runtime/src/script/sandbox.ts` | `AppError` in `ALLOWED_GLOBALS` and `CONSTRUCTIBLE`; `App` in `APP_GLOBALS` |
| `vite-plugin/src/prerender.ts`, `index.ts` | `clientRenderedSections`: the build warns about `<!--$!-->` markers |

## In markup

```xml
<App onError="(error, event) => { if (quiet) event.preventDefault() }">
  <Text>Errors: {App.errors.length}</Text>

  <RetryPolicy attempts="4" backoff="exponential" delayMs="300" circuitBreaker="{{ failureThreshold: 3, resetMs: 5000 }}">
    <Fallback id="section">
      <property name="errorTemplate">
        <Text>{$error.category} {$error.code} {$error.correlationId}</Text>
        <Button label="Try again" onClick="section.reset()"/>
      </property>
      <DataSource id="report" url="/api/report"/>
    </Fallback>
  </RetryPolicy>

  <Button label="Export" onClick="throw new AppError({ code: 'quota', category: 'rate-limit', message: 'Not today' })"
          onError="(error, source) => note = source + ': ' + error.message"/>
</App>
```

## `AppError`

- **Fields:** `name` ("AppError"), `message`, `code`, `category`,
  `retryable`, `correlationId?` and `data` (frozen, possibly empty).
  - HTTP errors also have step 20's `status`, `statusText`, `body`,
    `method`, `url`, `attempts` and `retryAfterMs`.
  - Their `data` uses XMLUI's names: `statusCode`, `response` and
    `retryAfterMs`.
  - An absent field is absent (`declare` fields: no initializers).
- **Categories:**
  - XMLUI's nine: `network`, `validation`, `authorization`, `not-found`,
    `conflict`, `rate-limit`, `server`, `user-cancelled`, `internal`;
  - plus `timeout` and `parse`.
  - Retryable by default: network, timeout, rate-limit, server.
- **Codes:**
  - `http-<status>`, `network`, `timeout`, `parse`;
  - `internal` (a throwing transform, from `toDataError`);
  - `unknown` (`AppError.from`, or no code given);
  - `circuit-open`;
  - or the app's own.
- **`AppError.from(value)`:**
  - an AppError is returned as it is;
  - anything else becomes `internal`/`unknown` with `cause` set to the
    value. An Error keeps its message and stack.
- **Frozen:** the instance and its data deeply; the class and its prototype
  too (script reads the class).
- **In script:** `new AppError({ code, category, message, retryable?, data?
  })`.
  - An unknown category is a TypeError.
  - `e instanceof AppError` works.
  - `throw new Error(...)` is fine too and becomes `internal`. There is no
    `strictErrors` warning.

## Where an error goes

The first of these that handles it wins:

1. **The element's own `onError`:**
   - `(error: AppError, source)`, where `source` is `"action"` (one of its
     handlers), `"mount"` or `"unmount"`.
   - A waiting caller (`HandlerSlot.call`) then resolves to `undefined`.
   - An error inside `onError` itself goes on (2–4).
   - DataSource, APICall, FileUpload and App keep their own `error` events.
2. **The nearest `Fallback`:** render errors of its children, and errors of
   DataSources inside it that their `onError` doesn't handle.
3. **The pipeline:** `reportRuntimeError(error, source)` hands the error to
   the innermost sink. Each App registers one in a layout effect:
   - the error goes into `App.errors`;
   - then `App onError(error, event)` runs. `event.preventDefault()`, or
     returning `false` (also from an async handler), suppresses step 4;
   - a throwing handler is logged once and the default report still runs.
4. **The default report:**
   - `toast.error(message)`;
   - the App's assertive live region (`.gfui-ErrorAnnouncer`, with
     `aria-live` and no `alert` role, so it doesn't collide with an app's
     own alerts);
   - the console reporter, which receives what was thrown.
   - Without any App: the console only.

**Sources:** `handler`, `lifecycle`, `loader`, `render`, `navigation` (the
router's `willNavigate`/`didNavigate`), and `internal` (watchers, a batch
left open).

**Not errors:**
- Cancellations (`HandlerCancelledError`, `RequestCancelledError`).
- Developer diagnostics, which go to `reportDiagnostic` (console warnings):
  - List, Table and Tree duplicate ids;
  - a Table column's bad type;
  - an input bound outside a Form;
  - hydration's recoverable errors.
- The Table's read-only-row hint is a handler error: it's a bug in the
  app's handler.

**First render:** a boundary catches during the commit, before the App's
layout effect has registered its sink. `RenderBoundary` therefore reports one
microtask later.

## Boundaries

- **`RenderBoundary`** (`ErrorBoundary` with the panel `.gfui-ErrorPanel`:
  "Something went wrong", the message, "Try again") sits:
  - around each `Page`;
  - inside Shell around the App's content, after Shell counts its children
    for the layout's wrapper rule. Its `resetKey` is the path, so a
    navigation clears it.

  The header, nav and footer stay usable. A render error in the shell itself
  is uncaught: React removes the app, and `onUncaughtError` reports it.
- **`Fallback`:**
  - `errorTemplate` (`$error`), `loadingTemplate` with `isLoading`; the API
    `reset()` and `error`.
  - The first error wins.
  - The templates render outside its provider and boundary, so their errors
    go to the next Fallback out.
  - `reset()` clears the error and remounts the children (a new boundary
    key). A DataSource refetches its failed query on mount (query-core's
    `retryOnMount`).
  - Without an `errorTemplate`, an error shows nothing.
- **In the prerender:** `renderToString` ignores class boundaries, and its
  error callback is empty. So `Fallback` puts a `Suspense` boundary around
  its children:
  - a throwing child leaves `<!--$!--><template></template><!--/$-->`, and
    the rest of the page is prerendered;
  - the browser renders the section: the content, or the template if it
    fails again;
  - hydration keeps every other DOM node (`components/tests/errors.test.tsx`);
  - the build prints a warning per page with such markers;
  - a render error outside any `Fallback` still fails the build.

## `RetryPolicy`

- **Props:** `attempts` (3), `backoff` (`fixed`, `linear`,
  `exponential`; default exponential), `delayMs` (500), `jitter` (true),
  `onlyCategories` (a comma list or an array), `timeoutMs`,
  `honourRetryAfter` (true), `circuitBreaker` (`{ failureThreshold, resetMs
  }`).
- **Which DataSources:** the policy applies to the DataSources inside it
  (decision E1: reads only; APICall keeps its `retries`). The nearest policy
  wins.
- **Precedence:** a DataSource's own `retries`/`retryDelay` win over the
  policy, and its `timeoutMs` over the policy's.
- **Mechanism:** query-core's `retry`/`retryDelay` (measured against a loop
  inside `queryFn`). The attempts stay visible (`failureCount`), and requests
  with one key are shared: the first fetch's policy applies.
- **Delays:** `fixed` is `delayMs`; `linear` is `delayMs × n`; `exponential`
  is `delayMs × 2^(n−1)`. One backoff is capped at 30 s, with ±25% jitter.
  `Retry-After` wins unless `honourRetryAfter="false"` (capped at 60 s).
- **`onlyCategories`** replaces the errors' `retryable` flags (it can retry a
  409). `circuit-open` and `user-cancelled` are never retried.
- **On exhaustion:** the last error with `attempts` (not XMLUI's
  `retry-exhausted`).
- **The circuit breaker:** one per RetryPolicy instance, shared by its
  DataSources.
  - `failureThreshold` failed attempts in a row open it.
  - While open, `queryFn` throws `circuit-open` (`category` server, not
    retryable, `data.resetInMs`) without a request.
  - After `resetMs`, one probe: a success closes it, a failure opens it
    again.

## Divergences from XMLUI

| XMLUI | Here |
|-------|------|
| Render errors outside a `Fallback`: a box per container; never reach `App onError` (`ErrorBoundary.tsx` line 56) | A panel per Page and for the App content; they reach `App onError` |
| `retry-exhausted` wraps the last error | The last error, with `attempts` |
| `onlyCategories` only narrows (`policy.ts` line 239) | It is the set of retried categories |
| A `Fallback` can't recover (its failed loader is unmounted) | `reset()` |
| `strictErrors`; `AppError` not constructible in script | No warning; `new AppError({...})` |
| No `timeout` or `parse` categories | Both |
| Per-element `onError(event)` with `{ source, error: { message, stack } }` | `onError(error: AppError, source)` |
| `X-Correlation-Id` documented, never read | Read |
| RetryPolicy's own loop inside `queryFn` | query-core's retry |
| Hydration's recoverable errors and developer warnings | Diagnostics, console only |

## Tests

| File | Covers |
|------|--------|
| `runtime/tests/errors/app-error.test.ts` | Categories and retryable defaults, statuses, the class (frozen, absent fields, a bad category), `toJSON`, `withFields`, `AppError.from` for each kind of value, data errors as AppErrors |
| `runtime/tests/errors/pipeline.test.ts` | Without an App; sinks; the App's sink: the default report, `preventDefault`, `false`, async, a throwing handler, the buffer of 50, the handler read late |
| `runtime/tests/data/retry-policy.test.ts` | The three backoffs, caps, Retry-After, jitter; which errors are retried; the circuit breaker's states; a Loader with a policy and a shared breaker against the mock backend; the correlation id |
| `compiler/tests/module/errors.test.ts` | `onError` on any element (lifecycle) and on App and DataSource (their own event); `new AppError` and `App.errors` compile |
| `components/tests/errors.test.tsx` | In markup: App onError and App.errors, the default report, AppError in script, diagnostics kept out; the per-element onError; DataSource errors; Fallback (render error, loader error and reset, a handled one, nested, loading); the Page boundary; RetryPolicy (attempts, own retries win, the circuit); the prerender: markers, hydration keeping nodes, a client that recovers or fails, a build that fails outside a Fallback |
| `vite-plugin/tests/prerender.test.ts` | `clientRenderedSections` |
| `e2e/errors.spec.ts` | The playground's "Errors and recovery": retries and giving up, a timed Retry-After, the circuit (3 requests, then fast failures), a Fallback with its reference and Try again, a throwing component, the toast, the announcement, the button's own onError, App onError keeping it quiet |
