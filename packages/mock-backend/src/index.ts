// A mock backend (step 20; design: .ai/plan/poc-20-data.md § 1).
//
// A backend is a Fetch-API handler: `handle(request: Request) => Response`.
// It knows nothing about the app, and the app knows nothing about it: hosts
// (./worker.ts: a service worker; ./middleware.ts: dev-server middleware;
// ./node.ts: a test server) put it behind real `fetch` requests.
//
//   routes          "GET /api/users/:id": ({ db, params, query, body }) => value | Response | status(…)
//   db              in-memory collections, copied in and out (no shared references)
//   faults          latency, statuses, network errors, hangs, broken bodies, holds
//   log             every request the routes saw, with its outcome
//   /__mock/*       control endpoints for tests and the playground (reset, faults, holds, log, latency)
//
// No imports: it runs in a browser page, in Node and in a service worker's client.

export type Json = unknown;

/** A record in a collection. `id` is assigned on insert when missing. */
export type Item = Record<string, unknown> & { id?: unknown };

export interface Collection {
  /** Copies of all items, or of those `filter` accepts. */
  list(filter?: (item: Item) => boolean): Item[];
  /** A copy of the item with this id (compared as strings), or undefined. */
  get(id: unknown): Item | undefined;
  /** Inserts a copy (with the next numeric id when it has none); returns a copy. */
  insert(item: Item): Item;
  /** Merges `patch` into the item; returns a copy, or undefined when there is none. */
  update(id: unknown, patch: Item): Item | undefined;
  /** Removes the item; whether there was one. */
  remove(id: unknown): boolean;
}

export type Db = Record<string, Collection>;

export interface RouteContext {
  request: Request;
  /** Path parameters (`:id`). */
  params: Record<string, string>;
  /** Query parameters; a repeated key becomes an array. */
  query: Record<string, string | string[]>;
  /** The parsed body: JSON, else text; undefined when empty. */
  body: Json;
  db: Db;
}

export type RouteHandler = (context: RouteContext) => unknown;

export interface BackendDefinition {
  /** Collections and their initial items; `reset` restores them. */
  seed?: Record<string, Item[]>;
  /** `"METHOD /path/:param"` (or `"* /path"` for any method) → handler. */
  routes: Record<string, RouteHandler>;
  /** Where the control endpoints live. Default "/__mock". */
  controlPath?: string;
  /** The seed of the random numbers behind probabilistic faults (so runs repeat). Default 1. */
  randomSeed?: number;
}

/** A misbehavior on purpose. The first matching fault applies (latency of all matching ones adds up). */
export interface FaultSpec {
  /** `"GET /api/users"`, `"* /api/users/:id"`, `"/api/users"` (any method). Default: every route. */
  route?: string;
  /** Applies this many times, then is removed. Default: until removed. */
  times?: number;
  /** Applies with this probability (seeded). Default 1. */
  probability?: number;
  /** Delay in ms before the outcome, or a random range. */
  latency?: number | { min: number; max: number };
  /** Answer with this status (and `body`, `headers`) instead of the route. */
  status?: number;
  body?: Json;
  headers?: Record<string, string>;
  /** `body` sent as text with this content type (a broken JSON response, an HTML error page). */
  contentType?: string;
  /** "error": the connection fails (fetch rejects). "hang": no answer ever. */
  network?: "error" | "hang";
  /** Wait until released through /__mock/holds/:id/release. */
  hold?: boolean;
}

export interface RequestLogEntry {
  id: number;
  method: string;
  /** Path and query. */
  url: string;
  body: Json;
  start: number;
  end?: number;
  /** "ok", "fault", "network-error", "hang", "held", "aborted", "no-route", "error" (the route threw). */
  outcome: string;
  status?: number;
  /** The fault that applied, by id. */
  fault?: number;
}

export interface HeldRequest {
  id: number;
  method: string;
  url: string;
}

