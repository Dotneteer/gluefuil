// The query engine (step 20; design: .ai/plan/poc-20-data.md § 3):
// @tanstack/query-core without React. One client per page, like the theme
// state; its results are bridged into signals by ./loader.ts.
import { notifyManager, QueryClient, type Query } from "@tanstack/query-core";
import { batch } from "../reactivity/signals";
import { buildUrl, type RequestSpec } from "./http";
import { setRetryJitter } from "./retry";

// Query-core's notifications in one signal batch each, as soon as possible
// (a microtask, not its default setTimeout).
notifyManager.setScheduler((callback) => queueMicrotask(callback));
notifyManager.setBatchNotifyFunction((callback) => batch(callback));

let client: QueryClient | undefined;

/** The page's query client. */
export function queryClient(): QueryClient {
  return (client ??= new QueryClient({
    defaultOptions: {
      queries: {
        // Requests go out whatever navigator.onLine says: an offline network is an error to show, not a pause.
        networkMode: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // Retries are decided per DataSource (./loader.ts).
        retry: false,
      },
    },
  }));
}

/** Clears the cache and starts over (tests; a new page). */
export function resetDataState(): void {
  client?.clear();
  client = undefined;
  setRetryJitter(true);
}

export interface DataDefaults {
  /** The ±25% jitter of the retry backoff. Default true; tests turn it off. */
  jitter?: boolean;
}

export function setDataDefaults(defaults: DataDefaults): void {
  if (defaults.jitter !== undefined) setRetryJitter(defaults.jitter);
}

/**
 * The cache key of a request: two DataSources with the same key share one
 * request and one cache entry. The path is kept apart, for invalidation.
 */
export function queryKey(spec: RequestSpec): readonly unknown[] {
  const url = new URL(buildUrl(spec.url, spec.queryParams));
  return ["gfui", (spec.method ?? "get").toLowerCase(), url.pathname, url.search, spec.body ?? null, spec.headers ?? null];
}

/** The URL path of a query (its key's third part). */
function pathOf(query: Query): string | undefined {
  const key = query.queryKey;
  return key[0] === "gfui" && typeof key[2] === "string" ? key[2] : undefined;
}

/** Whether `path` is `target` or lies below it (`/api/users/1` under `/api/users`). */
export function pathMatches(path: string, target: string): boolean {
  const normalized = new URL(buildUrl(target)).pathname.replace(/\/$/, "");
  return path === normalized || path.startsWith(`${normalized}/`) || (normalized === "" && path.startsWith("/"));
}

/**
 * Marks queries stale and refetches the ones in use: those whose path is one
 * of `targets` or below it; every query when `targets` is undefined (XMLUI's
 * APICall without `invalidates`, actionUtils.ts L28–30).
 */
export function invalidate(targets?: string | readonly string[]): Promise<void> {
  const list = targets === undefined ? undefined : (typeof targets === "string" ? [targets] : targets).filter((t) => typeof t === "string" && t !== "");
  return queryClient().invalidateQueries({
    predicate: (query) => {
      if (list === undefined) return true;
      const path = pathOf(query);
      return path !== undefined && list.some((target) => pathMatches(path, target));
    },
  });
}
