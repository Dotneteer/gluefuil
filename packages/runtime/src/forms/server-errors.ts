// A failed submit's validation errors (step 22B), after XMLUI's
// components-core/forms/server-error-mapping.ts: the four wire shapes, tried in
// XMLUI's order, on the error and the objects it carries (a DataError's `body`).

import type { Severity } from "./rules";

export interface ServerFieldError {
  /** The field's name as the server reports it: a bindTo path, if it matches one. */
  name: string;
  message: string;
  severity: Severity;
}

export interface ServerProblem {
  fields: ServerFieldError[];
  /** RFC 7807 `detail`, or the body's `message`. */
  detail?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const asString = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/** The error, then what it carries: data, body, payload, problem, details, response, response.data. */
function candidates(error: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const add = (value: unknown) => {
    const record = asRecord(value);
    if (record && !found.includes(record)) found.push(record);
  };
  const root = asRecord(error);
  if (!root) return found;
  add(root);
  for (const key of ["data", "body", "payload", "problem", "details", "response"]) add(root[key]);
  add(asRecord(root.response)?.data);
  return found;
}

const field = (name: string | undefined, message: string | undefined, severity: Severity = "error"): ServerFieldError[] =>
  name && message ? [{ name, message, severity }] : [];

/** 1. RFC 7807 / 9457: `invalid-params` (or `invalidParams`): [{ name, reason | detail }]. */
function rfc7807(payload: Record<string, unknown>): ServerFieldError[] | undefined {
  const list = payload["invalid-params"] ?? payload.invalidParams;
  if (!Array.isArray(list)) return undefined;
  return list.flatMap((item) => {
    const r = asRecord(item);
    return r ? field(asString(r.name), asString(r.reason) ?? asString(r.detail)) : [];
  });
}

/** 2. Spring: errors: [{ field | objectName, defaultMessage | message | reason }]. */
function spring(payload: Record<string, unknown>): ServerFieldError[] | undefined {
  if (!Array.isArray(payload.errors)) return undefined;
  return payload.errors.flatMap((item) => {
    const r = asRecord(item);
    return r ? field(asString(r.field) ?? asString(r.objectName), asString(r.defaultMessage) ?? asString(r.message) ?? asString(r.reason)) : [];
  });
}

/** 3. Laravel: errors: { field: ["msg"] | "msg" } (the first message). */
function laravel(payload: Record<string, unknown>): ServerFieldError[] | undefined {
  const errors = asRecord(payload.errors);
  if (!errors) return undefined;
  return Object.entries(errors).flatMap(([name, value]) =>
    field(name, Array.isArray(value) ? value.find((m): m is string => typeof m === "string" && m !== "") : asString(value)),
  );
}

/** 4. XMLUI's legacy shape: details.issues (or issues): [{ field, message, severity }]. */
function legacy(payload: Record<string, unknown>): ServerFieldError[] | undefined {
  const issues = (asRecord(payload.details) ?? payload).issues;
  if (!Array.isArray(issues)) return undefined;
  return issues.flatMap((item) => {
    const r = asRecord(item);
    if (!r) return [];
    const severity = r.severity === "warning" || r.severity === "warn" ? "warning" : "error";
    return field(asString(r.field), asString(r.message), severity);
  });
}

/** The validation problem in a failed submit's error, or undefined (no recognized shape). */
export function extractServerProblem(error: unknown): ServerProblem | undefined {
  for (const payload of candidates(error)) {
    for (const shape of [rfc7807, spring, laravel, legacy]) {
      const fields = shape(payload);
      if (fields && fields.length > 0) {
        const detail = asString(payload.detail) ?? asString(payload.message);
        return detail === undefined ? { fields } : { fields, detail };
      }
    }
  }
  return undefined;
}
