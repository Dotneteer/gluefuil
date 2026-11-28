// Routing (step 19, reduced): a small signal-based router behind the app
// globals navigate, $pathname, $routeParams and $queryParams. Design:
// .ai/plan/poc-19-routing.md (after XMLUI's routing, .ai/xmlui/routing.md).
//
// Hash mode (the default, as in XMLUI) keeps the route after `#`
// (`/#/tests/x?a=1`): any static server works. Browser mode uses the path and
// the History API; the server must answer every path with index.html.
// In the server view (server rendering and hydration, step 13) the location is
// the prerender path, so static HTML and hydration agree; a deep link switches
// right after takeover.
//
// Navigation events (step 21, .ai/plan/poc-21-routing.md): the App registers
// `willNavigate` (a guard: `false` cancels) and `didNavigate`. Every
// navigation goes through the guard except the Pages fallback redirect and
// the first load; when the browser changes the URL itself (back, forward, a
// typed hash) the old route stays on screen until the guard has decided, and a
// refusal restores the URL with `history.go` (each entry we push carries its
// index in `history.state`). The latest navigation wins.
//
// Part 2: `navigate(-1)` goes through the history (`history.go`) and is guarded
// like the back button; `navigate(to, { target: "_blank" })` opens the route
// in a new tab; a basename (browser mode) puts every route under a sub-path.

import { reportRuntimeError } from "../errors";
import { isServerView } from "../reactivity/server-view";
import { markWrite, signal } from "../reactivity/signals";
import { activeTrace, childSpan, emit, traceFields, traceNow, tracing } from "../trace/core";
import type { TraceContext } from "../trace/entries";
import type { SourceLocation } from "../trace/location";

export type RoutingMode = "hash" | "browser";

export interface RouteLocation {
  pathname: string;
  /** Query parameters (`?a=1&b=2`), decoded; a repeated name keeps its last value. */
  query: Readonly<Record<string, string>>;
}

/** The default path static HTML is rendered for. */
export const SERVER_PATH = "/";

let mode: RoutingMode = "hash";
/** The path of the server view: the route static HTML is rendered (and hydrated) for. */
let serverPath = SERVER_PATH;
const location = signal<RouteLocation>({ pathname: SERVER_PATH, query: {} });

/** Splits `/a/b?x=1` into a normalized pathname and query. */
export function parseLocation(path: string): RouteLocation {
  const [rawPath = "", rawQuery = ""] = path.split("?", 2) as [string?, string?];
  let pathname = rawPath.trim() === "" ? "/" : rawPath;
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.replace(/\/+$/, "") || "/";
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawQuery)) query[key] = value;
  return { pathname, query };
}

