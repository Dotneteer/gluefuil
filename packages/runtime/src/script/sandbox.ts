// The runtime side of the pfui script sandbox: the objects compiled code reads
// as `$$g` (globals) and `$$r` (helpers). The compiler resolves every name at
// compile time against the same tables (packages/compiler/src/codegen/names.ts);
// tools/sandbox-drift.test.ts keeps the two in sync.
// Design: .ai/plan/poc-03-codegen.md

/** Member names that lead to code execution or prototype tampering. */
export const BANNED_MEMBERS: ReadonlySet<string> = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "caller",
  "callee",
  "prepareStackTrace",
]);

/** Thrown when script reaches something the sandbox forbids at runtime. */
export class SandboxError extends Error {
  override name = "SandboxError";
}

const OBJECT_RESTRICTED = new Set([
  "getPrototypeOf",
  "setPrototypeOf",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "defineProperty",
  "defineProperties",
]);

const host = globalThis as unknown as Record<string, unknown>;

/** A frozen copy of a namespace object (`Math`, `JSON`, …): script can't modify the real one. */
function copyNamespace(source: object): object {
  const copy: Record<string, unknown> = Object.create(null);
  for (const name of Object.getOwnPropertyNames(source)) {
    copy[name] = (source as Record<string, unknown>)[name];
  }
  return Object.freeze(copy);
}

/**
 * `Object` without the members that reach prototypes and property descriptors.
 * Callable and constructible like `Object`; `instanceof Object` still works.
 */
function curatedObject(): object {
  const curated = function Object(value?: unknown) {
    return globalThis.Object(value);
  };
  curated.prototype = globalThis.Object.prototype;
  for (const name of globalThis.Object.getOwnPropertyNames(globalThis.Object)) {
    if (name === "length" || name === "name" || name === "prototype" || OBJECT_RESTRICTED.has(name)) continue;
    (curated as unknown as Record<string, unknown>)[name] = (globalThis.Object as unknown as Record<string, unknown>)[name];
  }
  // Object.assign writes properties: same rule as member writes (see scriptRuntime.obj).
  curated.assign = (target: unknown, ...sources: unknown[]) =>
    globalThis.Object.assign(scriptRuntime.obj(target) as object, ...sources);
  return globalThis.Object.freeze(curated);
}

/** Shared by identity: `instanceof` and static methods must work. */
const SHARED_GLOBALS = [
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "structuredClone",
  "Array",
  "String",
  "Number",
  "Boolean",
  "BigInt",
  "Date",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AggregateError",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "Blob",
  "File",
  "ArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
] as const;

function createGlobals(): Readonly<Record<string, unknown>> {
  const globals: Record<string, unknown> = Object.create(null);
  for (const name of SHARED_GLOBALS) globals[name] = host[name];
  globals.Math = copyNamespace(Math);
  globals.JSON = copyNamespace(JSON);
  globals.Intl = copyNamespace(Intl);
  globals.console = copyNamespace(host.console as object);
  globals.Object = curatedObject();
  // `undefined`, `NaN` and `Infinity` are compiled as literals.
  return Object.freeze(globals);
}

/** `$$r`: helpers compiled code calls. */
export const scriptRuntime = Object.freeze({
  /** Checks a computed member key (`a[k]`) once converted; banned names throw. */
  key(key: unknown): string | number | symbol {
    if (typeof key === "number" || typeof key === "symbol") return key;
    const name = String(key);
    if (BANNED_MEMBERS.has(name)) throw new SandboxError(`Member '${name}' is not accessible in pfui script`);
    return name;
  },

  /**
   * The object of a member write (`o.x = v`, `o.n++`, `delete o.x`). Functions
   * are refused: script can reach shared built-in functions, and a property set
   * on one (`hasOwnProperty.call = …`) would run script with whatever arguments
   * host code passes, raw platform objects included.
   */
  obj<T>(object: T): T {
    if (typeof object === "function") throw new SandboxError("Functions cannot be modified in pfui script");
    return object;
  },

  /** A value inside interpolated text (XMLUI extractParam.ts): no `toString`, no text. */
  str(value: unknown): string {
    const toString = (value as { toString?: unknown } | null | undefined)?.toString;
    return typeof toString === "function" ? String(Reflect.apply(toString, value, [])) : "";
  },
});

/** `$$g`: the globals compiled code can read. */
export const scriptGlobals = createGlobals();
