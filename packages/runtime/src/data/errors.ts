// Data errors (step 20; design: .ai/plan/poc-20-data.md § 2). Since step 33
// every failure of the HTTP gate is an AppError (../errors/app-error.ts):
// frozen, with step 20's HTTP fields (`status`, `body`, `url`, …) and XMLUI's
// `data` (`statusCode`, `response`, `retryAfterMs`). `DataError` stays as its
// name in the data layer.
import { AppError, categoryOfStatus, withFields, type AppErrorCategory, type AppErrorInit } from "../errors/app-error";

export { categoryOfStatus };

export type DataError = AppError;
export type DataErrorCategory = AppErrorCategory;

type DataErrorFields = Omit<AppErrorInit, "category" | "code" | "message" | "method" | "url"> & {
  message: string;
  category: AppErrorCategory;
  code: string;
  method: string;
  url: string;
};

/** XMLUI's `data` names for an HTTP error (app-error.ts `AppError.from`). */
function xmluiData(fields: DataErrorFields): Record<string, unknown> {
  const data: Record<string, unknown> = { ...fields.data };
  if (fields.status !== undefined) data.statusCode = fields.status;
  if (fields.body !== undefined) data.response = fields.body;
  if (fields.retryAfterMs !== undefined) data.retryAfterMs = fields.retryAfterMs;
  return data;
}

export function dataError(fields: DataErrorFields): DataError {
  return new AppError({ ...fields, data: xmluiData(fields) });
}

/** The message for an HTTP error: the body's `message` when it has one. */
function httpMessage(status: number, statusText: string, body: unknown): string {
  const fromBody = body !== null && typeof body === "object" ? (body as { message?: unknown }).message : undefined;
  if (typeof fromBody === "string" && fromBody !== "") return fromBody;
  return `${status}${statusText ? ` ${statusText}` : ""}`;
}

export function httpError(
  request: { method: string; url: string },
  status: number,
  statusText: string,
  body: unknown,
  retryAfterMs?: number,
  correlationId?: string,
): DataError {
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
    correlationId,
  });
}

/** Whether a value is an AppError (every data error is one). */
export function isDataError(value: unknown): value is DataError {
  return value instanceof AppError;
}

/** Any thrown value as a DataError (a throwing transform, a bug): category `internal`, the request's method and URL. */
export function toDataError(value: unknown, request: { method: string; url: string }): DataError {
  if (value instanceof AppError) return value;
  const message = value instanceof Error ? value.message : String(value);
  return dataError({ message, category: "internal", code: "internal", method: request.method, url: request.url, cause: value });
}

/** The same error with the number of attempts made. */
export function withAttempts(error: DataError, attempts: number): DataError {
  return error.attempts === attempts ? error : withFields(error, { attempts });
}