type BrowserWindow = {
  location: { hash: string; pathname: string; search: string };
  history: {
    readonly state: unknown;
    pushState(data: unknown, unused: string, url: string): void;
    replaceState(data: unknown, unused: string, url?: string): void;
    go(delta: number): void;
  };
  open?(url: string, target: string, features: string): unknown;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

const browser = (): BrowserWindow | undefined => (globalThis as { window?: BrowserWindow }).window;

// --- The basename (browser mode): the sub-path the app is served under (`/app`).

/** No trailing slash; "" for an app at the root. */
let basename = "";

/** `/app/`, `app`, `/app` → `/app`; `/`, "" → "". */
export function normalizeBasename(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Sets the basename (`mountApp`, `renderStatic`). Hash routes ignore it. */
export function setBasename(value: string): void {
  const next = normalizeBasename(value);
  if (next === basename) return;
  basename = next;
  const view = browser();
  if (view && attachedTo && mode === "browser") location.set(readBrowserLocation(view));
}

export function getBasename(): string {
  return basename;
}

/** A browser path without the basename; a path outside it is read as is. */
function stripBasename(pathname: string): string {
  if (basename === "") return pathname;
  if (pathname === basename) return "/";
  return pathname.startsWith(`${basename}/`) ? pathname.slice(basename.length) : pathname;
}

/** The route in the browser's current URL, for the current mode. */
function readBrowserLocation(view: BrowserWindow): RouteLocation {
  if (mode === "hash") return parseLocation(view.location.hash.replace(/^#/, ""));
  return parseLocation(`${stripBasename(view.location.pathname)}${view.location.search}`);
}

/** A route as one string (`/a?x=1`): to compare locations and to pass to the events. */
export function routePath({ pathname, query }: RouteLocation): string {
  const search = new URLSearchParams(query).toString();
  return search ? `${pathname}?${search}` : pathname;
}

// --- History indexes: each entry we push carries `{ gfui: n }` in history.state,
// so a refused back/forward can be undone with history.go(delta).

/** The index of the entry whose route the app shows. */
let entryIndex = 0;
/**
 * The index of the browser's current entry. It differs from `entryIndex` while
 * a guard holds a browser navigation.
 */
let browserIndex = 0;
/** The app's entry no longer exists: the browser dropped it (a new entry while back from it). */
let entryGone = false;

/** The app now shows the browser's current entry. */
function settleOnBrowserEntry(): void {
  entryIndex = browserIndex;
  entryGone = false;
}

function stateIndex(state: unknown): number | undefined {
  const value = (state as { gfui?: unknown } | null)?.gfui;
  return typeof value === "number" ? value : undefined;
}

/** The browser URL for a route (the page path plus `#/route` in hash mode; under the basename in browser mode). */
function browserUrl(view: BrowserWindow, path: string): string {
  return mode === "hash" ? `${view.location.pathname}${view.location.search}#${path}` : `${basename}${path}`;
}

// --- Listening to the browser.

let attachedTo: BrowserWindow | undefined;

/** Attaches the listeners once, in a browser, and adopts the current URL (the first load: no events). */
function ensureListening(): void {
  const view = browser();
  if (attachedTo || !view) return;
  attachedTo = view;
  // popstate only: browsers fire it for every history move, hash changes included. A
  // hashchange listener too would see the same move twice, the second time after a refusal
  // has already called history.go (asynchronous), and refuse again (found in step 21).
  view.addEventListener("popstate", onBrowserChange);
  const index = stateIndex(view.history.state);
  if (index === undefined) view.history.replaceState({ gfui: browserIndex }, "");
  else browserIndex = index;
  settleOnBrowserEntry();
  location.set(readBrowserLocation(view));
}

/** The App's routing mode (`useHashBasedRouting`). Called while the App renders. */
export function setRoutingMode(next: RoutingMode): void {
  const view = browser();
  if (next !== mode) {
    mode = next;
    if (view && attachedTo) location.set(readBrowserLocation(view));
  }
  ensureListening();
}

// --- Navigation events.

/** The App's navigation events (its handlers, which return a promise of their result). */
export interface NavigationHandlers {
  /** Before a navigation: resolving to `false` cancels it. */
  willNavigate?: (to: string, queryParams: Readonly<Record<string, string>>) => unknown;
  /** After a navigation. */
  didNavigate?: (to: string, queryParams: Readonly<Record<string, string>>) => unknown;
}

let handlers: NavigationHandlers = {};

/** Registers the App's navigation events; returns the function that removes them. */
export function setNavigationHandlers(next: NavigationHandlers): () => void {
  handlers = next;
  return () => {
    if (handlers === next) handlers = {};
  };
}

/** Each navigation takes a token; a guard's decision counts only while its token is the latest. */
let latest = 0;
/** The route a held browser navigation is waiting for (a second event for the same URL is ignored). */
let held: string | undefined;

/**
 * Runs the guard: resolves to true when the navigation may proceed. A guard
 * that throws (or times out) cancels the navigation: fail closed.
 */
function guard(target: RouteLocation): Promise<boolean> | true {
  const willNavigate = handlers.willNavigate;
  if (!willNavigate) return true;
  return (async () => {
    try {
      return (await willNavigate(routePath(target), Object.freeze({ ...target.query }))) !== false;
    } catch (error) {
      reportRuntimeError(error, "navigation");
      return false;
    }
  })();
}

function fireDidNavigate(target: RouteLocation): void {
  const didNavigate = handlers.didNavigate;
  if (!didNavigate) return;
  try {
    void Promise.resolve(didNavigate(routePath(target), Object.freeze({ ...target.query }))).catch((error: unknown) => reportRuntimeError(error, "navigation"));
  } catch (error) {
    reportRuntimeError(error, "navigation");
  }
}

// --- `navigate(n)`: callers waiting for the history move they started.

interface DeltaWaiter {
  resolve: () => void;
  /** Resolves the waiter when the browser fires no event (no entry that far). */
  timer: ReturnType<typeof setTimeout> | undefined;
}

let deltaWaiters: DeltaWaiter[] = [];

/** How long `navigate(n)` waits for the browser's `popstate` before deciding nothing moved. */
export const DELTA_EVENT_TIMEOUT_MS = 300;

/** A `popstate` arrived: the waiters now wait for its decision, not for the timeout. */
function deltaEventArrived(): void {
  for (const waiter of deltaWaiters) {
    if (waiter.timer !== undefined) clearTimeout(waiter.timer);
    waiter.timer = undefined;
  }
}

/** The move settled (allowed, refused or no move): resolve every waiter. */
function settleDeltas(): void {
  const waiters = deltaWaiters;
  deltaWaiters = [];
  for (const waiter of waiters) {
    if (waiter.timer !== undefined) clearTimeout(waiter.timer);
    waiter.resolve();
  }
}

/** The browser changed the URL itself: back, forward, a typed hash, `navigate(n)`. */
function onBrowserChange(): void {
  const view = attachedTo;
  if (!view) return;
  deltaEventArrived();
  const next = readBrowserLocation(view);
  const nextPath = routePath(next);
  const known = stateIndex(view.history.state);
  if (known !== undefined) browserIndex = known;
  else {
    // An entry the browser pushed itself (a typed hash, a link we did not handle): it follows the
    // entry the browser was on, and any entries after that are gone, perhaps the app's own.
    browserIndex += 1;
    if (entryIndex >= browserIndex) entryGone = true;
    view.history.replaceState({ gfui: browserIndex }, "");
  }
  // Back where the app is (our own restore).
  if (nextPath === routePath(location.peek())) {
    settleOnBrowserEntry();
    held = undefined;
    settleDeltas();
    return;
  }
  if (nextPath === held) return;
  const token = ++latest;
  const nav = startNavigationTrace();
  const accept = () => {
    held = undefined;
    settleOnBrowserEntry();
    endNavigationTrace(nav, next, "done");
    location.set(next);
    fireDidNavigate(next);
    settleDeltas();
  };
  const allowed = guard(next);
  if (allowed === true) {
    accept();
    return;
  }
  held = nextPath;
  void allowed.then((ok) => {
    if (token !== latest) return;
    if (ok) {
      accept();
      return;
    }
    held = undefined;
    endNavigationTrace(nav, next, "cancelled");
    settleDeltas();
    // Back to the app's entry without a new history entry; the event this causes finds the
    // app's route. If the browser dropped that entry, the current one takes the app's URL.
    if (!entryGone && entryIndex !== browserIndex) view.history.go(entryIndex - browserIndex);
    else {
      view.history.replaceState({ gfui: browserIndex }, "", browserUrl(view, routePath(location.peek())));
      settleOnBrowserEntry();
    }
  });
}

export function routingMode(): RoutingMode {
  return mode;
}

/** The route static HTML is rendered for, and hydration renders (`data-gfui-path`). */
export function setServerPath(path: string): void {
  serverPath = routePath(parseLocation(path));
}

export function getServerPath(): string {
  return serverPath;
}

/** The current location: the server path in the server view. Tracked. */
export function currentLocation(): RouteLocation {
  if (isServerView()) return parseLocation(serverPath);
  ensureListening();
  return location.get();
}

/** The URL for a route in the current mode: `#/x` (hash) or `/x` (browser), for links. */
export function hrefFor(to: string): string {
  const { pathname, query } = parseLocation(to);
  const search = new URLSearchParams(query).toString();
  const path = search ? `${pathname}?${search}` : pathname;
  return mode === "hash" ? `#${path}` : `${basename}${path}`;
}

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one. */
  replace?: unknown;
  /** Query parameters, added when `to` has no query yet (`undefined`/`null` values are left out). */
  queryParams?: unknown;
  /** `"_blank"`: open the route in a new tab (after the guard); the page does not move. Other values: this tab. */
  target?: unknown;
}

/** The target of `navigate(to, { queryParams })`, as XMLUI's `finalTo`. */
function targetOf(to: unknown, queryParams: unknown): RouteLocation {
  let path = String(to ?? "/");
  if (queryParams !== null && typeof queryParams === "object" && !path.includes("?")) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) search.append(key, String(value));
    }
    const text = search.toString();
    if (text) path = `${path}?${text}`;
  }
  return parseLocation(path);
}

