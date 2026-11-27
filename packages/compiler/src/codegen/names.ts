// Name tables of the gfui script sandbox (compile-time side).
//
// The runtime (`@gluefuil/runtime`, src/script/sandbox.ts) builds the actual
// objects. `tools/sandbox-drift.test.ts` checks that both sides agree.
// Design: .ai/plan/poc-03-codegen.md

/** Globals gfui script can read. Every other free name must come from the scope. */
export const ALLOWED_GLOBALS: ReadonlySet<string> = new Set([
  // Values
  "undefined",
  "NaN",
  "Infinity",
  // Functions
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "structuredClone",
  // Namespaces
  "Math",
  "JSON",
  "Intl",
  "console",
  // Constructors and their static members
  "Object",
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
]);

/** Globals that are compiled as literals rather than read from the globals object. */
export const LITERAL_GLOBALS: ReadonlyMap<string, string> = new Map([
  ["undefined", "undefined"],
  ["NaN", "NaN"],
  ["Infinity", "Infinity"],
]);

/**
 * Static callee paths allowed with `new`: XMLUI's list (eval-tree-common.ts,
 * allowedNewConstructors) without DOMException (not a gfui global), plus the
 * Intl formatters.
 */
export const CONSTRUCTIBLE: ReadonlySet<string> = new Set([
  "String",
  "Number",
  "Boolean",
  "Date",
  "RegExp",
  "Array",
  "Object",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
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
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "Blob",
  "File",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AggregateError",
  "Intl.Collator",
  "Intl.DateTimeFormat",
  "Intl.DisplayNames",
  "Intl.ListFormat",
  "Intl.Locale",
  "Intl.NumberFormat",
  "Intl.PluralRules",
  "Intl.RelativeTimeFormat",
  "Intl.Segmenter",
]);

/**
 * Well-known platform globals, with the gfui replacement where one exists.
 * They are not reachable anyway (unknown names are compile errors); this table
 * only gives a better message.
 */
export const BANNED_GLOBALS: ReadonlyMap<string, string | undefined> = new Map<string, string | undefined>([
  ["window", "use gfui components and the navigation API"],
  ["self", undefined],
  ["top", undefined],
  ["parent", undefined],
  ["frames", undefined],
  ["globalThis", undefined],
  ["document", "use gfui components"],
  ["navigator", undefined],
  ["location", "use navigate()"],
  ["history", "use navigate()"],
  ["eval", "dynamic code execution is not allowed"],
  ["Function", "dynamic code execution is not allowed"],
  ["WebAssembly", "dynamic code execution is not allowed"],
  ["Reflect", undefined],
  ["Proxy", undefined],
  ["fetch", "use DataSource or APICall"],
  ["XMLHttpRequest", "use DataSource or APICall"],
  ["WebSocket", undefined],
  ["EventSource", undefined],
  ["setTimeout", "use delay()"],
  ["setInterval", undefined],
  ["setImmediate", undefined],
  ["clearTimeout", undefined],
  ["clearInterval", undefined],
  ["requestAnimationFrame", undefined],
  ["cancelAnimationFrame", undefined],
  ["requestIdleCallback", undefined],
  ["queueMicrotask", undefined],
  ["localStorage", undefined],
  ["sessionStorage", undefined],
  ["indexedDB", undefined],
  ["caches", undefined],
  ["cookieStore", undefined],
  ["crypto", undefined],
  ["performance", undefined],
  ["Worker", undefined],
  ["SharedWorker", undefined],
  ["MessageChannel", undefined],
  ["BroadcastChannel", undefined],
  ["MutationObserver", undefined],
  ["ResizeObserver", undefined],
  ["IntersectionObserver", undefined],
  ["Notification", undefined],
  ["alert", "use toast() or a dialog"],
  ["prompt", undefined],
  ["open", "use navigate()"],
  ["Promise", "not available in bindings"],
  ["Symbol", undefined],
  ["arguments", undefined],
]);

/**
 * Member names that lead to code execution or prototype tampering:
 * `[].constructor.constructor` is `Function`; `Error.prepareStackTrace`
 * exposes V8 call sites (`getThis()` can return `window`).
 * Checked at compile time for static keys and by `$$r.key()` at runtime.
 */
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

/** Static members left out of the curated `Object` global. */
export const RESTRICTED_GLOBAL_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    "Object",
    new Set([
      "getPrototypeOf",
      "setPrototypeOf",
      "getOwnPropertyDescriptor",
      "getOwnPropertyDescriptors",
      "defineProperty",
      "defineProperties",
    ]),
  ],
]);

/** Names starting with this prefix are reserved for generated code. */
export const RESERVED_PREFIX = "$$";

/**
 * App globals: scope names every binding and handler sees (XMLUI globals.md),
 * readable but not writable. The runtime's copy is APP_GLOBAL_NAMES
 * (runtime src/render/app-global-names.ts); tools/sandbox-drift.test.ts
 * keeps them in sync.
 */
export const APP_GLOBALS: readonly string[] = ["delay", "activeThemeId", "activeThemeTone", "setTheme", "setThemeTone", "toggleThemeTone", "navigate", "$pathname", "$queryParams", "$routeParams", "navPanelCollapsed", "setNavPanelCollapsed", "navDrawerOpen", "setNavDrawerOpen", "toast", "confirm", "Actions"];
