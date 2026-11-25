// Sandbox escape attempts. Runs in jsdom, so `window`, `document` and friends
// really exist: every case must be rejected at compile time or at runtime, and
// nothing may hand back a platform object.
import { afterAll, describe, expect, test } from "vitest";
import { SandboxError, scriptGlobals } from "../../src/script/sandbox";
import { compileWith } from "./helpers";

const scope = {
  a: { x: 1 },
  f: () => 1,
  k: "constructor",
  proto: "__proto__",
  kObj: { toString: () => "constructor" },
  s: "text",
};

const PLATFORM = [globalThis, globalThis.window, globalThis.document, Function, eval];

describe("rejected at compile time", () => {
  test.each<[source: string, codes: string[]]>([
    // Platform globals
    ["window", ["C002"]],
    ["self", ["C002"]],
    ["top", ["C002"]],
    ["parent", ["C002"]],
    ["globalThis", ["C002"]],
    ["document.body", ["C002"]],
    ["location.href", ["C002"]],
    ["navigator.clipboard", ["C002"]],
    ["localStorage.getItem('x')", ["C002"]],
    ["fetch('/api')", ["C002"]],
    ["new XMLHttpRequest()", ["C002"]],
    ["setTimeout(f, 0)", ["C002"]],
    ["queueMicrotask(f)", ["C002"]],
    ["crypto.getRandomValues", ["C002"]],
    ["alert('x')", ["C002"]],
    ["open('https://example.com')", ["C002"]],
    ["arguments", ["C002"]],
    ["Symbol.unscopables", ["C002"]],
    ["Reflect.get(a, 'x')", ["C002"]],
    ["new Proxy({}, {})", ["C002"]],
    ["someHostFunction()", ["C001"]],
    // Code from strings
    ["eval('1')", ["C002"]],
    ["Function('return this')()", ["C002"]],
    ["new Function('return this')", ["C002"]],
    ["WebAssembly.compile", ["C002"]],
    // The constructor chain and prototypes
    ["[].constructor.constructor('return this')()", ["C003", "C003"]],
    ["(() => 1).constructor", ["C003"]],
    ["f.constructor('return this')", ["C003"]],
    ["a['constructor']", ["C003"]],
    ["a.__proto__", ["C003"]],
    ["({}).__proto__.polluted = 1", ["C003"]],
    ["({ __proto__: a })", ["C003"]],
    ["(({ constructor: c }) => c)(f)", ["C003"]],
    ["Array.prototype.map = f", ["C003", "C010"]],
    ["a.__defineGetter__('x', f)", ["C003"]],
    ["a.__lookupGetter__('x')", ["C003"]],
    ["f.caller", ["C003"]],
    ["Object.getPrototypeOf(f)", ["C011"]],
    ["Object.getOwnPropertyDescriptor(a, 'x')", ["C011"]],
    ["Object.defineProperty(a, 'x', { get: f })", ["C011"]],
    ["Object.setPrototypeOf(a, null)", ["C011"]],
    // V8 call sites: getThis() can return window
    ["Error.prepareStackTrace = (e, s) => s", ["C003", "C010"]],
    ["(() => { const E = Error; E.prepareStackTrace = (e, s) => s; return new E().stack })()", ["C003", "C004"]],
    // The generated code's own names
    ["$$g", ["C005"]],
    ["$$r.key", ["C005"]],
    ["$$s", ["C005"]],
    // new
    ["new f()", ["C004"]],
    ["new (() => 1)()", ["C004"]],
    // Modifying built-ins
    ["Math.random = f", ["C010"]],
    // Syntax gfui doesn't have
    ["this", ["S030"]],
    ["(() => this)()", ["S030"]],
    ["import('x')", ["S030"]],
  ])("%s", (source, codes) => {
    const compiled = compileWith(source, scope);
    expect(compiled.diagnostics.map((d) => d.code).sort()).toEqual([...codes].sort());
  });

  test("escaped identifiers are no way around the reserved names", () => {
    expect(compileWith("\\u0024\\u0024g", scope).diagnostics).not.toEqual([]);
  });
});

/** Cases that compile; running them throws a SandboxError. */
const RUNTIME_REJECTED = [
  "a[k]",
  "a[kObj]",
  "a['con' + 'structor']",
  "a[`constructor`]",
  "f[k]",
  "a[proto]",
  "((o, key) => o[key])(f, 'constructor')",
  "(({ [k]: c }) => c)(f)",
  "((o) => { o[proto].polluted = 1 })({})",
  "(() => { const o = {}; o[proto] = { polluted: 1 }; return o })()",
  // Writing to functions: shared built-ins must not be modified.
  "((m) => { m.call = (x) => x })(s.toUpperCase)",
  "(() => { const has = ({}).hasOwnProperty; has.call = (x) => x })()",
  "(() => { const A = Array; A.from = null })()",
  "((g) => { g.x = 1 })(f)",
  "((g) => { delete g.name })(f)",
  "Object.assign(s.toUpperCase, { call: f })",
];

describe("rejected at runtime", () => {
  test.each(RUNTIME_REJECTED)("%s", (source) => {
    const compiled = compileWith(source, scope);
    expect(compiled.diagnostics).toEqual([]);
    expect(() => compiled.run()).toThrow(SandboxError);
  });
});

describe("compiles, but reaches nothing", () => {
  test.each<[source: string, check: (value: unknown) => void]>([
    ["Object['getPrototypeOf']", (v) => expect(v).toBeUndefined()],
    ["Object['defineProperty']", (v) => expect(v).toBeUndefined()],
    ["Object.getOwnPropertyNames(Object)", (v) => expect(v).not.toContain("getPrototypeOf")],
    ["JSON.parse('{\"__proto__\": {\"x\": 1}}').x", (v) => expect(v).toBeUndefined()],
    ["Object.assign({}, JSON.parse('{\"__proto__\": {\"polluted\": 1}}')).polluted", (v) => expect(v).toBe(1)],
  ])("%s", (source, check) => {
    const compiled = compileWith(source, scope);
    expect(compiled.diagnostics).toEqual([]);
    const value = compiled.run();
    check(value);
    expect(PLATFORM).not.toContain(value);
  });
});

describe("the globals object", () => {
  test("is frozen, and so are the namespace copies", () => {
    expect(Object.isFrozen(scriptGlobals)).toBe(true);
    for (const name of ["Math", "JSON", "Intl", "console", "Object"]) {
      expect(Object.isFrozen(scriptGlobals[name])).toBe(true);
    }
  });

  test("writing through an alias fails and leaves the real built-in intact", () => {
    const maxBefore = Math.max;
    const keysBefore = Object.keys;
    // Math is a frozen copy (TypeError); the curated Object is a function (SandboxError).
    expect(() => compileWith("(() => { const M = Math; M.max = null })()", scope).run()).toThrow(TypeError);
    expect(() => compileWith("(() => { const O = Object; O.keys = null })()", scope).run()).toThrow(SandboxError);
    expect(Math.max).toBe(maxBefore);
    expect(Object.keys).toBe(keysBefore);
  });

  test("contains no platform object", () => {
    for (const value of Object.values(scriptGlobals)) expect(PLATFORM).not.toContain(value);
  });
});

afterAll(() => {
  // Nothing above may have polluted shared prototypes.
  expect(Object.prototype).not.toHaveProperty("polluted");
  expect(Object.hasOwn(String.prototype.toUpperCase, "call")).toBe(false);
  expect(Object.hasOwn(Object.prototype.hasOwnProperty, "call")).toBe(false);
  expect(Array.from).toBeTypeOf("function");
});
