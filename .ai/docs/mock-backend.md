# The mock backend

> Subsystem reference: `@gluefuil/mock-backend`, its hosts, and the Vite
> plugin that starts it. A backend the app can't tell from a server: the app
> makes ordinary `fetch` requests, and a host answers them. Design and
> findings: [`../plan/poc-20-data.md`](../plan/poc-20-data.md) § 1.
>
> **Last updated:** step 20.

## Defining a backend

```ts
// src/backend.ts: the app never imports it
import { defineBackend, created, noContent, status } from "@gluefuil/mock-backend";

export default defineBackend({
  seed: { users: [{ id: 1, name: "Ada" }] },
  routes: {
    "GET /api/users": ({ db, query }) => db.users!.list((u) => String(u.name).includes(String(query.q ?? ""))),
    "GET /api/users/:id": ({ db, params }) => db.users!.get(params.id) ?? status(404, { message: "No such user" }),
    "POST /api/users": ({ db, body }) => created(db.users!.insert(body as never)),
    "DELETE /api/users/:id": ({ db, params }) => (db.users!.remove(params.id) ? noContent() : status(404)),
  },
});
```

- **The backend is a Fetch-API handler:**
  `backend.handle(request: Request): Promise<Response | undefined>`.
  `undefined` means "not mine"; the prefixes it answers are derived from the
  routes (`/api`) plus the control path (`/__mock`).
- **A route returns** a value (JSON 200; `undefined` is 204), a `Response`,
  or a helper's result (`status`, `created`, `noContent`, `notFound`).
  - A route that throws is a 500; an unknown path under a prefix is a 404.
  - The route gets `params`, `query` (repeated keys become arrays), the
    parsed `body`, the `request` and `db`.
- **`db`:** collections with `list(filter?)`, `get(id)`, `insert` (the next
  numeric id when missing), `update(id, patch)`, `remove(id)`. Ids are
  compared as strings. Everything is copied in and out (`structuredClone`),
  so the UI can't hold a reference into the backend.
- **No imports:** it runs in a page, in Node and behind a service worker.
  `tools/boundaries.ts` enforces both directions: the app's packages never
  import the mock backend, and it imports only `msw` and `node:` built-ins.

## Faults, holds and the log

| Fault field | Effect |
|-------------|--------|
| `route` | `"GET /api/users"`, `"/api/users/:id"` (any method); absent: every route |
| `times`, `probability` | How often it applies; the probability uses a seeded generator (`randomSeed`, reset by `reset`), so runs repeat |
| `latency` | ms, or `{ min, max }`; the latency of every matching fault adds up, plus the global latency |
| `status`, `body`, `headers` | The answer instead of the route's |
| `contentType` | `body` sent as text with this type (an HTML error page) |
| `network: "error"` | `Response.error()`: `fetch` rejects (each host turns it into a failed connection) |
| `network: "hang"` | No answer until the request is aborted |
| `hold: true` | Waits until released (optionally with a fault); the test decides the order of answers |

- **The first matching fault with an outcome applies.**
- **The request log** has one entry per request: `{ id, method, url, body,
  start, end, outcome, status, fault }`. `outcome` is `ok`, `fault`,
  `network-error`, `hang`, `held`, `aborted` (where the host can see it),
  `no-route` or `error`.

## The control endpoints (`/__mock`)

They are not logged and not faulted.

| Endpoint | Does |
|----------|------|
| `POST /reset` | Seed again; clear faults, holds (released as network errors), latency and the log |
| `GET/POST/DELETE /faults` | List; add (returns `{ id }`, 201); remove all |
| `GET /holds`, `POST /holds/:id/release`, `POST /holds/release-all` | Held requests; release one (body: an optional fault); release all |
| `GET/DELETE /requests` | The log; clear it |
| `PUT /latency` | `{ latency }` for every request |

## Hosts

| Host | Module | Where | Notes |
|------|--------|-------|-------|
| Service worker | `@gluefuil/mock-backend/worker`: `startWorker(backend, { url })` | Browser: development, the playground, static builds | MSW 3 `setupWorker`, one `http.all("<prefix>/*")` per prefix, `quiet`, `onUnhandledFrame: "bypass"`. Started once per page, never stopped. Requests are real page requests; Playwright reports `fromServiceWorker()`. **The handler doesn't see the page aborting a request**, so a hold or hang stays until released. |
| Dev-server middleware | `@gluefuil/mock-backend/middleware`: `backendMiddleware(backend)` | Node: the Vite dev server | Real HTTP; no MSW. Request bodies are buffered. The client going away aborts the request (holds and hangs end). A network error destroys the socket. |
| Test server | `@gluefuil/mock-backend/node`: `startTestServer(backend)` | Vitest | MSW 3 `setupServer` intercepting `fetch` at any origin (`*/api/*`). |

- In the worker and test hosts, an aborted request's rejection is answered
  with a 499 instead of being thrown, so MSW prints nothing.

## In a Vite app: `gfuiMockBackend`

```ts
import { gfui, gfuiMockBackend } from "@gluefuil/vite-plugin";
plugins: [gfui(), gfuiMockBackend({ module: "src/backend.ts", host: "worker", build: false }), react()]
```

- **A plugin of its own:** Vite allows one HTML transform per plugin. This
  one must run before Vite's, and the prerender after.
- **`host: "worker"`** (default):
  - The page's entry `<script type="module" src="X">` becomes
    `/@gfui/mock-boot.js?entry=X`. That is a virtual module per entry: it
    starts the worker, then imports `X`. `main.tsx`, `mountApp` and the
    compiled markup are untouched.
  - The dev server serves MSW's `mockServiceWorker.js`, from the mock
    package's own `msw`, after `MEDIA_BYPASS` (step 32): a fetch listener that
    lets video, audio and range requests go to the network, since Chrome can't
    seek a video that MSW's passthrough `fetch()` delivered.
  - The plugin pre-bundles `@gluefuil/mock-backend > msw` and
    `> msw/browser`, so the first page load doesn't discover them and reload
    every open page.
- **`host: "middleware"`:** the dev server answers the backend's prefixes.
  It is loaded once with `ssrLoadModule`, so the state lasts for the
  session.
- **`build: true`:** the worker host in production builds too (the
  playground's preview, a demo site), with the worker script emitted.
  Otherwise a build has no mock code (`tools/data-build.test.ts`).

## Testing against it

- **Vitest:** `startTestServer(backend)` in `beforeAll`. Steer `backend`
  directly (`addFault`, `holds`, `release`, `log`); `reset()` after each
  test.
- **Playwright:** steer it through `/__mock`, with `fetch` from the page
  (`page.evaluate`), which reaches the backend in both hosts.
  - The worker host's backend is new with each page.
  - The middleware host's backend is shared, so its tests reset it and run
    one at a time (project `workers: 1`).
  - Wait for the request you need (a hold with a given URL), not for a
    count of holds: the hosts differ on aborted requests (see above).

## Tests

| File | Covers |
|------|--------|
| `mock-backend/tests/backend.test.ts` | Routes and collections, helpers, query and headers, 500/404, copies; every fault, seeded probability, holds in any order; the control endpoints |
| `mock-backend/tests/hosts.test.ts` | The test server and the middleware behind real `fetch`: data, a write, a status, a network error, a hang ended by an abort, passthrough |
| `tools/boundaries.test.ts` | Neither side imports the other |
| `e2e/data.spec.ts` | The same app and specs against the worker host (5182) and the middleware host (5183) |
| `tools/data-build.test.ts` | Production builds with and without `build: true` |
