// Bounded value previews (step 35, decision 3): what a trace entry keeps of a
// value. At most PREVIEW_NODES nodes, PREVIEW_DEPTH levels and PREVIEW_STRING
// characters per string; what is cut is counted ("…98 more"). A preview is plain
// JSON data, so the export and the BroadcastChannel can carry it as it is.
// Never JSON.stringify the value: on 10,000 rows that is ~1 ms, a preview ~0.5 µs.

export const PREVIEW_NODES = 40;
export const PREVIEW_DEPTH = 2;
export const PREVIEW_STRING = 80;
/** What a masked value (a password) is recorded as. */
export const MASK = "•••";

const BlobType = (globalThis as unknown as { Blob?: abstract new (...args: never[]) => object }).Blob;

/** A JSON value. */
export type Preview = null | boolean | number | string | Preview[] | { [key: string]: Preview };

function isPlain(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function typeName(value: object): string {
  const name = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === "string" && name !== "" ? name : "Object";
}

/** A bounded, JSON-safe preview of `value`. */
export function preview(value: unknown): Preview {
  const budget = { nodes: PREVIEW_NODES };
  return walk(value, 0, budget, new Set());
}

function walk(value: unknown, depth: number, budget: { nodes: number }, seen: Set<object>): Preview {
  budget.nodes--;
  switch (typeof value) {
    case "undefined":
      return "[undefined]";
    case "string":
      return value.length > PREVIEW_STRING ? `${value.slice(0, PREVIEW_STRING)}…` : value;
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return `${value}n`;
    case "symbol":
      return String(value);
    case "function":
      return "[function]";
  }
  if (value === null) return null;
  const object = value as object;
  if (seen.has(object)) return "[circular]";
  if (Array.isArray(object)) {
    if (depth >= PREVIEW_DEPTH || budget.nodes <= 0) return `[Array(${object.length})]`;
    seen.add(object);
    const out: Preview[] = [];
    for (let i = 0; i < object.length; i++) {
      if (budget.nodes <= 0) {
        out.push(`…${object.length - i} more`);
        break;
      }
      out.push(walk(object[i], depth + 1, budget, seen));
    }
    seen.delete(object);
    return out;
  }
  if (object instanceof Date) return Number.isNaN(object.getTime()) ? "[Invalid Date]" : object.toISOString();
  if (object instanceof Error) return `[${object.name}: ${object.message.slice(0, PREVIEW_STRING)}]`;
  if (!isPlain(object)) {
    // Files, maps, platform objects: their kind (and a file's name), never their content.
    const file = object as { name?: unknown; size?: unknown };
    if (BlobType !== undefined && object instanceof BlobType) return `[${typeName(object)}${typeof file.name === "string" ? ` ${file.name}` : ""}, ${String(file.size)} bytes]`;
    if (object instanceof Map || object instanceof Set) return `[${typeName(object)}(${object.size})]`;
    return `[${typeName(object)}]`;
  }
  const keys = Object.keys(object);
  if (depth >= PREVIEW_DEPTH || budget.nodes <= 0) return `[Object(${keys.length})]`;
  seen.add(object);
  const out: { [key: string]: Preview } = {};
  for (let i = 0; i < keys.length; i++) {
    if (budget.nodes <= 0) {
      out["…"] = `${keys.length - i} more`;
      break;
    }
    out[keys[i]!] = walk((object as Record<string, unknown>)[keys[i]!], depth + 1, budget, seen);
  }
  seen.delete(object);
  return out;
}
