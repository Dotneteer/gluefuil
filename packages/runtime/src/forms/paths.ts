// Field paths of a form's data (step 22): `name`, `address.city`, `items[0].x`
// (lodash's path syntax, as XMLUI's bindTo). Reads tolerate missing parts;
// writes copy every node on the way (the data is frozen) and create missing
// objects (or arrays, before a numeric key).

export type FieldKey = string | number;

/** `address.city` → ["address", "city"]; `items[0].x` → ["items", 0, "x"]. */
export function parseFieldPath(path: string): FieldKey[] {
  const keys: FieldKey[] = [];
  for (const part of path.split(".")) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) {
      keys.push(part);
      continue;
    }
    if (match[1] !== "") keys.push(match[1]!);
    for (const index of match[2]!.matchAll(/\[(\d+)\]/g)) keys.push(Number(index[1]));
  }
  return keys;
}

/** The value at `keys`, or undefined when a part is missing. */
export function getAt(root: unknown, keys: readonly FieldKey[]): unknown {
  let node = root;
  for (const key of keys) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<FieldKey, unknown>)[key];
  }
  return node;
}

function copyOrCreate(node: unknown, nextKey: FieldKey): Record<FieldKey, unknown> {
  if (Array.isArray(node)) return node.slice() as unknown as Record<FieldKey, unknown>;
  if (node !== null && typeof node === "object") return { ...(node as object) } as Record<FieldKey, unknown>;
  return (typeof nextKey === "number" ? [] : {}) as Record<FieldKey, unknown>;
}

/** A copy of `root` with `value` at `keys` (structural sharing elsewhere). */
export function setAt(root: unknown, keys: readonly FieldKey[], value: unknown): unknown {
  if (keys.length === 0) return value;
  const copy = copyOrCreate(root, keys[0]!);
  copy[keys[0]!] = setAt(copy[keys[0]!], keys.slice(1), value);
  return copy;
}

/** A copy of `root` without the value at `keys` (unchanged when it is missing). */
export function deleteAt(root: unknown, keys: readonly FieldKey[]): unknown {
  if (keys.length === 0 || root === null || typeof root !== "object") return root;
  const [key, ...rest] = keys as [FieldKey, ...FieldKey[]];
  if (!Object.hasOwn(root, key)) return root;
  const copy = copyOrCreate(root, key);
  if (rest.length === 0) {
    if (Array.isArray(copy)) copy[key as number] = undefined;
    else delete copy[key];
  } else copy[key] = deleteAt(copy[key], rest);
  return copy;
}