export interface Backend {
  /** The answer, or undefined when the request is not under one of `prefixes`. */
  handle(request: Request): Promise<Response | undefined>;
  /** The path prefixes the backend answers (`/api`, `/__mock`): hosts route these to it. */
  readonly prefixes: readonly string[];
  /** Restores the seed; clears faults, holds, latency and the log. */
  reset(): void;
  addFault(fault: FaultSpec): number;
  clearFaults(): void;
  holds(): HeldRequest[];
  /** Releases a held request, optionally with a fault to apply instead of the route. */
  release(id: number, fault?: FaultSpec): boolean;
  log(): RequestLogEntry[];
  /** The latency of every request (the network's speed). */
  setLatency(latency: FaultSpec["latency"]): void;
}

// --- Helpers for route handlers ---------------------------------------------------

const RESPONSE = Symbol("pfui.mock.response");

interface MockResponse {
  [RESPONSE]: true;
  status: number;
  body: Json;
  headers?: Record<string, string>;
}

/** Answer with a status, an optional JSON body and headers. */
export function status(code: number, body?: Json, headers?: Record<string, string>): MockResponse {
  return { [RESPONSE]: true, status: code, body, headers };
}
export const created = (body: Json, headers?: Record<string, string>) => status(201, body, headers);
export const noContent = () => status(204);
export const notFound = (message = "Not found") => status(404, { message });

function isMockResponse(value: unknown): value is MockResponse {
  return typeof value === "object" && value !== null && (value as Partial<MockResponse>)[RESPONSE] === true;
}

// --- The backend ---------------------------------------------------------------------

const copy = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

function createCollection(seed: Item[]): Collection {
  let items = copy(seed);
  const find = (id: unknown) => items.findIndex((item) => String(item.id) === String(id));
  return {
    list: (filter) => copy(filter ? items.filter((item) => filter(copy(item))) : items),
    get: (id) => copy(items[find(id)]),
    insert(item) {
      const next = copy(item);
      if (next.id === undefined || next.id === null) {
        next.id = items.reduce((max, existing) => Math.max(max, Number(existing.id) || 0), 0) + 1;
      }
      items = [...items, next];
      return copy(next);
    },
    update(id, patch) {
      const index = find(id);
      if (index < 0) return undefined;
      const next = { ...items[index]!, ...copy(patch), id: items[index]!.id };
      items = items.map((item, i) => (i === index ? next : item));
      return copy(next);
    },
    remove(id) {
      const index = find(id);
      if (index < 0) return false;
      items = items.filter((_, i) => i !== index);
      return true;
    },
  };
}

interface Route {
  method: string;
  pattern: RegExp;
  names: string[];
  handler: RouteHandler;
}

