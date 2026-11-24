# Step 20: Data binding (`DataSource`, `APICall`) and a mock backend

**Status:** Done

## Goal

- **Reading and writing server data from markup:**
  - `DataSource` loads data and exposes its state (`value`, `inProgress`,
    `loaded`, `error`, …), with dependent queries, transforms, polling and
    cancellation.
  - `APICall` writes: `execute()` with parameters, its events, and
    invalidation of the `DataSource`s it affects.
  - Both go through one HTTP gate with defined behavior for errors,
    retries, timeouts and cancellation.
- **A mock backend the app doesn't know about.**
  - The app makes ordinary `fetch` requests to ordinary URLs. Nothing in
    the app, its markup, its compiled code or the data layer changes
    between the mock and a real server.
  - The same mock backend serves three hosts:
    - development and the playground;
    - the unit and integration tests;
    - the E2E tests.
  - It can be told to be slow, to fail, to fail and then recover, to hang,
    to drop the connection, or to hold a request until a test releases it.
- **Careful testing of the usual hard cases:**
  - cancellation;
  - retry;
  - every kind of error;
  - slow networks;
  - out-of-order responses;
  - unmounting mid-request.

  There is a scenario catalog (§ 6), and every row is a test.

**Why now:** forms (step 22), lists and tables (steps 29–31) need it, and a
mock backend has to exist before any of them can be tested realistically.

## Background

### Here

- **No data layer yet.**
  - `Items data="{…}"` takes arrays from expressions only.
  - The architecture lists `@tanstack/react-query` for `DataSource` and
    `APICall` (`architecture.md`, component map). The handoff marks that as
    a decision still to make.
- **Pieces this step builds on:**
  - **Handlers (step 7, `async-handlers.md`):**
    - implicit `await`;
    - `$cancel` (an `AbortSignal` with the reasons `supersede`, `timeout`,
      `unmount`, `user`);
    - handler policies;
    - `currentInvocation()`, which cancel-aware services use: `delay`
      rejects when its handler is aborted.
  - **Component APIs (step 8, `component-api.ts`):** an `id` exposes a
    frozen API whose values are getters over signals, so `users.value` is
    reactive.
  - **The sandbox invariant (step 3):** no platform object reaches script.
    `$error` must be a plain frozen object, not a `Response` or an `Error`.
  - **Static generation (step 13):** a prerendered page is taken over
    without replacing nodes, so a `DataSource`'s first render must be the
    same on the server and in the browser.
  - **Signals with one subscription per component (step 4):** the store
    the data state lives in.

### XMLUI

- **Concepts:** `.ai/xmlui/data.md`. Each `DataSource` has `value`,
  `inProgress`, `loaded` and `error`; `url` with expressions; dependent
  queries; `transformResult`, `resultSelector`, polling. Each `APICall` has
  `execute(...)` with `$param`/`$params`, `beforeRequest`/`success`/`error`,
  and `invalidates`.
- **Reference:**
  - `website/content/docs/reference/components/DataSource.md`:
    - `cancel()`, `cancelled`, `lastCancelReason`, `isRefetching`,
      `responseHeaders`;
    - the events `loaded(data, isRefetch)`, `error`, `cancel(reason)`;
    - structural sharing: no `loaded` event when a refetch returns equal
      data;
    - `mockData`, `onFetch`.
  - `APICall.md`:
    - `lastResult`, `lastError`, `cancel()`;
    - `success` returning `false` suppresses invalidation;
    - `mockExecute`, `deferredMode` with status polling;
    - notifications, `confirmMessage`.
- **Its query engine** is `@tanstack/react-query`
  (`components-core/rendering/AppRoot.tsx` L24,
  `refetchOnWindowFocus: false`).
  - **No automatic retries:** `components-core/loader/Loader.tsx` L120 has
    `retry: false`. Retries come only from an ancestor `<RetryPolicy>`
    (`Loader.tsx` L64–91; `components-core/errors/policy.ts`: attempts,
    fixed/linear/exponential backoff, jitter, `onlyCategories`,
    `timeoutMs`, `Retry-After`).
- **Structured errors:** `components-core/errors/app-error.ts`.
  - The categories are `network`, `validation` (400, 422), `authorization`
    (401, 403), `not-found`, `conflict`, `rate-limit` (429), `server` (5xx),
    `internal` and `user-cancelled`.
  - Each category has a default `retryable` (L32–42). The status mapping is
    `categorizeHttpStatus` (L181).
