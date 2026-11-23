// Writes through a path rooted at a variable, compiled from handler code:
//
//   settings.itemSize = v    ->  $$r.setIn($$s, "settings", ["itemSize"], v)
//   delete user.tags[0]      ->  $$r.deleteIn($$s, "user", ["tags", 0])
//   cart.count++             ->  $$r.updateIn($$s, "cart", ["count"], 1, false)
//   newItems.push(item)      ->  $$r.mutate($$s, "newItems", [], "push", [item])
//
// Variable values are frozen, so these copy each node along the path
// (structural sharing: untouched branches are reused) and assign the new root
// through the scope's setter, which notifies readers.

import { ReactivityError } from "../reactivity/signals";

export type PathKey = string | number | symbol;

/** Array methods that mutate in place; compiled to `mutate` when called on a variable path. */
export const ARRAY_MUTATORS: ReadonlySet<string> = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

function copyNode(node: unknown, name: string): Record<PathKey, unknown> {
  if (Array.isArray(node)) return node.slice() as unknown as Record<PathKey, unknown>;
  if (node !== null && typeof node === "object") {
    const proto = Object.getPrototypeOf(node);
    if (proto === Object.prototype) return { ...(node as object) } as Record<PathKey, unknown>;
    if (proto === null) return Object.assign(Object.create(null), node);
  }
  throw new ReactivityError(
    `Cannot change part of '${name}': only plain objects and arrays can be changed through a path (found ${node === null ? "null" : typeof node})`,
  );
}

/** Replaces the node at `path` with `leaf(node)`, copying every node on the way. */
function produce<R>(
  root: unknown,
  path: readonly PathKey[],
  name: string,
  leaf: (node: unknown) => [replacement: unknown, result: R],
  index = 0,
): [unknown, R] {
  if (index === path.length) return leaf(root);
  const copy = copyNode(root, name);
  const key = path[index]!;
  const [child, result] = produce(copy[key], path, name, leaf, index + 1);
  copy[key] = child;
  return [copy, result];
}

type Scope = Record<string, unknown>;

export function setIn(scope: object, name: string, path: readonly PathKey[], value: unknown): unknown {
  const [root] = produce((scope as Scope)[name], path, name, () => [value, undefined]);
  (scope as Scope)[name] = root;
  return value;
}

export function deleteIn(scope: object, name: string, path: readonly PathKey[]): boolean {
  const last = path[path.length - 1]!;
  const [root] = produce((scope as Scope)[name], path.slice(0, -1), name, (parent) => {
    const copy = copyNode(parent, name);
    delete copy[last];
    return [copy, undefined];
  });
  (scope as Scope)[name] = root;
  return true;
}

/** `++`/`--` on a path; returns what the JavaScript operator would. */
export function updateIn(scope: object, name: string, path: readonly PathKey[], delta: 1 | -1, prefix: boolean): unknown {
  const [root, result] = produce((scope as Scope)[name], path, name, (old) => {
    const before = typeof old === "bigint" ? old : Number(old);
    const after = typeof before === "bigint" ? before + BigInt(delta) : before + delta;
    return [after, prefix ? after : before];
  });
  (scope as Scope)[name] = root;
  return result;
}

/** Calls an array mutator on a copy of the array at `path`; returns the method's result. */
export function mutate(scope: object, name: string, path: readonly PathKey[], method: string, args: unknown[]): unknown {
  if (!ARRAY_MUTATORS.has(method)) throw new ReactivityError(`'${method}' is not an array mutator`);
  const [root, result] = produce((scope as Scope)[name], path, name, (node) => {
    if (!Array.isArray(node)) {
      throw new ReactivityError(`Cannot call '${method}' on part of '${name}': it is not an array`);
    }
    const copy = node.slice();
    const value = (copy as unknown as Record<string, (...a: unknown[]) => unknown>)[method]!(...args);
    return [copy, value];
  });
  (scope as Scope)[name] = root;
  // `sort`, `reverse`, `fill` and `copyWithin` return the array: that is the copy now stored.
  return result;
}
