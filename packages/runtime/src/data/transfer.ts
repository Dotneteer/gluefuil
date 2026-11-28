// Uploads and downloads (step 32B; design: .ai/plan/poc-32b-files.md): XMLUI's
// FileUpload/FileDownload actions and `Actions.upload()`/`Actions.download()`.
// Both run as an APICall does (ApiCaller: the calling handler's cancellation,
// success/error/cancel, invalidation). An upload sends the file as the body,
// or with `asForm` a FormData with the file under `fieldName` (default
// "file") and `formParams`. A download is always fetched through the HTTP
// gate as a Blob and saved through an <a download> (decision I1). No chunks
// and no upload progress (fetch has none; XHR later).
import { currentInvocation, type Invocation } from "../render/handlers";
import { ApiCaller, type ApiCallEvents } from "./api-call";
import { appendField } from "./body";
import type { DataError } from "./errors";
import type { RequestSpec } from "./http";

type Handler = (...args: unknown[]) => unknown;

/** The options of an upload or a download (XMLUI's names). */
export interface TransferOptions {
  url?: unknown;
  method?: unknown;
  queryParams?: unknown;
  headers?: unknown;
  body?: unknown;
  payloadType?: unknown;
  timeoutMs?: unknown;
  invalidates?: unknown;
  /** Upload: the file (a File or Blob). */
  file?: unknown;
  /** Upload: send a FormData with the file under `fieldName` and `formParams`. */
  asForm?: unknown;
  fieldName?: unknown;
  formParams?: unknown;
  /** Download: the name to save it under. */
  fileName?: unknown;
  onSuccess?: unknown;
  onError?: unknown;
  onCancel?: unknown;
}

const record = (value: unknown) => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const isTrue = (value: unknown) => value === true || value === "true";
const isBlob = (value: unknown): value is Blob => typeof Blob !== "undefined" && value instanceof Blob;
/** A Blob by its shape: the response's Blob class may not be the page's (jsdom in tests). */
const isBlobLike = (value: unknown): value is Blob =>
  isBlob(value) || (typeof value === "object" && value !== null && typeof (value as Blob).arrayBuffer === "function" && typeof (value as Blob).size === "number");
const timeout = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && value !== undefined && value !== null && value !== "" ? n : 30_000;
};

/** The request of an upload. */
export function uploadSpec(o: TransferOptions): RequestSpec {
  let body: unknown = o.body;
  if (isTrue(o.asForm)) {
    const data = new FormData();
    if (o.file !== undefined && o.file !== null) appendField(data, typeof o.fieldName === "string" && o.fieldName !== "" ? o.fieldName : "file", o.file);
    for (const [key, value] of Object.entries(record(o.formParams) ?? {})) appendField(data, key, value);
    body = data;
  } else if (isBlob(o.file)) body = o.file;
  return {
    url: String(o.url ?? ""),
    method: typeof o.method === "string" && o.method !== "" ? o.method : "post",
    queryParams: record(o.queryParams),
    headers: record(o.headers),
    body,
    payloadType: o.payloadType,
    timeoutMs: timeout(o.timeoutMs),
  };
}

/** The request of a download: the response read as a Blob. */
export function downloadSpec(o: TransferOptions): RequestSpec {
  return {
    url: String(o.url ?? ""),
    method: typeof o.method === "string" && o.method !== "" ? o.method : "get",
    queryParams: record(o.queryParams),
    headers: record(o.headers),
    body: o.body,
    payloadType: o.payloadType,
    timeoutMs: timeout(o.timeoutMs),
    responseType: "blob",
  };
}

/** The name to save a download under: `fileName`, else Content-Disposition's, else the URL's last segment. */
export function downloadName(given: unknown, headers: Readonly<Record<string, string>> | undefined, url: string): string {
  if (typeof given === "string" && given.trim() !== "") return given.trim();
  const disposition = headers?.["content-disposition"] ?? "";
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(disposition);
  if (plain) return (plain[2] ?? plain[1]!).trim();
  const last = url.split(/[?#]/)[0]!.split("/").filter(Boolean).pop();
  return last ? decodeURIComponent(last) : "download";
}

/** Saves a Blob as a file: a temporary <a download> with an object URL. */
export function saveBlob(blob: Blob, name: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // The browser has started the download by the next task.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function events(o: TransferOptions, onResult?: (result: unknown) => void): ApiCallEvents {
  const call = (handler: unknown, ...args: unknown[]) => (typeof handler === "function" ? (handler as Handler)(...args) : undefined);
  return {
    success: async (result: unknown) => {
      onResult?.(result);
      return call(o.onSuccess, result);
    },
    ...(typeof o.onError === "function" ? { error: (error: DataError) => call(o.onError, error) } : {}),
    cancel: (reason: string) => call(o.onCancel, reason),
  };
}

const invalidatesOf = (value: unknown) =>
  typeof value === "string" && value !== "" ? { invalidates: value } : Array.isArray(value) ? { invalidates: value as string[] } : {};

/**
 * `Actions.upload(options)`: sends a file; resolves to the response (undefined
 * when cancelled or failed with an `onError`); rejects when it fails without one.
 */
export async function upload(options: TransferOptions, invocation: Invocation | undefined = currentInvocation()): Promise<unknown> {
  const caller = new ApiCaller();
  return caller.execute([], () => uploadSpec(options), { retries: 0, retryDelay: 500, ...invalidatesOf(options.invalidates), trace: { component: "upload" } }, events(options), invocation);
}

/** `Actions.download(options)`: fetches a file and saves it; resolves when saved. */
export async function download(options: TransferOptions, invocation: Invocation | undefined = currentInvocation()): Promise<void> {
  const caller = new ApiCaller();
  const spec = downloadSpec(options);
  let headers: Readonly<Record<string, string>> | undefined;
  await caller.execute(
    [],
    () => spec,
    { retries: 0, retryDelay: 500, trace: { component: "download" } },
    events(options, (blob) => {
      headers = caller.state.peek().lastResponseHeaders;
      if (isBlobLike(blob)) saveBlob(blob, downloadName(options.fileName, headers, spec.url));
    }),
    invocation,
  );
}

/** The `Actions` app global (XMLUI: pages/globals.md § Actions). */
export const Actions = Object.freeze({
  upload: (options: unknown) => upload((record(options) ?? {}) as TransferOptions),
  download: (options: unknown) => download((record(options) ?? {}) as TransferOptions),
});