- **What `APICall` invalidates:** without `invalidates`, *every* cached query
  (`components-core/utils/actionUtils.ts` L28–30). Its props are evaluated
  at `execute()` time with `$param`/`$params` in scope
  (`components-core/action/APICall.tsx` L342, L359).
- **Its mock backend, the "API interceptor"**
  (`components-core/interception/`):
  - **Definition:** operations with a URL, a method and a handler written
    in XMLUI script with `$state`, `$pathParams`, `$requestBody`, plus an
    in-memory or IndexedDB database. The docs' `---api` blocks use it
    (`APICall.md` § deferredMode).
  - **Two modes:**
    - An MSW Service Worker (`apiInterceptorWorker.ts`). The requests are
      real.
    - `useWorker: false`, where the app's own HTTP proxy asks the
      interceptor first (`RestApiProxy.ts` L734:
      `apiInstance.hasMockForRequest`). Here the app does know.
  - **A documented flakiness:** starting and stopping the worker per test
    raced, and mocking was silently disabled (`apiInterceptorWorker.ts`
    L40–80 comments).
- **`mockData` / `onFetch` / `mockExecute`** are mocking in markup: the app
  knows it is mocked.

## Options considered

### The query engine

| Option | For | Against |
|--------|-----|---------|
| (a) `@tanstack/react-query` (hooks) | XMLUI's choice; familiar | A second subscription system beside our signals. It needs a provider in the tree and React-specific SSR handling, and its state lives in React, not in our store. |
| **(b) `@tanstack/query-core`, bridged to signals** | The same engine (deduplication, cache, invalidation, retry with backoff, `AbortSignal` cancellation, structural sharing, polling) without React. A `QueryObserver` per `DataSource` writes its result into one signal, so `users.value` is reactive like everything else. | We write the bridge (small) |
| (c) Our own cache | No dependency | Re-implements deduplication, garbage collection, structural sharing and retry timing; the risky parts |

**Recommended: (b).** `APICall` doesn't need TanStack's mutations. Its
`execute` is our own: the same HTTP gate and retry policy, then
`queryClient.invalidateQueries(…)`.

### Mocking the backend so the app doesn't know