/** Step 35: a navigation being traced (made only while tracing). */
interface NavigationTrace {
  context: TraceContext;
  at?: SourceLocation;
  from: string;
  start: number;
}

/** Step 35: starts tracing a navigation, in the running handler's trace (or a new one: the URL changed). */
function startNavigationTrace(): NavigationTrace | undefined {
  if (!tracing) return undefined;
  const active = activeTrace();
  return { context: childSpan(active?.context), ...(active?.at ? { at: active.at } : {}), from: routePath(location.peek()), start: traceNow() };
}

/** Step 35: the navigation's entry; a move marks the location with it (renders that follow name it). */
function endNavigationTrace(nav: NavigationTrace | undefined, target: RouteLocation, outcome: "done" | "cancelled" | "error"): void {
  if (!nav || !tracing) return;
  const seq = emit({
    kind: "navigate",
    ...traceFields(nav.context),
    ...(nav.at ? { at: nav.at } : {}),
    from: nav.from,
    to: routePath(target),
    outcome,
    durationMs: traceNow() - nav.start,
  });
  if (outcome === "done") markWrite(location, { traceId: nav.context.traceId, spanId: nav.context.spanId, entry: seq });
}

/** Moves to `target`: a new (or replaced) history entry, then the location signal. */
function commit(target: RouteLocation, replace: boolean): void {
  const view = browser();
  if (view) {
    ensureListening();
    const url = browserUrl(view, routePath(target));
    // A new entry follows the browser's current one (which may not be the app's while a guard holds).
    if (replace) view.history.replaceState({ gfui: browserIndex }, "", url);
    else view.history.pushState({ gfui: ++browserIndex }, "", url);
    settleOnBrowserEntry();
  }
  held = undefined;
  // pushState/replaceState fire no event: update the signal ourselves.
  location.set(target);
  // A history move still waiting (navigate(-1)) was overtaken by this one.
  settleDeltas();
}

