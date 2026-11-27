// Request bodies (step 32B; design: .ai/plan/poc-32b-files.md § H). JSON by
// default; a body with a File or Blob anywhere goes as multipart/form-data
// (a file can't go as JSON); `payloadType` chooses explicitly, as XMLUI's
// APICall: "json", "form" (URL-encoded) or "multipart-form". The fields follow
// XMLUI's appendFormFieldValue (RestApiProxy.ts 170–200): files as they are,
// arrays repeat the key, nested objects as `a.b`, null and undefined left out.

export const PAYLOAD_TYPES = ["json", "form", "multipart-form"] as const;
export type PayloadType = (typeof PAYLOAD_TYPES)[number];

const isBlob = (value: unknown): value is Blob => typeof Blob !== "undefined" && value instanceof Blob;
const isPlain = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Whether a File or Blob is anywhere in the value (inside arrays and plain objects). */
export function containsBinary(value: unknown, seen = new Set<unknown>()): boolean {
  if (isBlob(value)) return true;
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsBinary(item, seen));
  return isPlain(value) && Object.values(value).some((item) => containsBinary(item, seen));
}

/** Adds one field (XMLUI's rules: a file as it is, an array repeats the key, an object as `key.child`). */
export function appendField(data: { append(name: string, value: string | Blob): void }, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (isBlob(value)) data.append(key, value);
  else if (Array.isArray(value)) for (const item of value) appendField(data, key, item);
  else if (isPlain(value)) for (const [child, item] of Object.entries(value)) appendField(data, `${key}.${child}`, item);
  else data.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

/** The fields of an object body (another value is one field named "value"). */
function fields(body: unknown): [string, unknown][] {
  return isPlain(body) ? Object.entries(body) : [["value", body]];
}

export interface EncodedBody {
  body: BodyInit | undefined;
  /** The Content-Type to set; null: none (the browser sets multipart's boundary); undefined: leave as given. */
  contentType: string | null | undefined;
}

/** The body to send and its Content-Type. */
export function encodeBody(body: unknown, payloadType?: unknown): EncodedBody {
  if (body === undefined || body === null) return { body: undefined, contentType: undefined };
  // A body built already (an asForm upload's FormData): as it is.
  if (typeof FormData !== "undefined" && body instanceof FormData) return { body, contentType: null };
  if (body instanceof URLSearchParams) return { body, contentType: "application/x-www-form-urlencoded" };
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return { body: body as BodyInit, contentType: "application/octet-stream" };
  const explicit = (PAYLOAD_TYPES as readonly unknown[]).includes(payloadType) ? (payloadType as PayloadType) : undefined;
  if (explicit === undefined && isBlob(body)) return { body, contentType: body.type || "application/octet-stream" };
  if (explicit === undefined && typeof body === "string") return { body, contentType: undefined };
  if (explicit === "multipart-form" || (explicit === undefined && containsBinary(body))) {
    const data = new FormData();
    for (const [key, value] of fields(body)) appendField(data, key, value);
    return { body: data, contentType: null };
  }
  if (explicit === "form") {
    const data = new URLSearchParams();
    for (const [key, value] of fields(body)) appendField({ append: (name, v) => data.append(name, typeof v === "string" ? v : "") }, key, value);
    return { body: data.toString(), contentType: "application/x-www-form-urlencoded" };
  }
  return { body: typeof body === "string" && explicit === undefined ? body : JSON.stringify(body), contentType: "application/json" };
}
