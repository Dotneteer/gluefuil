// The HTTP gate (step 20; design: .ai/plan/poc-20-data.md § 2). All data
// traffic of DataSource and APICall goes through `sendRequest`: one attempt,
// with a timeout and cancellation, the response parsed, failures as DataError.
// It calls the platform's `fetch` (whatever answers it: a server, or a mock
// backend's host, is invisible here).
import { activeTrace, childSpan, emit, traceFields, traceNow, tracing } from "../trace/core";
import type { Cause, FetchEntry, FetchOutcome, TraceContext } from "../trace/entries";
import type { SourceLocation } from "../trace/location";
import { encodeBody } from "./body";
import { dataError, httpError, isDataError, type DataError } from "./errors";

/**
 * Step 35: who sends a request, for its trace entries. Without a context the
 * running handler's trace is used, else the first cause's, else a new trace.
 */
export interface FetchOrigin {
  /** `DataSource`, `APICall`, `FileUpload`, … */
  component: string;
  id?: string;
  at?: SourceLocation;
  /** The request's span (one per DataSource fetch or APICall call; its attempts share it). */
  context?: TraceContext;
  causes?: Cause[];
  /** 1 for the first attempt. */
  attempt?: number;
}

/** The span a request of `origin` belongs to (made only while tracing). */
export function fetchContext(origin: FetchOrigin | undefined): TraceContext {
  if (origin?.context) return origin.context;
  const running = activeTrace()?.context;
  const cause = origin?.causes?.[0];
  return childSpan(running ?? (cause ? { traceId: cause.traceId, spanId: cause.spanId } : undefined));
}

function outcomeOf(error: unknown): FetchOutcome {
  if (error instanceof RequestCancelledError) return "cancelled";
  if (!isDataError(error)) return "error";
  switch (error.category) {
    case "timeout":
      return "timeout";
    case "network":
      return "network";
    case "parse":
      return "parse";
    default:
      return error.status !== undefined ? "http" : "error";
  }
}

export interface RequestSpec {
  url: string;
  /** Default "get". */
  method?: string;
  /** Appended to the URL; arrays repeat the key; null and undefined are left out. */
  queryParams?: Record<string, unknown> | null;
  headers?: Record<string, unknown> | null;
  /**
   * An object or array is sent as JSON, or as multipart/form-data when it has a
   * File or Blob (step 32B); a string or a Blob as it is; undefined: no body.
   */
  body?: unknown;
  /** Step 32B: "json", "form" or "multipart-form" chooses the encoding (body.ts). */
  payloadType?: unknown;
  /** Step 32B: "blob" reads the response as a Blob (downloads); default: JSON or text. */
  responseType?: "blob";
  /** Per attempt. 0 or undefined: no timeout. */
  timeoutMs?: number;
}

export interface HttpResult {
  data: unknown;
  status: number;
  headers: Readonly<Record<string, string>>;
}

/** The URL with its query parameters, resolved against the page (absolute: fetch in Node needs that). */
export function buildUrl(url: string, queryParams?: Record<string, unknown> | null): string {
  const base = typeof document !== "undefined" ? document.baseURI : typeof location !== "undefined" ? location.href : "http://localhost/";
  const resolved = new URL(url, base);
  for (const [key, value] of Object.entries(queryParams ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue;
      resolved.searchParams.append(key, typeof item === "object" ? JSON.stringify(item) : String(item));
    }
  }
  return resolved.href;
}

/** Retry-After (seconds or an HTTP date) in ms; undefined when absent or invalid. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function headersObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    result[name] = value;
  });
  return Object.freeze(result);
}

/** The reason an abort carries: "timeout" for ours; anything else is a cancel. */
const TIMEOUT = Symbol("gfui.timeout");

/** Thrown (rejected) when the caller's signal aborts: not an error, an outcome. */
export class RequestCancelledError extends Error {
  override name = "RequestCancelledError";
  constructor(readonly reason: unknown) {
    super("The request was cancelled");
  }
}

/**
 * One attempt. Resolves to the parsed response; rejects with a DataError, or
 * with a RequestCancelledError when `signal` aborts.
 */
