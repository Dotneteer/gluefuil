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

import { isServerView } from "../reactivity/server-view";
import { signal } from "../reactivity/signals";

export type RoutingMode = "hash" | "browser";

export interface RouteLocation {
  pathname: string;
  /** Query parameters (`?a=1&b=2`), decoded; a repeated name keeps its last value. */
  query: Readonly<Record<string, string>>;
}

/** The path static HTML is rendered for (the prerender renders "/"). */
export const SERVER_PATH = "/";

let mode: RoutingMode = "hash";
let listening = false;
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
  history: { pushState(data: unknown, unused: string, url: string): void; replaceState(data: unknown, unused: string, url: string): void };
  addEventListener(type: string, listener: () => void): void;
};

const browser = (): BrowserWindow | undefined => (globalThis as { window?: BrowserWindow }).window;

/** The route in the browser's current URL, for the current mode. */
function readBrowserLocation(view: BrowserWindow): RouteLocation {
  if (mode === "hash") return parseLocation(view.location.hash.replace(/^#/, ""));
  return parseLocation(`${view.location.pathname}${view.location.search}`);
}

/** Attaches the listeners once, in a browser. */
function ensureListening(): void {
  const view = browser();
  if (listening || !view) return;
  listening = true;
  const sync = () => location.set(readBrowserLocation(view));
  view.addEventListener("hashchange", sync);
  view.addEventListener("popstate", sync);
  sync();
}

/** The App's routing mode (`useHashBasedRouting`). Called while the App renders. */
export function setRoutingMode(next: RoutingMode): void {
  const view = browser();
  if (next !== mode) {
    mode = next;
    if (view && listening) location.set(readBrowserLocation(view));
  }
  ensureListening();
}

export function routingMode(): RoutingMode {
  return mode;
}

/** The current location: the server path in the server view. Tracked. */
export function currentLocation(): RouteLocation {
  if (isServerView()) return parseLocation(SERVER_PATH);
  ensureListening();
  return location.get();
}

/** The URL for a route in the current mode: `#/x` (hash) or `/x` (browser), for links. */
export function hrefFor(to: string): string {
  const { pathname, query } = parseLocation(to);
  const search = new URLSearchParams(query).toString();
  const path = search ? `${pathname}?${search}` : pathname;
  return mode === "hash" ? `#${path}` : path;
}

/** `navigate('/tests/x')`: goes to a route; `{ replace: true }` replaces the history entry. */
export function navigate(to: unknown, options?: { replace?: unknown }): void {
  const target = parseLocation(String(to ?? "/"));
  const href = hrefFor(String(to ?? "/"));
  const view = browser();
  if (view) {
    ensureListening();
    const url = mode === "hash" ? `${view.location.pathname}${view.location.search}${href}` : href;
    if (options?.replace === true) view.history.replaceState(null, "", url);
    else view.history.pushState(null, "", url);
  }
  // pushState/replaceState fire no event: update the signal ourselves.
  location.set(target);
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

/** For tests: back to the initial state (hash mode, "/", no routes). */
export function resetRouter(): void {
  mode = "hash";
  listening = false;
  routes = [];
  location.set({ pathname: SERVER_PATH, query: {} });
}
