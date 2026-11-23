// Async-aware array methods for handler code (`$$r.arr`), as XMLUI's async
// evaluator has (expression-eval.md §5):
//   map, forEach                                   await callbacks sequentially
//   filter, every, some, find, findIndex, flatMap  await callbacks in parallel
//
// Each method runs natively until a callback returns a thenable, so a
// synchronous callback keeps native semantics (including early exit for
// find/some/every). Only from the first thenable on does it switch: the result
// is then a promise, which the handler's implicit await waits for.

export const ASYNC_ARRAY_METHODS: ReadonlySet<string> = new Set([
  "map",
  "forEach",
  "filter",
  "every",
  "some",
  "find",
  "findIndex",
  "flatMap",
]);

type Callback = (item: unknown, index: number, array: unknown[]) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** `object.name(...args)` with optional-chaining semantics; async-aware for arrays. */
export function arrayCall(object: unknown, name: string, args: unknown[]): unknown {
  if (object === null || object === undefined) return undefined;
  const method = (object as Record<string, unknown>)[name];
  if (!Array.isArray(object) || !ASYNC_ARRAY_METHODS.has(name) || typeof args[0] !== "function") {
    return typeof method === "function" ? Reflect.apply(method, object, args) : undefined;
  }
  const array = object as unknown[];
  const callback = args[0] as Callback;
  return name === "map" || name === "forEach" ? sequential(array, callback, name) : parallel(array, callback, name);
}

/** map and forEach: in order; from the first thenable on, each result is awaited before the next call. */
function sequential(array: unknown[], callback: Callback, name: "map" | "forEach"): unknown {
  const results: unknown[] = [];
  const length = array.length;
  for (let i = 0; i < length; i++) {
    const result = callback(array[i], i, array);
    if (isThenable(result)) return continueSequential(array, callback, name, results, i, result);
    results.push(result);
  }
  return name === "map" ? results : undefined;
}

async function continueSequential(
  array: unknown[],
  callback: Callback,
  name: "map" | "forEach",
  results: unknown[],
  index: number,
  first: PromiseLike<unknown>,
): Promise<unknown> {
  results.push(await first);
  for (let i = index + 1; i < array.length; i++) results.push(await callback(array[i], i, array));
  return name === "map" ? results : undefined;
}

/**
 * filter, every, some, find, findIndex, flatMap: native until the first thenable;
 * then the remaining callbacks are all called and their results awaited together.
 */
function parallel(array: unknown[], callback: Callback, name: string): unknown {
  const results: unknown[] = [];
  const length = array.length;
  for (let i = 0; i < length; i++) {
    const result = callback(array[i], i, array);
    if (isThenable(result)) {
      const rest: unknown[] = [result];
      for (let j = i + 1; j < length; j++) rest.push(callback(array[j], j, array));
      return Promise.all(rest).then((settled) => finish(array, name, [...results, ...settled]));
    }
    results.push(result);
    // Native early exit while everything is synchronous.
    if ((name === "find" || name === "findIndex" || name === "some") && result) return finish(array, name, results);
    if (name === "every" && !result) return false;
  }
  return finish(array, name, results);
}

/** Applies a method's semantics to precomputed callback results (one per visited item). */
function finish(array: unknown[], name: string, results: unknown[]): unknown {
  switch (name) {
    case "filter":
      return array.filter((_, i) => results[i]);
    case "every":
      return results.every(Boolean);
    case "some":
      return results.some(Boolean);
    case "find": {
      const index = results.findIndex(Boolean);
      return index === -1 ? undefined : array[index];
    }
    case "findIndex":
      return results.findIndex(Boolean);
    case "flatMap":
      return results.flat(1);
    default:
      throw new Error(`Unexpected array method '${name}'`);
  }
}
