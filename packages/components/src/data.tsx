// DataSource and APICall (step 20; design: .ai/plan/poc-20-data.md § 3–4).
// Thin React shells: the runtime's Loader and ApiCaller do the work; these
// pass the props, publish the API (`users.value`, `save.execute()`) and wire
// the events. Neither renders anything.
import {
  ApiCaller,
  Loader,
  resolveDeferred,
  useComponentApi,
  useSignal,
  type ApiCallEvents,
  type DataError,
  type LoaderOptions,
  type LoaderState,
  type RegisterApi,
  type RequestSpec,
} from "@gluefuil/runtime";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Handler = (...args: unknown[]) => unknown;

const asRecord = (value: unknown) => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);
const asNumber = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const isFalse = (value: unknown) => value === false || value === "false";

/** `data.items` → the value at that path (resultSelector). */
function selectPath(data: unknown, path: string): unknown {
  let value = data;
  for (const part of path.split(".").filter(Boolean)) value = (value as Record<string, unknown> | null | undefined)?.[part];
  return value;
}

/** resultSelector, then transformResult. */
function selector(resultSelector: unknown, transformResult: unknown): ((data: unknown) => unknown) | undefined {
  const path = typeof resultSelector === "string" && resultSelector !== "" ? resultSelector : undefined;
  const transform = typeof transformResult === "function" ? (transformResult as (data: unknown) => unknown) : undefined;
  if (!path && !transform) return undefined;
  return (data) => {
    const selected = path ? selectPath(data, path) : data;
    return transform ? transform(selected) : selected;
  };
}

/**
 * A Loader mounted with the component: created once, its options updated after
 * each render, its unmount deferred by a microtask so StrictMode's simulated
 * unmount doesn't abort and repeat the request.
 */
function useLoader(options: LoaderOptions): Loader {
  const [loader] = useState(() => new Loader(options));
  useEffect(() => {
    loader.setOptions(options);
  });
  const pendingUnmount = useRef(false);
  useEffect(() => {
    pendingUnmount.current = false;
    loader.mount();
    return () => {
      pendingUnmount.current = true;
      queueMicrotask(() => {
        if (pendingUnmount.current) loader.unmount();
      });
    };
  }, [loader]);
  return loader;
}

export interface DataSourceProps {
  url?: unknown;
  method?: unknown;
  queryParams?: unknown;
  headers?: unknown;
  body?: unknown;
  when?: unknown;
  resultSelector?: unknown;
  transformResult?: unknown;
  pollIntervalInSeconds?: unknown;
  structuralSharing?: unknown;
  retries?: unknown;
  retryDelay?: unknown;
  timeoutMs?: unknown;
  onLoaded?: Handler;
  onError?: Handler;
  onCancel?: Handler;
  registerApi?: RegisterApi;
}

/** The request of a DataSource or a `data` URL; undefined while the URL can't be built. */
function requestOf(props: DataSourceProps): RequestSpec | undefined {
  if (props.url === undefined || props.url === null || props.url === "") return undefined;
  return {
    url: String(props.url),
    method: typeof props.method === "string" ? props.method : "get",
    queryParams: asRecord(props.queryParams) ?? null,
    headers: asRecord(props.headers) ?? null,
    body: props.body,
    timeoutMs: asNumber(props.timeoutMs, 30_000),
  };
}

function loaderOptions(props: DataSourceProps, select: ((data: unknown) => unknown) | undefined): LoaderOptions {
  const request = requestOf(props);
  const isGet = (request?.method ?? "get").toLowerCase() === "get";
  return {
    request,
    // `when` (a prop here, not visibility): undefined means fetch; any falsy value, or "false", doesn't.
    enabled: props.when === undefined || (Boolean(props.when) && !isFalse(props.when)),
    retries: asNumber(props.retries, isGet ? 2 : 0),
    retryDelay: asNumber(props.retryDelay, 500),
    pollIntervalMs: asNumber(props.pollIntervalInSeconds, 0) * 1000,
    structuralSharing: !isFalse(props.structuralSharing),
    ...(select ? { select } : {}),
  };
}