/**
 * `navigate('/tests/x', { replace, queryParams })`: goes to a route, after the
 * App's `willNavigate` allows it, then fires `didNavigate`. Resolves when the
 * navigation is done or cancelled (handlers await it implicitly). Without a
 * guard, the move is synchronous.
 */
export function navigate(to: unknown, options?: NavigateOptions): Promise<void> {
  if (typeof to === "number") return navigateBy(to);
  const target = targetOf(to, options?.queryParams);
  if (options?.target === "_blank") return openInNewTab(target);
  const replace = options?.replace === true;
  const token = ++latest;
  const nav = startNavigationTrace();
  const allowed = guard(target);
  if (allowed === true) {
    endNavigationTrace(nav, target, "done");
    commit(target, replace);
    fireDidNavigate(target);
    return Promise.resolve();
  }
  return allowed.then((ok) => {
    if (!ok || token !== latest) {
      endNavigationTrace(nav, target, "cancelled");
      return;
    }
    endNavigationTrace(nav, target, "done");
    commit(target, replace);
    fireDidNavigate(target);
  });
}

/**
 * `navigate(-1)`: `n` entries through the history, as the back and forward
 * buttons do; the `popstate` that follows runs the guard (with the path it
 * lands on). Resolves once the move has settled, or when the browser fired
 * no event (there is no entry that far).
 */
function navigateBy(delta: number): Promise<void> {
  if (!Number.isInteger(delta)) return Promise.reject(new TypeError(`navigate(${delta}): a history move must be a whole number`));
  const view = browser();
  if (delta === 0 || !view || isServerView()) return Promise.resolve();
  ensureListening();
  return new Promise<void>((resolve) => {
    const waiter: DeltaWaiter = { resolve, timer: undefined };
    waiter.timer = setTimeout(() => {
      deltaWaiters = deltaWaiters.filter((other) => other !== waiter);
      resolve();
    }, DELTA_EVENT_TIMEOUT_MS);
    deltaWaiters.push(waiter);
    view.history.go(delta);
  });
}