export async function sendRequest(spec: RequestSpec, signal?: AbortSignal, origin?: FetchOrigin): Promise<HttpResult> {
  const method = (spec.method ?? "get").toUpperCase();
  const url = buildUrl(spec.url, spec.queryParams);
  if (!tracing) return send(spec, method, url, signal);
  // Step 35: a start entry and an end entry, joined by the span.
  const context = fetchContext(origin);
  const base: Omit<FetchEntry, "seq" | "time" | "phase"> = {
    kind: "fetch",
    ...traceFields(context),
    ...(origin?.at ? { at: origin.at } : {}),
    method,
    url,
    ...(origin ? { owner: { component: origin.component, ...(origin.id !== undefined ? { id: origin.id } : {}) } } : {}),
    ...(origin?.attempt !== undefined ? { attempt: origin.attempt } : {}),
  };
  emit({ ...base, phase: "start", ...(origin?.causes && origin.causes.length > 0 ? { causes: origin.causes } : {}) });
  const started = traceNow();
  try {
    const result = await send(spec, method, url, signal);
    if (tracing) emit({ ...base, phase: "end", status: result.status, durationMs: traceNow() - started, outcome: "ok" });
    return result;
  } catch (error) {
    if (tracing) {
      const status = isDataError(error) ? error.status : undefined;
      const correlationId = isDataError(error) ? error.correlationId : undefined;
      emit({
        ...base,
        phase: "end",
        ...(status !== undefined ? { status } : {}),
        durationMs: traceNow() - started,
        outcome: outcomeOf(error),
        ...(correlationId !== undefined ? { correlationId } : {}),
      });
    }
    throw error;
  }
}

async function send(spec: RequestSpec, method: string, url: string, signal: AbortSignal | undefined): Promise<HttpResult> {
  const where = { method, url };
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(spec.headers ?? {})) if (value !== undefined && value !== null) headers[name] = String(value);
  let body: BodyInit | undefined;
  if (spec.body !== undefined && spec.body !== null && method !== "GET" && method !== "HEAD") {
    const encoded = encodeBody(spec.body, spec.payloadType);
    body = encoded.body;
    const given = Object.keys(headers).find((h) => h.toLowerCase() === "content-type");
    // Multipart: the browser writes the Content-Type with its boundary.
    if (encoded.contentType === null && given !== undefined) delete headers[given];
    else if (typeof encoded.contentType === "string" && given === undefined) headers["content-type"] = encoded.contentType;
  }
  if (signal?.aborted) throw new RequestCancelledError(signal.reason);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal!.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = spec.timeoutMs && spec.timeoutMs > 0 ? setTimeout(() => controller.abort(TIMEOUT), spec.timeoutMs) : undefined;
  try {
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
    } catch (error) {
      throw failure(error);
    }
    if (spec.responseType === "blob" && response.ok) {
      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (error) {
        throw failure(error);
      }
      return { data: blob, status: response.status, headers: headersObject(response.headers) };
    }
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw failure(error);
    }
    const contentType = response.headers.get("content-type") ?? "";
    let data: unknown = undefined;
    if (text !== "") {
      if (contentType.includes("json")) {
        try {
          data = JSON.parse(text);
        } catch {
          throw dataError({ message: "The response is not valid JSON", category: "parse", code: "parse", status: response.status, body: text, ...where });
        }
      } else data = text;
    }
    if (!response.ok) {
      // Step 33: the server's correlation id (XMLUI's documented header; its source never read it).
      const correlationId = response.headers.get("x-correlation-id") ?? undefined;
      throw httpError(where, response.status, response.statusText, data, parseRetryAfter(response.headers.get("retry-after")), correlationId);
    }
    // An HTML page where data was expected (a proxy's error page, a login page): a parse error.
    if (text !== "" && contentType.includes("text/html")) {
      throw dataError({ message: "Expected data, got an HTML page", category: "parse", code: "parse", status: response.status, body: text, ...where });
    }
    return { data, status: response.status, headers: headersObject(response.headers) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  function failure(error: unknown): DataError | RequestCancelledError {
    if (controller.signal.aborted) {
      if (controller.signal.reason === TIMEOUT) {
        return dataError({ message: `No answer within ${spec.timeoutMs} ms`, category: "timeout", code: "timeout", ...where });
      }
      return new RequestCancelledError(controller.signal.reason);
    }
    return dataError({ message: error instanceof Error ? error.message : "The connection failed", category: "network", code: "network", ...where });
  }
}