export function DataSource(props: DataSourceProps) {
  const select = useMemo(() => selector(props.resultSelector, props.transformResult), [props.resultSelector, props.transformResult]);
  const loader = useLoader(loaderOptions(props, select));
  loader.events = {
    ...(props.onLoaded ? { loaded: (data, isRefetch) => props.onLoaded!(data, isRefetch) } : {}),
    ...(props.onError ? { error: (error: DataError) => props.onError!(error) } : {}),
    ...(props.onCancel ? { cancel: (reason) => props.onCancel!(reason) } : {}),
  };
  const api = useMemo(() => {
    const state = () => loader.state.get();
    return {
      get value() {
        return state().value;
      },
      get inProgress() {
        return state().inProgress;
      },
      get isRefetching() {
        return state().isRefetching;
      },
      get loaded() {
        return state().loaded;
      },
      get error() {
        return state().error;
      },
      get cancelled() {
        return state().cancelled;
      },
      get lastCancelReason() {
        return state().lastCancelReason;
      },
      get responseHeaders() {
        return state().responseHeaders;
      },
      refetch: () => loader.refetch(),
      cancel: (reason?: unknown) => loader.cancel(typeof reason === "string" ? reason : "user"),
    };
  }, [loader]);
  useComponentApi(props.registerApi, api);
  return null;
}

export interface APICallProps {
  url?: unknown;
  method?: unknown;
  queryParams?: unknown;
  headers?: unknown;
  body?: unknown;
  invalidates?: unknown;
  retries?: unknown;
  retryDelay?: unknown;
  timeoutMs?: unknown;
  onBeforeRequest?: Handler;
  onSuccess?: Handler;
  onError?: Handler;
  onCancel?: Handler;
  registerApi?: RegisterApi;
}

export function APICall(props: APICallProps) {
  const [caller] = useState(() => new ApiCaller());
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    caller.activate();
    return () => caller.dispose();
  }, [caller]);
  const api = useMemo(() => {
    const state = () => caller.state.get();
    const execute = (...params: unknown[]) => {
      const p = latest.current;
      const context = (args: readonly unknown[]) => ({ $param: args[0], $params: [...args] });
      const spec = (args: readonly unknown[]): RequestSpec => {
        const ctx = context(args);
        const method = resolveDeferred(p.method, ctx);
        return {
          url: String(resolveDeferred(p.url, ctx) ?? ""),
          method: typeof method === "string" ? method : "get",
          queryParams: asRecord(resolveDeferred(p.queryParams, ctx)) ?? null,
          headers: asRecord(resolveDeferred(p.headers, ctx)) ?? null,
          body: resolveDeferred(p.body, ctx),
          timeoutMs: asNumber(p.timeoutMs, 30_000),
        };
      };
      const invalidates = resolveDeferred(p.invalidates, context(params));
      const events: ApiCallEvents = {
        ...(p.onBeforeRequest ? { beforeRequest: (...args: unknown[]) => p.onBeforeRequest!(...args) } : {}),
        ...(p.onSuccess ? { success: (result: unknown) => p.onSuccess!(result) } : {}),
        ...(p.onError ? { error: (error: DataError) => p.onError!(error) } : {}),
        ...(p.onCancel ? { cancel: (reason: string) => p.onCancel!(reason) } : {}),
      };
      return caller.execute(
        params,
        spec,
        {
          retries: asNumber(p.retries, 0),
          retryDelay: asNumber(p.retryDelay, 500),
          ...(invalidates !== undefined && invalidates !== null && invalidates !== "" ? { invalidates: invalidates as string | string[] } : {}),
        },
        events,
      );
    };
    return {
      execute,
      cancel: (reason?: unknown) => caller.cancel(typeof reason === "string" ? reason : "user"),
      get inProgress() {
        return state().inProgress;
      },
      get loaded() {
        return state().loaded;
      },
      get lastResult() {
        return state().lastResult;
      },
      get lastError() {
        return state().lastError;
      },
      get cancelled() {
        return state().cancelled;
      },
      get lastCancelReason() {
        return state().lastCancelReason;
      },
      get lastResponseHeaders() {
        return state().lastResponseHeaders;
      },
    };
  }, [caller]);
  useComponentApi(props.registerApi, api);
  return null;
}

/** A URL in `data` (`<Items data="/api/users">`): http(s) or a path. */
export function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^(\/|\.\/|\.\.\/|https?:\/\/)/.test(value.trim());
}

/** The state of a `data` URL's load (a Form's `data`, step 22B); nothing is fetched without a URL. */
export function useDataUrlState(url: string | undefined): LoaderState {
  const loader = useLoader(loaderOptions({ url }, undefined));
  return useSignal(loader.state);
}

/** Loads a `data` URL like a DataSource without an id, and renders `render` with the value. */
export function DataUrl({ url, render }: { url: string; render: (value: unknown) => ReactNode }) {
  const loader = useLoader(loaderOptions({ url }, undefined));
  const state = useSignal(loader.state);
  return <>{render(state.value)}</>;
}