/**
 * `navigate(to, { target: "_blank" })`: after the guard, opens the route's URL
 * (the hash form in hash mode, under the basename in browser mode) in a new
 * tab, without access back to this one. The current page does not move: no
 * `didNavigate`.
 */
function openInNewTab(target: RouteLocation): Promise<void> {
  const open = () => {
    const view = browser();
    view?.open?.(browserUrl(view, routePath(target)), "_blank", "noopener,noreferrer");
  };
  const allowed = guard(target);
  if (allowed === true) {
    open();
    return Promise.resolve();
  }
  return allowed.then((ok) => {
    if (ok) open();
  });
}

/**
 * A redirect the app makes itself (the Pages fallback for an unknown path):
 * replaces the entry and fires `didNavigate`, without the guard.
 */
export function redirect(to: string): void {
  const target = parseLocation(to);
  latest++;
  endNavigationTrace(startNavigationTrace(), target, "done");
  commit(target, true);
  fireDidNavigate(target);
}

/**
 * Matches a route pattern (React Router v6 style, as XMLUI): static segments,
 * `:name`, an optional `:name?`, and a final `*`. Returns the parameters, or
 * undefined. Segments are URL-decoded; trailing slashes are ignored.
 */
export function matchRoute(pattern: string, pathname: string): Record<string, string> | undefined {
  const split = (path: string) => path.split("/").filter((segment) => segment !== "");
  const patternSegments = split(pattern);
  const pathSegments = split(pathname);
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const segment = patternSegments[i]!;
    if (segment === "*" && i === patternSegments.length - 1) {
      params["*"] = pathSegments.slice(i).map(decode).join("/");
      return params;
    }
    const value = pathSegments[i];
    if (segment.startsWith(":")) {
      const optional = segment.endsWith("?");
      const name = segment.slice(1, optional ? -1 : undefined);
      if (value === undefined) {
        if (optional) continue;
        return undefined;
      }
      params[name] = decode(value);
      continue;
    }
    if (value === undefined || decode(value) !== segment) return undefined;
  }
  return pathSegments.length > patternSegments.length ? undefined : params;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// The registered routes (Pages registers its Page patterns, in order, while it
// renders). Plain data, not a signal: routes are literals, and a signal write
// during render would notify components rendered before Pages. So a
// `$routeParams` read outside Pages, rendered before it, sees the routes only
// from the next navigation on.
let routes: readonly string[] = [];

/** Registers the app's route patterns, in order (first match wins). */
export function registerRoutes(patterns: readonly string[]): void {
  routes = [...patterns];
}

/** The first registered route matching a pathname, with its parameters. */
export function findRoute(pathname: string, patterns: readonly string[] = routes): { pattern: string; params: Record<string, string> } | undefined {
  for (const pattern of patterns) {
    const params = matchRoute(pattern, pathname);
    if (params) return { pattern, params };
  }
  return undefined;
}

/** `$routeParams`: the active route's parameters ({} when none matches). Tracked. */
export function currentRouteParams(): Readonly<Record<string, string>> {
  return Object.freeze(findRoute(currentLocation().pathname)?.params ?? {});
}

/** The registered route patterns, in order (the prerender renders the static ones). */
export function registeredRoutes(): readonly string[] {
  return routes;
}

/** Back to the initial state (hash mode, "/", no routes, no events): tests and each prerendered route. */
export function resetRouter(): void {
  mode = "hash";
  if (attachedTo) {
    attachedTo.removeEventListener("popstate", onBrowserChange);
    attachedTo = undefined;
  }
  routes = [];
  handlers = {};
  held = undefined;
  latest = 0;
  entryIndex = 0;
  browserIndex = 0;
  entryGone = false;
  basename = "";
  for (const waiter of deltaWaiters) if (waiter.timer !== undefined) clearTimeout(waiter.timer);
  deltaWaiters = [];
  serverPath = SERVER_PATH;
  location.set({ pathname: SERVER_PATH, query: {} });
}