| Option | The app knows? | For | Against |
|--------|----------------|-----|---------|
| Mock props in markup (`mockData`, `onFetch`, XMLUI) | **Yes** | Simple | The markup changes between mock and real; the HTTP path isn't tested |
| Patching `fetch` in the page, or a check in our HTTP gate (XMLUI's `useWorker: false`) | **Yes** (the process is modified) | No service worker | Our gate behaves differently under test |
| Playwright `page.route` | No | Good for E2E | Tests only: no development, no playground, no unit tests; a second mock to maintain |
| **One backend, written as a Fetch-API handler `(Request) => Response`, mounted by different hosts** | **No** | The app makes real requests in every host; one definition; standard types | We write the hosts (thin) |

**Recommended: the last one.** The backend is a plain function from a
standard `Request` to a standard `Response`, with no framework types. The
hosts:

| Host | Where | How the request travels |
|------|-------|-------------------------|
| **Service worker** (MSW 3 `setupWorker`) | Development, the playground, static builds (preview, a demo site), E2E project `data-worker` | The page's `fetch` goes to the network stack; the service worker answers. DevTools shows the request; Playwright sees it (`response.fromServiceWorker()`). |
| **Dev-server middleware** (Vite plugin) | Development, E2E project `data-server` | Real HTTP over a socket to the Vite server in Node. No service worker at all. |
| **In-process server** (MSW 3 `setupServer`, `msw/node`) | Vitest (jsdom) integration tests | `fetch` in Node is intercepted below the app; the app's code is unchanged. |

- **Running the E2E suite against both browser hosts** proves the claim.
  The same tests pass whether the answer comes from a service worker or a
  real HTTP server, so the app can't depend on either.
- **Nothing is injected into the app.** The Vite plugin starts the worker
  *before* the app's entry runs. It replaces the page's entry
  `<script type="module" src="/src/main.tsx">` with a bootstrap that awaits
  the worker, then imports the entry. `main.tsx`, `mountApp`, the
  compiled markup and the data layer stay unchanged. In middleware mode
  nothing at all is injected into the page.
- **XMLUI's worker race** came from starting and stopping per test remount.
  Here the worker starts once per page load and is never stopped. Tests
  reset the backend's *state* through its control endpoint, not the
  worker.

## Design

### 1. The mock backend (`@patchfuil/mock-backend`, new package)

A backend is defined in TypeScript (development tooling, so types and a
debugger help):

```ts
// test-apps/data/src/backend.ts (the playground has its own)
import { defineBackend, created, noContent, status } from "@patchfuil/mock-backend";

export default defineBackend({
  // Collections, reset to this on POST /__mock/reset
  seed: {
    users: [
      { id: 1, name: "Ada Lovelace", role: "admin" },
      { id: 2, name: "Alan Turing", role: "editor" },
    ],
  },
  routes: {
    "GET /api/users": ({ db, query }) => db.users.list({ search: query.q, sort: query.sort }),
    "GET /api/users/:id": ({ db, params }) => db.users.get(params.id) ?? status(404, { message: "No such user" }),
    "POST /api/users": ({ db, body }) =>
      body?.name ? created(db.users.insert(body)) : status(422, { errors: { name: "Required" } }),
    "PUT /api/users/:id": ({ db, params, body }) => db.users.update(params.id, body) ?? status(404),
    "DELETE /api/users/:id": ({ db, params }) => (db.users.remove(params.id) ? noContent() : status(404)),
  },
});
```

- **A route returns** a value (JSON, 200), a `Response`, or a helper's
  result: `status(code, body?, headers?)`, `created`, `noContent`,
  `notFound`.
- **`db`** is an in-memory store of collections (`list`, `get`, `insert`,
  `update`, `remove`), deep-copied in and out, so the UI can never hold a
  reference into the backend.
- **The handler** is `backend.handle(request: Request): Promise<Response>`.
  It routes, applies the faults (below), logs the request, and runs the
  route.

**Faults: the network and the server misbehaving on purpose.** A fault is
a rule matched against the request (`route`, or a method and a URL
pattern), applied `times` times (default: until removed) or with a
`probability` (a seeded random generator, so runs repeat). Each fault does
one of these:

| Fault | Simulates | The app sees |
|-------|-----------|--------------|
| `latency: 1500` or `{ min, max }` | A slow network or server | `inProgress` for that long |
| `status: 503, headers: { "Retry-After": "2" }` | A server error, rate limiting | An error of category `server` or `rate-limit` |
| `status: 422, body: {…}` (any status) | Validation, auth, not found, conflict | That category, with the body |
| `network: "error"` | A dropped connection, offline, DNS | A `network` error (`fetch` rejects) |
| `network: "hang"` | A server that never answers | Only a timeout or a cancel ends it |
| `body: "<html>…", contentType: "text/html"` | A broken response (a proxy's error page, truncated JSON) | A `parse` error |
| `hold: true` | Nothing by itself: the request waits until released | Lets a test choose the order of responses |

- **Holds** are for races. A test holds `GET /api/users?q=a` and
  `GET /api/users?q=ab`, releases the second, and then the first. The
  first one's answer must not win.
- **The request log:** every request, with its method, URL, body, start and
  end time, and outcome (answered, faulted, held, aborted where the host
  can see it). Tests assert on it: "three attempts", "one request for two
  `DataSource`s", "no request while `when` is false".

**The control endpoints** live under `/__mock` (configurable). They are part
of the backend, so tests and the playground drive it over HTTP like a real
test harness would:

| Endpoint | Does |
|----------|------|
| `POST /__mock/reset` | Re-seeds the collections; clears the faults, holds and the log |
| `POST /__mock/faults` / `DELETE /__mock/faults` | Adds a fault (returns its id) / removes them all |
| `GET /__mock/holds`, `POST /__mock/holds/:id/release` | Lists held requests; releases one, optionally with a fault (`{ status: 500 }`) |
| `GET /__mock/requests` | The request log |
| `PUT /__mock/latency` | The default latency of every route (the network's speed) |

**The hosts:**
- `createWorker(backend)` (browser, MSW `setupWorker`);
- `createServer(backend)` (Node, MSW `setupServer`);
- `middleware(backend)` (Node: a Connect middleware for Vite, converting
  `IncomingMessage` to a `Request`).

They are thin, because the backend is already a `Request → Response`
function.

**The Vite plugin** (*as built:* a second plugin, not an option of
`pfui()`. Vite allows one HTML transform per plugin, and this one must run
before Vite's, while the prerender runs after it):

```ts
plugins: [pfui(), pfuiMockBackend({ module: "src/backend.ts", host: "worker" /* or "middleware" */, build: false }), react()]
```

- In development:
  - with `"worker"`, the plugin serves MSW's `mockServiceWorker.js` and
    replaces the entry script with the bootstrap;
  - with `"middleware"`, it mounts the backend on the dev server.
- `build: true` keeps the worker host in production builds (the
  playground's preview, a demo site) and copies the worker script.
  Otherwise a build contains no mock code at all (checked by a build-output
  test).

### 2. The HTTP gate (`runtime/src/data/`)

All data traffic goes through one function: `request(spec, signal)`. This
is the "centralized HTTP" of `architecture.md`.

- **The request:**
  - `url` relative to the page;
  - `queryParams` (an object; arrays become repeated keys; `null` and
    `undefined` are left out);
  - `method`;
  - `headers`;
  - `body`: an object becomes JSON with its content type, a string is
    sent as it is.
- **The response:**
  - JSON when the content type says so, else text;
  - 204 means `undefined`;
  - `responseHeaders` becomes a plain object.
- **Errors** become a plain, frozen object (the sandbox invariant):

  ```js
  { message, category, code, status, statusText, retryable, body, method, url, attempts }
  ```

  - The categories are XMLUI's (`app-error.ts`) plus `parse` and
    `timeout`.
  - `code` is the precise kind: `http-503`, `network`, `timeout`, `aborted`,
    `parse`.
  - `retryable` follows XMLUI's defaults per category; `timeout` is
    retryable and `parse` is not.
- **Timeout:** `timeoutMs` per attempt (default 30000). It aborts the
  attempt with the category `timeout`.
- **Retry** (`retries`, `retryDelay`; the defaults are in § 3 and § 4):
  - only `retryable` errors are retried;
  - exponential backoff (`retryDelay` ms × 2^n, capped at 30 s) with
    ±25% jitter;
  - `Retry-After` (seconds or a date) is honoured, capped at 60 s;
  - jitter can be turned off (`setDataDefaults({ jitter: false })`), so
    tests are exact.
- **Cancellation:** one `AbortSignal` ends the current attempt *and* the
  wait between attempts. A cancelled request settles as cancelled, never as
  an error.
- **Tied to the calling handler:** an `APICall.execute()` called from a
  handler listens to that handler's `$cancel` (`currentInvocation()`, as
  `delay` does). A superseded, timed-out or unmounted handler aborts its
  request.
  - *As built:* not `DataSource.refetch()`. A refetch joins the query that
    every DataSource with that key shares, and one handler's cancellation
    must not cancel the others' fetch.

### 3. `DataSource`

```xml
<DataSource id="users" url="/api/users" queryParams="{{ q: search, sort }}"/>
<DataSource id="user" url="/api/users/{selectedId}" when="{selectedId}"/>

<Text when="{users.inProgress}">Loading…</Text>
<Text when="{users.error}">Couldn't load users: {users.error.message}</Text>
<Items data="{users.value}"><UserRow user="{$item}"/></Items>
<Button label="Reload" onClick="users.refetch()" enabled="{!users.inProgress}"/>
<Button label="Stop" onClick="users.cancel()" when="{users.inProgress}"/>
```

**Props:**
- `url`, `method` (`get`), `queryParams`, `headers`, `body`;
- `resultSelector` (a path: `data.items`);
- `transformResult` (a function expression);
- `pollIntervalInSeconds`;
- `structuralSharing` (default true);
- `retries`: default 2 for a `get`, so 3 attempts; 0 for other methods;
- `retryDelay` (default 500 ms);
- `timeoutMs`.

**API** (all reactive):
- the state: `value`, `inProgress`, `isRefetching`, `loaded`, `error`,
  `cancelled`, `lastCancelReason`, `responseHeaders`, `attempts`;
- the methods: `refetch()` (a promise, settled when the refetch ends) and
  `cancel(reason?)` (true if something was cancelled).

**Events:**
- `loaded(data, isRefetch)`: once per completed fetch, not fired when a
  refetch returns equal data, as in XMLUI;
- `error(error)`;
- `cancel(reason)`.

**Behavior:**
- **The query key** is method, resolved URL, query parameters, body and
  headers. Two `DataSource`s with the same key share one request and one
  cache entry.
- **A changed key** starts a new query. The previous one, if no one else
  uses it, is aborted. Its late answer can't reach this `DataSource`,
  because the observer has switched keys.
- **Dependent queries:** while `url` has an unresolved part (an `undefined`
  or `null` in an interpolation) the query is disabled, so there is no
  request and `inProgress` is false. The same is true when `when` is
  false (decision 3).
- **A refetch** keeps the old `value` visible (`isRefetching` is true) and
  replaces it at the end. An error after a refetch keeps the old `value`
  and sets `error`; the next success clears `error`.
- **Unmounting** aborts a request no one else uses. No event fires after
  unmount.
- **Polling** stops on unmount and while a fetch is running. It doesn't
  pile up.
- **Server render:** `DataSource` renders nothing. On the server and in the
  first client render its state is "pending" (`inProgress` true, `value`
  undefined), so a prerendered "Loading…" is taken over unchanged and the
  fetch starts in the browser.

### 4. `APICall`

```xml
<APICall
  id="saveUser"
  method="put"
  url="/api/users/{$param.id}"
  body="{$param}"
  invalidates="/api/users"
  onSuccess="(user) => toastText = 'Saved ' + user.name"
  onError="(error) => formError = error.category === 'validation' ? error.body.errors : error.message"/>

<Button label="Save" onClick="saveUser.execute(draft)" enabled="{!saveUser.inProgress}"/>
<Button label="Cancel" onClick="saveUser.cancel()" when="{saveUser.inProgress}"/>
```

**Props:**
- `url`, `method` (`get`, as in XMLUI), `queryParams`, `headers`, `body`.
  These are evaluated at `execute()` time with `$param` and `$params` in
  scope (XMLUI `APICall.tsx` L342).
- `invalidates`: a URL or a list of URLs; each invalidates the queries
  whose URL path equals it or lies below it. Without it, every query is
  invalidated, as in XMLUI (decision 4).
- `retries` (default 0: a write is not repeated unless asked), `retryDelay`,
  `timeoutMs`.

**API:**
- `execute(...params)`: a promise of the result. On an error it resolves
  to `undefined` when `onError` is handled, and rejects otherwise, so an
  unhandled failure stops the handler and is reported (decision 5).
- `cancel(reason?)`;
- the state: `inProgress`, `loaded`, `lastResult`, `lastError`,
  `cancelled`, `lastCancelReason`, `lastResponseHeaders`.

**Events:**
- `beforeRequest`: an explicit `false` skips the call;
- `success(result)`: an explicit `false` skips the invalidation;
- `error(error)`;
- `cancel(reason)`.

**Overlapping calls:** each `execute()` is its own request. `lastResult`
and `lastError` belong to the call that *started* last: an earlier call
finishing later doesn't overwrite them. A double-click is the caller's
policy (`handlerPolicy="drop-while-running"` on the button).

**The compiler** needs one new metadata feature for the props evaluated at
call time: `deferredProps: { url: ["$param", "$params"], … }`.
- Such props compile to functions of a context, like templates' context
  variables, instead of values.
- `$param` outside them is an unknown name as usual.

### 5. The `data` URL shorthand

`<Items data="/api/users">`: a literal `data` that starts with `/`, `./`,
`http://` or `https://` loads that URL, as if a `DataSource` without an `id`
stood in for it.
- *As built:* `Items` recognizes a URL in `data` at runtime (`isDataUrl`)
  and loads it through `DataUrl`; no compiler rewrite, no `loadable`
  metadata.
- So an expression whose value is a URL string loads it too, as XMLUI's
  "a string value is treated as a URL" says.

### 6. The scenario catalog (every row is a test)

Layers:
- **U:** unit; the HTTP gate and the bridge with a scripted `fetch` and
  fake timers.
- **I:** integration in jsdom: compiled markup against the mock backend in
  `setupServer`, with holds for ordering.
- **E:** E2E in Chromium, against both browser hosts, `data-worker` and
  `data-server`.

| # | Scenario | Expected | Layers |
|---|----------|----------|--------|
| **Loading** |
| L1 | First load | `inProgress` true → `value`, `loaded` true; `loaded` event once | U I E |
| L2 | Two `DataSource`s, same key | One request (log); both get the value | I E |
| L3 | Dependent query (`url` has an unresolved part, or `when` false) | No request until it resolves; then one | I E |
| L4 | Key change (`queryParams` from a search box) | A new request; the old one aborted when unused | I E |
| L5 | `resultSelector`, `transformResult` | Applied once per response; a throwing transform is an `internal` error | U I |
| L6 | Refetch returns equal data | Same reference (structural sharing); no `loaded` event | U I |
| L7 | Polling | One request per interval; none overlapping a slow one; none after unmount | U I |
| L8 | Prerendered page | *As built:* component APIs are published in an effect (step 8), so `users.inProgress` is undefined in the server render and in the first client render. The takeover is clean and "Loading…" shows after it. The Loader's first state is the same on the server and the client (unit). | U |
| **Out of order** |
| O1 | Type "a", then "ab"; answers arrive "ab", then "a" (holds) | The list shows "ab"'s result, and "a" never appears | I E |
| O2 | Two `execute()`s; the first finishes last | `lastResult` is the second call's | I |
| O3 | Navigate away while loading, then the answer arrives | No error, no event, no write; the request aborted | I E |
| **Cancellation** |
| C1 | `users.cancel()` while loading | `cancelled` true, `lastCancelReason` "user", `cancel` event; no `error`; the previous `value` kept | U I E |
| C2 | `cancel()` while waiting between retries | No further attempt (log); settles cancelled | U I |
| C3 | `saveUser.cancel()` during `execute()` | `execute()` resolves `undefined`; no `success`/`error`; `cancel` event | I E |
| C4 | The handler that called `execute()` is superseded (`handlerPolicy="single-flight"`) or unmounted | The request is aborted with that reason | I |
| C5 | `cancel()` when nothing runs | Returns false; nothing changes | U |
| **Retry** |
| R1 | 503 twice, then 200 (`times: 2`) | Three attempts (log); `value` set; no `error` event. (*As built:* `attempts` is on the error only.) | U I E |
| R2 | 503 every time | Three attempts, then `error` (category `server`, `attempts` 3); the backoff is 500, then 1000 ms (fake timers, no jitter) | U I |
| R3 | 429 with `Retry-After: 2` | The next attempt after 2 s, not the backoff | U |
| R4 | 404, 422, 401 | No retry: one attempt, its category | U I |
| R5 | `APICall` with 503 | No retry by default; `retries="2"` retries | U I |
| R6 | `retries="0"` on a `DataSource` | One attempt | U |
| **Errors** |
| X1 | Each status → category: 400/422 `validation`, 401/403 `authorization`, 404 `not-found`, 409 `conflict`, 429 `rate-limit`, 5xx `server` | The table | U |
| X2 | `network: "error"` | Category `network`, `retryable` | U I E |
| X3 | An HTML body where JSON was expected | Category `parse` | U I |
| X4 | 204 No Content | `value` undefined, no error | U |
| X5 | A refetch fails | The old `value` kept, `error` set; the next success clears it | I E |
| X6 | 422 with field errors | `error.body.errors` reachable from script; the error object is frozen and has no platform objects | U I |
| X7 | `execute()` fails without `onError` | The promise rejects; the error is reported once | I |
| **Slow network** |
| S1 | `latency: 1500` | `inProgress` for that long; a spinner shows | E |
| S2 | `network: "hang"` with `timeoutMs="500"` | Category `timeout` after 500 ms per attempt, then the retries | U I |
| S3 | A slow refetch | The old data stays visible; `isRefetching` true | I E |
| S4 | A slow save, clicked twice, with `handlerPolicy="drop-while-running"` | One request | E |
| **Writes** |
| W1 | `execute(draft)`: PUT, then `invalidates` | The list refetches and shows the change | I E |
| W2 | `beforeRequest` returns false | No request | I |
| W3 | `success` returns false | No invalidation | I |
| W4 | No `invalidates` | Every `DataSource` refetches | I |
| W5 | `$param` in `url` and `body` | Evaluated at call time with the arguments | I |
| **The mock itself** |
| M1 | Every route of the test backend; seeds; reset | The backend's own unit tests (`Request` in, `Response` out) | U |
| M2 | The app's requests are real | Playwright sees each request; in `data-worker` it is served by the service worker, in `data-server` over HTTP | E |
| M3 | A production build without `build: true` | No mock code, no worker script | E (build-output check) |

### 7. Where it shows

- **A test fixture, `test-apps/data`:**
  - a users list with search;
  - a details pane (dependent query);
  - an edit form (`APICall`);
  - a polling status badge.

  It runs in dev with the worker host (port 5182) and with the middleware
  host (5183). The E2E specs drive its faults through `/__mock`.
- **The playground gets a "Data" scenario:**
  - the same kind of users app;
  - a **network conditions panel**: latency, "fail the next 2 requests
    with 503", offline, hang, hold and release. The panel is itself built
    in markup with `APICall`s to `/__mock`, so it uses the feature it
    tests;
  - a live request log.

  The playground runs the worker host in dev and in its preview build.

## Steps

Built on one branch, `poc/20-data`, in this order (decision 7):

### 20A: The mock backend

- [x] `@patchfuil/mock-backend`:
  - `defineBackend`, routing with `:params`, the in-memory collections and
    the helpers;
  - faults, holds and the request log;
  - the `/__mock` control endpoints.
- [x] The hosts: `startWorker` (MSW), `startTestServer` (MSW node),
      `backendMiddleware`.
- [x] The Vite plugin `pfuiMockBackend` (a plugin of its own):
  - the bootstrap that replaces the entry script;
  - the worker script in dev and with `build: true`;
  - the middleware host.
- [x] `test-apps/data` with a first page that loads `/api/users` with
      plain `fetch` (before `DataSource` exists). E2E project pairs
      `data-worker` and `data-server`; M2, M3.

### 20B: The HTTP gate and `DataSource`

- [x] `runtime/src/data/`: `request()`, errors, timeouts, the retry
      policy, cancellation, the link to `currentInvocation()`.
- [x] `@tanstack/query-core`: one `QueryClient` per page (like the theme
      state), reset by `resetDataState()`. The `QueryObserver` → signal
      bridge.
- [x] `DataSource`: props, API, events, dependent queries, polling,
      transforms, server render.
- [x] Catalog rows L*, O1, O3, C1, C2, C5, R1–R4, R6, X1–X6, S1–S3.

### 20C: `APICall`, invalidation, the `data` shorthand

- [x] `deferred` props in metadata and the compiler; `APICall`; invalidation.
- [x] The `data` URL shorthand for `Items`.
- [x] Catalog rows O2, C3, C4, R5, X7, S4, W*.

### 20D: Playground and docs

- [x] The playground's backend, the "Data" scenario, the network conditions
      panel, the request log; the worker host in dev and preview.
- [x] `.ai/docs/data.md` and `.ai/docs/mock-backend.md`; update
      `code-structure.md` (packages, ports, E2E projects), `contracts.md`
      (`deferred`, `code`, `nullishUnresolved`, `whenIsProp`,
      `eventResults`; `loadable` wasn't needed: `Items` recognizes a URL at
      runtime), `poc-steps.md`, the handoff.

## Verification

- Every catalog row is a test in the layers it names. The plan lists the
  test names in *Outcome*.
- **Both browser hosts:** the E2E data suite runs twice, `data-worker` and
  `data-server`. Passing both is the evidence that the app doesn't know
  what it talks to.
- **Determinism:**
  - no `sleep` in tests: holds for ordering, fake timers for backoff and
    timeouts, latency faults only where the time itself is the claim (S1);
  - seeded randomness for probabilistic faults;
  - the playground's flaky-network demo uses the same seeds.
- **Bundle:** `query-core` and the data layer measured in a production
  build of the fixture; no mock code in it.
- `npm run check` stays free of warnings. MSW's console output is turned
  off (`quiet`).

## Divergences from XMLUI (proposed)

| XMLUI | Here | Why |
|-------|------|-----|
| `@tanstack/react-query` | `@tanstack/query-core` bridged to our signals | One reactive store; no provider; consistent SSR |
| No automatic retries (`Loader.tsx` L120); `<RetryPolicy>` | `get` `DataSource`s retry twice on retryable errors by default; writes never by default | Transient failures are common; repeating a read is safe, repeating a write isn't. `<RetryPolicy>` can come with step 33. |
| Mocking in markup (`mockData`, `onFetch`, `mockExecute`) and an interceptor the app's proxy can ask | A separate backend in standard `Request`/`Response` terms, hosted by a service worker, a dev server or a test server | The app can't tell, and its HTTP path is what the tests exercise |
| Error categories | The same, plus `parse` and `timeout` | A broken body and a timeout need their own handling |
| Not in this step | Notifications (needs toast, step 27), `confirmMessage` (dialogs, step 27), `deferredMode`, paging selectors, `dataType` csv, `FileUpload`/`FileDownload`, `Actions.callApi`, `<RetryPolicy>` | Scope |

## Decisions (the user's answers to the open questions)

1. **The query engine:** `@tanstack/query-core`, bridged to signals.
2. **The mock design:** a Fetch-API backend (`Request` → `Response`) with
   three hosts: a service worker (MSW 3), dev-server middleware, and an
   in-process test server (MSW 3 `setupServer`). MSW is a dev dependency of
   `@patchfuil/mock-backend` only.
3. **`when` on a `DataSource`** keeps XMLUI's meaning: the loader stays
   mounted and doesn't fetch (`users.loaded` reads `false`). A metadata
   flag, `whenDisablesOnly`, makes the compiler pass `when` as a prop.
4. **`APICall` without `invalidates`** invalidates every query, as XMLUI
   does.
5. **`execute()` on an error** rejects only when there is no `onError`
   handler. Otherwise it resolves to `undefined`.
6. **Default retries:** two for `get` `DataSource`s, none for writes.
7. **Sub-steps:** 20A–20D on one branch, `poc/20-data`, with one review at
   the end.
8. **Mock backends for apps:** `@patchfuil/mock-backend` is offered to app
   authors through the Vite plugin's `mockBackend` option. Standalone mode
   is left for later.

## Outcome

All four sub-steps are built on `poc/20-data`. `npm run check` passes
without warnings: 2,228 unit tests in 79 files and 148 E2E tests.

**Where each catalog row is tested:**
- U: `runtime/tests/data/http.test.ts`, `loader.test.ts`, `api-call.test.ts`;
- I: `components/tests/data.test.tsx`;
- E: `e2e/data.spec.ts` in two projects;
- M1: `mock-backend/tests/*.test.ts`;
- M3: `tools/data-build.test.ts`.

The test names carry the row ids.

**Stability:**
- `e2e/data.spec.ts` passed 90 of 90 runs (each test five times on both
  hosts).
- The Data scenario's test passed 20 of 20.
- The playground and data projects passed three times in a row from a cold
  cache.

**Size** (rendered length in a production build of the fixture): query-core
about 63 kB, pfui's data code about 23 kB. A build without `build: true`
contains no mock code.

**The playground:**
- A "Data" scenario: people from the mock backend (search, details, rename);
- a network panel built with `APICall`s to `/__mock` (speed, 503 twice, 429
  with Retry-After, offline, hang, a broken body, 30% flaky, hold and
  release, clear, reset), with feedback when the backend has the setting;
- a live request log (a polling `DataSource`);
- the worker host in dev and in the preview build.

## Findings

- **The app really can't tell.** The same E2E specs pass against a service
  worker and against the dev server over HTTP. Playwright reports the first
  host's responses as `fromServiceWorker()` and the second's as network
  responses. The page code is identical.
- **The hosts differ on aborts.**
  - The dev server sees a client abort, so a held or hanging request ends
    there.
  - A service worker's handler doesn't see it, so the hold stays until
    released.

  The app's behavior is the same either way: the aborted request's answer
  is ignored. Tests wait for the request they need instead of counting holds.
- **Cancellation is stronger than "a stale answer must not win".**
  Query-core aborts a request as soon as no one uses it (a changed search, an
  unmount). The out-of-order test keeps the old request alive with a second
  user to prove that its late answer still doesn't reach the first.
- **A Vite pitfall in the mock plugin:**
  - Listing `msw` in the app's own `optimizeDeps.include` made Vite drop the
    whole list silently: `msw` isn't the app's dependency, so it can't be
    resolved from the app.
  - Without it, MSW was discovered on the first page load, and the
    re-optimization reloaded every open page.
  - The plugin now pre-bundles `@patchfuil/mock-backend > msw` itself.
- **A latent bug from step 13, now fixed:** the prerender's temporary Vite
  server used the app's `node_modules/.vite`. During a test run, a build's
  prerender rewrote a running dev server's pre-bundled dependencies, and
  every page failed with 504 "Outdated Optimize Dep". It has its own cache
  now, without client pre-bundling.
- **Query-core needs `_optimisticResults: "optimistic"`** (as React Query's
  hook sets) for its first result to be "fetching" before mount. Its
  notifications are scheduled with `setTimeout` by default; here they run on
  a microtask, in one signal batch.
- **StrictMode remounts would repeat requests.** Unmounting aborts an unused
  request. The unmount is deferred by a microtask, so the simulated
  unmount and remount keep the one request.
- **The browser logs every 4xx and 5xx response as a console error.** Tests
  that fault on purpose can't assert "no console errors"; the smoke test
  opens the Data page without faults.
- **Multi-line `<Text>` keeps a collapsed space at each end.** A test's
  `^…$` anchors failed on it. Whether to trim is a question for a later
  step (XMLUI's behavior to be checked).
- **A test pitfall:** a page that shows its own source also contains the
  texts a test looks for. Locators for rendered text are scoped to
  `.pfui-Text`.

## Deviations from this plan

- `pfuiMockBackend` is a second plugin, not a `pfui()` option.
- MSW 3 (the current version), not 2. Same API shape, except that
  `onUnhandledFrame` replaces `onUnhandledRequest`.
- `refetch()` isn't tied to the calling handler (§ 2).
- `attempts` is on the error, not on the DataSource.
- L8 as described in the catalog: the server render can't see the
  component API.
- `loadable` metadata wasn't needed.
- The handler `$param` exists only in deferred props; event handlers get
  the arguments as parameters (`onBeforeRequest="(id) => id !== 2"`).

## Open for later steps

- `<RetryPolicy>`, `AppError` everywhere, `<App onError>` (step 33).
- Notifications and confirmation dialogs on `APICall` (step 27).
- `deferredMode` (status polling), paging, `FileUpload`/`FileDownload`,
  `Actions.callApi`.
- A mock backend in standalone mode; backends written in pfui script, like
  XMLUI's `---api` blocks.
- Forms submitting to `APICall` with 422 mapped to fields (step 22).
