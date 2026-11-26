# Data binding

> Subsystem reference: `DataSource`, `APICall`, the `data` URL shorthand,
> and the runtime underneath them: the HTTP gate, errors, the retry policy,
> the query engine. Describes the code as it is. Design, XMLUI comparison,
> the scenario catalog and findings: [`../plan/poc-20-data.md`](../plan/poc-20-data.md).
> The mock backend the tests talk to: [mock-backend.md](mock-backend.md).
>
> **Last updated:** step 20.

## Using it

```xml
<DataSource id="users" url="/api/users" queryParams="{{ q: search }}"/>
<DataSource id="user" url="/api/users/{selected}"/>             <!-- no request while selected is null -->
<DataSource id="admins" url="/api/users" when="{showAdmins}"/>   <!-- stays mounted; loaded reads false -->

<Text when="{users.inProgress}">Loading…</Text>
<Text when="{users.error}">{users.error.message} ({users.error.category}, {users.error.attempts} attempts)</Text>
<Items data="{users.value}"><Text>{$item.name}</Text></Items>
<Button label="Reload" onClick="users.refetch()"/>
<Button label="Stop" when="{users.inProgress}" onClick="users.cancel()"/>

<APICall id="rename" method="put" url="/api/users/{$param.id}" body="{$param}" invalidates="/api/users"
  onSuccess="(user) => message = 'Saved ' + user.name"
  onError="(error) => message = error.body.errors.name ?? error.message"/>
<Button label="Save" handlerPolicy="drop-while-running" onClick="rename.execute(draft)"/>

<Items data="/api/users"><Text>{$item.name}</Text></Items>      <!-- the data URL shorthand -->
```

**DataSource:**
- **Props:** `url`, `method` (get), `queryParams`, `headers`, `body`,
  `when`, `resultSelector` (a path), `transformResult` (a function;
  a literal is code), `pollIntervalInSeconds`, `structuralSharing` (true),
  `retries` (2 for get, else 0), `retryDelay` (500 ms), `timeoutMs`
  (30000, per attempt).
- **API:** `value`, `inProgress`, `isRefetching`, `loaded`, `error`,
  `cancelled`, `lastCancelReason`, `responseHeaders`, `refetch()`,
  `cancel(reason?)`.
- **Events:** `loaded(data, isRefetch)`, `error(error)`, `cancel(reason)`.

**APICall:**
- **Props:** `url`, `method` (get, as in XMLUI), `queryParams`, `headers`,
  `body` and `invalidates`. All of these are evaluated at `execute()` time,
  with `$param` and `$params`. Also `retries` (0), `retryDelay`,
  `timeoutMs`.
- **API:** `execute(...params)` (a promise of the result), `cancel(reason?)`,
  `inProgress`, `loaded`, `lastResult`, `lastError`, `cancelled`,
  `lastCancelReason`, `lastResponseHeaders`.
- **Events:** `beforeRequest(...params)` (false skips the call),
  `success(result)` (false skips the invalidation), `error(error)`,
  `cancel(reason)`.

## Behavior

| Topic | What happens |
|-------|--------------|
| **The request** | The URL is resolved against the page. `queryParams` arrays repeat the key; null and undefined are left out. An object `body` is JSON (with its content type); a string is sent as it is; a GET has no body. |
| **The response** | JSON by content type, else text; 204 is `undefined`; an HTML page where data was expected, or invalid JSON, is a `parse` error. |
| **Errors** | One plain, frozen object (body included): `{ message, category, code, status, statusText, retryable, body, method, url, attempts, retryAfterMs }`. The categories are XMLUI's (validation 400/422, authorization 401/403, not-found, conflict, rate-limit 429, server 5xx, network, internal) plus `parse` and `timeout`. `message` is the body's `message` when it has one. |
| **Retry** | Only `retryable` errors: network, timeout, rate-limit, server. Backoff is `retryDelay × 2^(n−1)`, capped at 30 s, ±25% jitter. `Retry-After` (seconds or a date) wins, capped at 60 s. A cancel during the wait ends it. |
| **Timeout** | Per attempt (`timeoutMs`); category `timeout`, retryable. |
| **Deduplication** | The query key is method, path, query, body and headers. Two DataSources with the same key share one request and one cache entry. |
| **A changed key** | A new query. The old one is aborted when no one else uses it, and its late answer can't reach this DataSource. |
| **Dependent queries** | A `url` interpolation with a null or undefined part is `undefined` as a whole (`nullishUnresolved`): no request, `inProgress` false. `when` false likewise. The DataSource stays mounted (`whenIsProp`), so `loaded` reads false, not undefined. |
| **Refetch** | Joins a running fetch. The old value stays visible (`isRefetching`). A failed refetch keeps the value and sets `error`; the next success clears it. Structural sharing: equal data keeps its reference and fires no `loaded`. |
| **Cancel** | `cancel()` aborts the fetch and its retries. The previous value stays; `cancelled` and `lastCancelReason` are set; a new fetch clears `cancelled`. Not an error. |
| **Unmount** | The request is aborted if no one else uses it; no event fires afterwards. The unmount is deferred by a microtask, so StrictMode's simulated unmount doesn't repeat the request. |
| **Polling** | `refetchInterval`; no overlap with a running fetch; stops on unmount. |
| **APICall overlap** | Each `execute()` is its own request. `lastResult` and `lastError` belong to the call *started* last. A double click is the caller's policy (`handlerPolicy`). |
| **APICall and the calling handler** | `execute()` listens to the handler's `$cancel` (`currentInvocation()`). A superseded, timed-out or unmounted handler aborts its request (reason `supersede`, `timeout`, `unmount`). |
| **APICall errors** | With `onError` (or `errorNotificationMessage`, step 27): it is called, and `execute()` resolves `undefined`. Without them, `execute()` rejects, the handler stops, and the error is reported once. |
| **APICall confirmation and notifications (step 27)** | `confirmTitle`/`confirmMessage` (with `confirmButtonLabel`) ask with `confirm()` before `beforeRequest`; "Cancel" skips the call (`execute()` resolves `undefined`). `inProgressNotificationMessage` shows a loading toast once the request starts; `completedNotificationMessage` (`$result`) and `errorNotificationMessage` (`$error`) replace it; without them it goes. All are `deferred` props with `$param`/`$params`. The calling handler is read before the confirmation's `await` and passed to `ApiCaller.execute` (its `invocation` parameter), so its cancellation still aborts the request. |
| **Invalidation** | After success: the queries whose path is an `invalidates` path, or lies below it. Without `invalidates`, every query (XMLUI). Active ones refetch. |
| **Server render** | No fetch. The component API is published in an effect, so `users.inProgress` is undefined on the server and in the first client render, and the takeover is clean. Loading shows after it. |

