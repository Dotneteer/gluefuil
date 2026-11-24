// Data errors (step 20; design: .ai/plan/poc-20-data.md § 2). Every failure of
// the HTTP gate is one plain, frozen object, so script can read it and never
// reaches a platform object (a Response, an Error) through it (step 3
// invariant). Categories as XMLUI's AppError (xmlui/src/components-core/errors/app-error.ts),
// plus `parse` and `timeout`.

export type DataErrorCategory =
  | "network" // the connection failed (offline, DNS, refused, dropped)
  | "timeout" // no answer within timeoutMs
  | "validation" // 400, 422
  | "authorization" // 401, 403
  | "not-found" // 404
  | "conflict" // 409
  | "rate-limit" // 429
  | "server" // 5xx
  | "parse" // the body isn't what its content type says
  | "internal"; // anything else (another status, a throwing transform)

export interface DataError {
  readonly message: string;
  readonly category: DataErrorCategory;
  /** The precise kind: `http-503`, `network`, `timeout`, `parse`, `internal`. */
  readonly code: string;
  /** The HTTP status, when there was a response. */
  readonly status?: number;
  readonly statusText?: string;
  /** Whether trying again may help. */
  readonly retryable: boolean;
  /** The response body (parsed JSON, or text), when there was one. */
  readonly body?: unknown;
  readonly method: string;
  readonly url: string;
  /** How many attempts were made (set when the request gave up). */
  readonly attempts?: number;
  /** The server's Retry-After, in ms (honoured by the retry policy). */
  readonly retryAfterMs?: number;
}

const RETRYABLE: Record<DataErrorCategory, boolean> = {
  network: true,
  timeout: true,
  validation: false,
  authorization: false,
  "not-found": false,
  conflict: false,
  "rate-limit": true,
  server: true,
  parse: false,
  internal: false,
};

/** The category of an HTTP status (XMLUI's categorizeHttpStatus, app-error.ts L181). */
export function categoryOfStatus(status: number): DataErrorCategory {
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "authorization";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limit";
  if (status >= 500 && status <= 599) return "server";
  return "internal";
}

/** Deeply freezes plain data (a parsed body), so script can't change a shared error. */
function freezeData<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeData((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function dataError(fields: Omit<DataError, "retryable"> & { retryable?: boolean }): DataError {
  const error: DataError = { ...fields, retryable: fields.retryable ?? RETRYABLE[fields.category] };
  // Leave out absent fields, so the object shows only what is known.
  for (const key of Object.keys(error) as (keyof DataError)[]) if (error[key] === undefined) delete (error as Partial<DataError>)[key];
  return freezeData(error);
}

/** The message for an HTTP error: the body's `message` when it has one. */
function httpMessage(status: number, statusText: string, body: unknown): string {
  const fromBody = body !== null && typeof body === "object" ? (body as { message?: unknown }).message : undefined;
  if (typeof fromBody === "string" && fromBody !== "") return fromBody;
  return `${status}${statusText ? ` ${statusText}` : ""}`;
}

export function httpError(request: { method: string; url: string }, status: number, statusText: string, body: unknown, retryAfterMs?: number): DataError {
  return dataError({
    message: httpMessage(status, statusText, body),
    category: categoryOfStatus(status),
    code: `http-${status}`,
    status,
    statusText,
    body,
    method: request.method,
    url: request.url,
    retryAfterMs,
  });
}

/** Whether a value is a DataError (frozen, with a category and a code). */
export function isDataError(value: unknown): value is DataError {
  return value !== null && typeof value === "object" && typeof (value as DataError).category === "string" && typeof (value as DataError).code === "string";
}

/** Any thrown value as a DataError (a throwing transform, a bug): category `internal`. */
export function toDataError(value: unknown, request: { method: string; url: string }): DataError {
  if (isDataError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return dataError({ message, category: "internal", code: "internal", method: request.method, url: request.url });
}

/** The same error with the number of attempts made. */
export function withAttempts(error: DataError, attempts: number): DataError {
  return error.attempts === attempts ? error : dataError({ ...error, attempts });
}