/** `"GET /api/users/:id"` → a matcher. A pattern without a method matches any method. */
function compileRoute(spec: string): { method: string; pattern: RegExp; names: string[] } {
  const trimmed = spec.trim();
  const space = trimmed.indexOf(" ");
  const method = space < 0 ? "*" : trimmed.slice(0, space).toUpperCase();
  const path = space < 0 ? trimmed : trimmed.slice(space + 1).trim();
  const names: string[] = [];
  const source = path
    .split("/")
    .map((segment) => {
      if (segment === "*") return ".*";
      if (segment.startsWith(":")) {
        names.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { method, pattern: new RegExp(`^${source}/?$`), names };
}

/** The first path segment of a route: `/api/users/:id` → `/api`. */
function prefixOf(spec: string): string {
  const path = spec.trim().split(/\s+/).pop()!;
  const first = path.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

/** A small seeded random generator (mulberry32), so probabilistic faults repeat. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function json(body: Json, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status ?? 200;
  // 204 and 304 have no body.
  if (status === 204 || status === 304 || body === undefined) return new Response(null, { status, headers: init.headers });
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...init.headers } });
}

/** Resolves after `ms`, or rejects when `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Never resolves; rejects when `signal` aborts (a server that doesn't answer). */
function forever(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function readBody(request: Request): Promise<Json> {
  const text = await request.text();
  if (text === "") return undefined;
  if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      return JSON.parse(text) as Json;
    } catch {
      return text;
    }
  }
  return text;
}

function queryOf(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = query[key];
    query[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return query;
}

interface ActiveFault {
  id: number;
  spec: FaultSpec;
  matcher?: { method: string; pattern: RegExp };
  remaining: number;
}

interface Hold {
  entry: RequestLogEntry;
  release: (fault?: FaultSpec) => void;
}

/** Defines a backend. Its state (collections, faults, log) lives in the returned object. */
export function defineBackend(definition: BackendDefinition): Backend {
  const controlPath = definition.controlPath ?? "/__mock";
  const routes: Route[] = Object.entries(definition.routes).map(([spec, handler]) => ({ ...compileRoute(spec), handler }));
  const prefixes = [...new Set([...Object.keys(definition.routes).map(prefixOf), controlPath])];

  let db: Db = {};
  let faults: ActiveFault[] = [];
  const held = new Map<number, Hold>();
  let entries: RequestLogEntry[] = [];
  let latency: FaultSpec["latency"];
  let random = seededRandom(definition.randomSeed ?? 1);
  let nextFault = 1;
  let nextRequest = 1;

  const reset = () => {
    db = Object.fromEntries(Object.entries(definition.seed ?? {}).map(([name, items]) => [name, createCollection(items)]));
    faults = [];
    for (const hold of held.values()) hold.release({ network: "error" });
    held.clear();
    entries = [];
    latency = undefined;
    random = seededRandom(definition.randomSeed ?? 1);
    nextFault = 1;
    nextRequest = 1;
  };
  reset();

  const delayOf = (value: FaultSpec["latency"]): number => {
    if (value === undefined) return 0;
    if (typeof value === "number") return value;
    return Math.round(value.min + random() * (value.max - value.min));
  };

  /** The faults that apply to this request: consumes `times`, rolls `probability`. */
  const applicable = (method: string, path: string): ActiveFault[] => {
    const result: ActiveFault[] = [];
    for (const fault of faults) {
      if (fault.matcher && !((fault.matcher.method === "*" || fault.matcher.method === method) && fault.matcher.pattern.test(path))) continue;
      if (fault.spec.probability !== undefined && random() >= fault.spec.probability) continue;
      result.push(fault);
    }
    for (const fault of result) if (--fault.remaining <= 0) faults = faults.filter((f) => f !== fault);
    return result;
  };

  const addFault = (spec: FaultSpec): number => {
    const id = nextFault++;
    const matcher = spec.route ? compileRoute(spec.route) : undefined;
    faults.push({ id, spec, matcher, remaining: spec.times ?? Infinity });
    return id;
  };

  /** Whether a fault answers (else it only delays). */
  const hasOutcome = (spec: FaultSpec) => spec.network !== undefined || spec.status !== undefined || spec.contentType !== undefined;

  /** A fault's outcome as a response; undefined when it only delays. */
  const outcome = (spec: FaultSpec, signal: AbortSignal): Promise<Response> | Response | undefined => {
    if (spec.network === "error") return Response.error();
    if (spec.network === "hang") return forever(signal);
    if (spec.status !== undefined) {
      if (spec.contentType !== undefined) {
        return new Response(typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body ?? ""), {
          status: spec.status,
          headers: { "content-type": spec.contentType, ...spec.headers },
        });
      }
      return json(spec.body, { status: spec.status, headers: spec.headers });
    }
    if (spec.contentType !== undefined) {
      return new Response(typeof spec.body === "string" ? spec.body : "", { status: 200, headers: { "content-type": spec.contentType, ...spec.headers } });
    }
    return undefined;
  };

  const runRoute = async (request: Request, url: URL, body: Json, entry: RequestLogEntry): Promise<Response> => {
    const method = request.method.toUpperCase();
    for (const route of routes) {
      if (route.method !== "*" && route.method !== method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1]!)]));
      try {
        const result = await route.handler({ request, params, query: queryOf(url), body: copy(body), db });
        if (result instanceof Response) return result;
        if (isMockResponse(result)) return json(copy(result.body), { status: result.status, headers: result.headers });
        return result === undefined ? json(undefined, { status: 204 }) : json(copy(result));
      } catch (error) {
        entry.outcome = "error";
        return json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }
    entry.outcome = "no-route";
    return json({ message: `No route for ${method} ${url.pathname}` }, { status: 404 });
  };

  /** The request through faults, holds and the route. */
  const serve = async (request: Request, url: URL): Promise<Response> => {
    const method = request.method.toUpperCase();
    const body = await readBody(request);
    const entry: RequestLogEntry = { id: nextRequest++, method, url: url.pathname + url.search, body, start: Date.now(), outcome: "ok" };
    entries.push(entry);
    const signal = request.signal;
    try {
      const matching = applicable(method, url.pathname);
      const total = delayOf(latency) + matching.reduce((sum, f) => sum + delayOf(f.spec.latency), 0);
      if (total > 0) await wait(total, signal);
      const fault = matching.find((f) => f.spec.hold || hasOutcome(f.spec));
      let spec = fault?.spec;
      if (spec?.hold) {
        entry.outcome = "held";
        spec = await Promise.race([new Promise<FaultSpec | undefined>((resolve) => held.set(entry.id, { entry, release: resolve })), forever(signal)]);
        held.delete(entry.id);
        entry.outcome = "ok";
      }
      if (spec && hasOutcome(spec)) {
        entry.fault = fault?.id;
        if (spec.network === "hang") entry.outcome = "hang";
        const response = await outcome(spec, signal)!;
        entry.outcome = response.type === "error" ? "network-error" : "fault";
        if (response.type !== "error") entry.status = response.status;
        return response;
      }
      const response = await runRoute(request, url, body, entry);
      entry.status = response.status;
      return response;
    } catch (error) {
      // Only an abort gets here (the wait, a hold or a hang ended by the client).
      held.delete(entry.id);
      entry.outcome = "aborted";
      throw error;
    } finally {
      entry.end = Date.now();
    }
  };

  /** The control endpoints: never logged, never faulted. */
  const control = async (request: Request, path: string): Promise<Response> => {
    const method = request.method.toUpperCase();
    const body = await readBody(request);
    if (method === "POST" && path === "/reset") {
      reset();
      return json({ ok: true });
    }
    if (path === "/faults") {
      if (method === "POST") return json({ id: addFault((body ?? {}) as FaultSpec) }, { status: 201 });
      if (method === "DELETE") {
        faults = [];
        return json(undefined, { status: 204 });
      }
      if (method === "GET") return json(faults.map((f) => ({ id: f.id, ...f.spec })));
    }
    if (method === "GET" && path === "/holds") return json(api.holds());
    const release = /^\/holds\/(\d+)\/release$/.exec(path);
    if (method === "POST" && release) {
      return api.release(Number(release[1]), (body ?? undefined) as FaultSpec | undefined) ? json({ ok: true }) : json({ message: "No such hold" }, { status: 404 });
    }
    if (method === "POST" && path === "/holds/release-all") {
      for (const id of [...held.keys()]) api.release(id, (body ?? undefined) as FaultSpec | undefined);
      return json({ ok: true });
    }
    if (path === "/requests") {
      if (method === "GET") return json(api.log());
      if (method === "DELETE") {
        entries = [];
        return json(undefined, { status: 204 });
      }
    }
    if (method === "PUT" && path === "/latency") {
      latency = (body as { latency?: FaultSpec["latency"] } | undefined)?.latency;
      return json({ ok: true });
    }
    return json({ message: `No control endpoint ${method} ${controlPath}${path}` }, { status: 404 });
  };

  const api: Backend = {
    prefixes,
    async handle(request) {
      const url = new URL(request.url);
      const underPrefix = prefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
      if (!underPrefix) return undefined;
      if (url.pathname === controlPath || url.pathname.startsWith(`${controlPath}/`)) return control(request, url.pathname.slice(controlPath.length));
      return serve(request, url);
    },
    reset,
    addFault,
    clearFaults: () => {
      faults = [];
    },
    holds: () => [...held.values()].map(({ entry }) => ({ id: entry.id, method: entry.method, url: entry.url })),
    release(id, spec) {
      const hold = held.get(id);
      if (!hold) return false;
      held.delete(id);
      hold.release(spec);
      return true;
    },
    log: () => entries.map((entry) => ({ ...entry })),
    setLatency(value) {
      latency = value;
    },
  };
  return api;
}
