// AppError (step 33; design: .ai/plan/poc-33-errors.md § AppError): the one
// shape of every error an app sees — a failed request, a thrown handler, a
// render error. XMLUI's class (xmlui/src/components-core/errors/app-error.ts)
// with step 20's HTTP fields kept (`status`, `body`, `url`, …) and XMLUI's
// `data` bag beside them, so markup written for either reads the same error.
//
// An AppError is frozen (its data deeply): script can share it, store it in a
// variable and read it, never change it. Script can construct one:
// `throw new AppError({ code, category, message })`.

export type AppErrorCategory =
  | "network" // the connection failed (offline, DNS, refused, dropped)
  | "timeout" // no answer within timeoutMs (here; XMLUI files it under network)
  | "validation" // 400, 422
  | "authorization" // 401, 403
  | "not-found" // 404
  | "conflict" // 409
  | "rate-limit" // 429
  | "server" // 5xx
  | "parse" // the body isn't what its content type says (here)
  | "user-cancelled" // the app's own cancellation (our cancellations are outcomes, never errors)
  | "internal"; // a bug, a throwing transform, anything else

/** Whether trying again may help, by category (XMLUI's DEFAULT_RETRYABLE, app-error.ts L33; timeout and parse added). */
const RETRYABLE: Readonly<Record<AppErrorCategory, boolean>> = {
  network: true,
  timeout: true,
  validation: false,
  authorization: false,
  "not-found": false,
  conflict: false,
  "rate-limit": true,
  server: true,
  parse: false,
  "user-cancelled": false,
  internal: false,
};

export const APP_ERROR_CATEGORIES: readonly AppErrorCategory[] = Object.freeze(Object.keys(RETRYABLE) as AppErrorCategory[]);

export function isAppErrorCategory(value: unknown): value is AppErrorCategory {
  return typeof value === "string" && Object.hasOwn(RETRYABLE, value);
}

/** The retryable default of a category. */
export function retryableByDefault(category: AppErrorCategory): boolean {
  return RETRYABLE[category];
}

/** The category of an HTTP status (XMLUI's categorizeHttpStatus, app-error.ts L181). */
export function categoryOfStatus(status: number): AppErrorCategory {
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "authorization";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limit";
  if (status >= 500 && status <= 599) return "server";
  return "internal";
}

export interface AppErrorInit {
  /** Machine-readable: `http-503`, `network`, `timeout`, `parse`, `circuit-open`, `unknown`, or the app's own. Default `unknown`. */
  code?: string;
  /** Default `internal`. */
  category?: AppErrorCategory;
  message?: string;
  /** Default: the category's. */
  retryable?: boolean;
  /** Server-issued (the response's X-Correlation-Id). */
  correlationId?: string;
  /** Structured details (XMLUI's names for HTTP errors: statusCode, response, retryAfterMs), and the app's own. */
  data?: Record<string, unknown>;
  /** What was thrown, when this wraps it. */
  cause?: unknown;
  // HTTP errors (step 20's fields).
  status?: number;
  statusText?: string;
  body?: unknown;
  method?: string;
  url?: string;
  /** How many attempts were made (set when a request gave up). */
  attempts?: number;
  /** The server's Retry-After, in ms. */
  retryAfterMs?: number;
}

/** Deeply freezes plain data (a parsed body), so script can't change a shared error. */
export function freezeData<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    const proto = Object.getPrototypeOf(value);
    // Only plain objects and arrays: a File or a Blob in a body stays as it is.
    if (proto !== Object.prototype && proto !== null && !Array.isArray(value)) return value;
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeData((value as Record<string, unknown>)[key]);
  }
  return value;
}

const HTTP_FIELDS = ["status", "statusText", "body", "method", "url", "attempts", "retryAfterMs"] as const;

export class AppError extends Error {
  // `declare`: no field initializers, so an absent field is absent (not undefined) and the object can be frozen.
  declare readonly code: string;
  declare readonly category: AppErrorCategory;
  declare readonly retryable: boolean;
  declare readonly correlationId?: string;
  declare readonly data: Readonly<Record<string, unknown>>;
  declare readonly status?: number;
  declare readonly statusText?: string;
  declare readonly body?: unknown;
  declare readonly method?: string;
  declare readonly url?: string;
  declare readonly attempts?: number;
  declare readonly retryAfterMs?: number;

  constructor(init?: AppErrorInit) {
    if (init === null || typeof init !== "object") throw new TypeError("new AppError({ code, category, message }) needs an object");
    if (init.category !== undefined && !isAppErrorCategory(init.category)) {
      throw new TypeError(`Unknown AppError category '${String(init.category)}'; one of ${APP_ERROR_CATEGORIES.join(", ")}`);
    }
    super(init.message === undefined || init.message === null ? "" : String(init.message), init.cause !== undefined ? { cause: init.cause } : undefined);
    const self = this as unknown as Record<string, unknown>;
    const category = init.category ?? "internal";
    Object.defineProperty(this, "name", { value: "AppError", enumerable: false, configurable: true, writable: true });
    self.code = typeof init.code === "string" && init.code !== "" ? init.code : "unknown";
    self.category = category;
    self.retryable = typeof init.retryable === "boolean" ? init.retryable : RETRYABLE[category];
    if (typeof init.correlationId === "string" && init.correlationId !== "") self.correlationId = init.correlationId;
    self.data = freezeData({ ...(init.data !== null && typeof init.data === "object" ? init.data : {}) });
    for (const key of HTTP_FIELDS) if (init[key] !== undefined) self[key] = freezeData(init[key]);
    Object.freeze(this);
  }

  /** A plain, JSON-ready copy (traces, logging, `JSON.stringify`). */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = { name: "AppError", code: this.code, category: this.category, retryable: this.retryable, message: this.message };
    if (this.correlationId !== undefined) json.correlationId = this.correlationId;
    if (Object.keys(this.data).length > 0) json.data = this.data;
    for (const key of HTTP_FIELDS) if (this[key] !== undefined) json[key] = this[key];
    const cause = this.cause;
    if (cause !== undefined) json.cause = cause instanceof AppError ? cause.toJSON() : cause instanceof Error ? { name: cause.name, message: cause.message } : String(cause);
    return json;
  }

  /**
   * Any thrown value as an AppError: an AppError as it is; an Error as
   * `internal`/`unknown` with the Error as `cause` (its message and stack
   * kept); anything else as `internal`/`unknown` with its text as the message.
   */
  static from(value: unknown): AppError {
    if (value instanceof AppError) return value;
    if (value instanceof Error) return new AppError({ code: "unknown", category: "internal", message: value.message, cause: value });
    return new AppError({ code: "unknown", category: "internal", message: value === undefined ? "Unknown error" : String(value), cause: value });
  }
}

// Script reads the class through the sandbox: neither it nor its prototype can be changed.
Object.freeze(AppError);
Object.freeze(AppError.prototype);

/** The init of an existing error (to copy it with changes). */
export function initOf(error: AppError): AppErrorInit {
  const init: AppErrorInit = { code: error.code, category: error.category, message: error.message, retryable: error.retryable, data: { ...error.data } };
  if (error.correlationId !== undefined) init.correlationId = error.correlationId;
  if (error.cause !== undefined) init.cause = error.cause;
  for (const key of HTTP_FIELDS) if (error[key] !== undefined) (init as Record<string, unknown>)[key] = error[key];
  return init;
}

/** The same error with some fields changed (a new, frozen AppError). */
export function withFields(error: AppError, patch: AppErrorInit): AppError {
  return new AppError({ ...initOf(error), ...patch });
}