## Who does what

| Part | Does |
|------|------|
| `runtime/src/data/http.ts` | `sendRequest(spec, signal)`: one attempt, timeout, parse, errors; `buildUrl`, `parseRetryAfter`, `RequestCancelledError` |
| `runtime/src/data/errors.ts` | `DataError`, `categoryOfStatus`, `dataError`, `httpError`, `toDataError`, `withAttempts` |
| `runtime/src/data/retry.ts` | `shouldRetry`, `retryDelay`, `runWithRetry`, `sleep`, `setRetryJitter` |
| `runtime/src/data/client.ts` | `@tanstack/query-core`'s client, one per page: `networkMode: "always"` (offline is an error, not a pause), no focus or reconnect refetch, notifications in one signal batch on a microtask. Also `queryKey`, `invalidate`, `pathMatches`, `resetDataState`, `setDataDefaults({ jitter })`. |
| `runtime/src/data/loader.ts` | `Loader`: a `QueryObserver` bridged into one signal (`LoaderState`), its events, `refetch`, `cancel`. The first state is the optimistic one (`_optimisticResults: "optimistic"`, as React Query does). |
| `runtime/src/data/api-call.ts` | `ApiCaller`: `execute` (beforeRequest, the request with retries, success, invalidation, error, cancel; the calling `invocation`, by default the current one), `cancel`, `dispose`/`activate` |
| `runtime/src/render/deferred.ts` | `deferredValue(scope, binding)`: a prop evaluated later with context variables; `isDeferred`, `resolveDeferred` |
| `components/src/data.tsx` | `DataSource`, `APICall`, `DataUrl`, `isDataUrl`: the React shells (`useLoader`, the API getters, the events) |
| `components/src/items.tsx` | `Items` with a URL in `data` renders through `DataUrl` |
| **The compiler** (`compile-module.ts`, `codegen/compile.ts`) | `whenIsProp` (a component's `when` as a prop; `when-*` is E002); `deferred` props as `$$deferred(scope, $$dN)`; `code` props (a literal compiled as an expression); `nullishUnresolved` interpolations; `eventResults` (handlers return their result: `results: true` on `Bound`) |

## Size

In a production build of `test-apps/data`, the rendered length of the
modules (`tools/data-build.test.ts`): `@tanstack/query-core` about 63 kB, and
gfui's data code (`runtime/src/data`, `components/src/data.tsx`) about 23 kB.

## Tests

| File | Covers (catalog rows of the plan) |
|------|-----------------------------------|
| `runtime/tests/data/http.test.ts` | Scripted `fetch` and fake timers: the request, the response, the error table (X1–X4, X6), timeout (S2), cancellation (C5), the retry policy and exact backoff (R1–R4, R6, C2) |
| `runtime/tests/data/loader.test.ts` | `Loader` against the mock backend (MSW in Node): pending first, deduplication, disabled, key change aborts, structural sharing, slow refetch, polling, out of order, unmount, cancel, retries, refetch errors, a throwing transform (L1–L7, O1, O3, C1, C5, R1, R2, X5, S3) |
| `runtime/tests/data/api-call.test.ts` | `ApiCaller`: execute with invalidation, beforeRequest, success false, no `invalidates`, error handling, opt-in retries, rejection, overlap, cancel, the calling handler superseded, dispose (O2, C3, C4, R5, X7, W1–W5) |
| `compiler/tests/module/data.test.ts` | `when` as a prop, `when-*` E002, the nullish URL, `transformResult` as code, deferred props, `$param` only where deferred, `results: true` |
| `components/tests/data.test.tsx` | Compiled markup in jsdom against the mock backend: list and search, dependent queries, transforms and `onLoaded`, errors and `onError`, refetch errors, cancel, unmount, `Items data` URL, APICall with `$param`, 422 field errors, beforeRequest, rejection without `onError`, single-flight supersede, cancel |
| `e2e/data.spec.ts` (projects `data-worker`, `data-server`) | `test-apps/data` in Chromium, against both mock hosts: real requests (M2), deduplication, slow network, typing out of order, retries, offline, hang and Stop, rename and refetch, validation errors, slow double click |
| `e2e/playground-scenarios.spec.ts` | The playground's Data scenario and its network panel |
| `tools/data-build.test.ts` | No mock code in a production build unless asked (M3) |
