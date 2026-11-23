// Semantic conformance table: a binding plus a scope gives the expected value.
// Compiled by the real compiler, run through the real sandbox (loadBinding).
import { describe, expect, test } from "vitest";
import { BindingError } from "../../src/script/load";
import { evaluate, evaluateText } from "./helpers";

const scope = {
  a: 3,
  b: 5,
  s: "ab",
  user: { name: "Ada", address: null as null | { city: string }, tags: ["x", "y"] },
  items: [
    { id: 1, price: 10 },
    { id: 2, price: 30 },
  ],
  minPrice: 20,
  nothing: null,
  missing: undefined,
  f: (x: number) => x * 2,
  thisOf: function (this: unknown) {
    return this;
  },
  $item: { name: "row" },
};

function check(cases: [source: string, expected: unknown][]) {
  test.each(cases)("%s", (source, expected) => {
    expect(evaluate(source, scope)).toEqual(expected);
  });
}

describe("operators and literals", () => {
  check([
    ["a + b * 2", 13],
    ["(a + b) * 2", 16],
    ["2 ** 3 ** 2", 512],
    ["b % a", 2],
    ["-a", -3],
    ["a > b ? 'big' : 'small'", "small"],
    ["nothing ?? 'default'", "default"],
    ["0 || 'fallback'", "fallback"],
    ["a && b", 5],
    ["typeof s", "string"],
    ["typeof missing", "undefined"],
    ["'name' in user", true],
    ["[1, 2] instanceof Array", true],
    ["a == '3'", true],
    ["a === '3'", false],
    ["a & 1 | 4", 5],
    ["1 << 4 >> 2", 4],
    ["~a", -4],
    ["!a", false],
    ["`${s}-${a + 1}`", "ab-4"],
    ["10n * 2n", 20n],
    ["1_000", 1000],
    ["0x1F + 0b11 + 0o7", 41],
    ["[1, , 3].length", 3],
    ["[...user.tags, 'z']", ["x", "y", "z"]],
    ["{ ...{ x: 1 }, y: a, [s]: 2 }", { x: 1, y: 3, ab: 2 }],
    ["(a, b)", 5],
  ]);
});

describe("optional chaining by default", () => {
  check([
    ["user.name", "Ada"],
    ["user.address.city", undefined],
    ["user.address.city ?? 'Unknown'", "Unknown"],
    ["nothing.a.b.c", undefined],
    ["missing[0]", undefined],
    ["items[5].price", undefined],
    ["missing()", undefined],
    ["user.nope()", undefined],
    ["nothing.method(f(1))", undefined],
    ["user.name.toUpperCase()", "ADA"],
  ]);
});

describe("calls", () => {
  check([
    ["f(a)", 6],
    ["s.toUpperCase()", "AB"],
    ["user.tags.join('+')", "x+y"],
    ["f(...[4])", 8],
    // A scope function is called without the scope as `this`.
    ["thisOf()", undefined],
    ["((x) => x + 1)(1)", 2],
  ]);
});

describe("callbacks and functions inside bindings", () => {
  check([
    ["items.filter(i => i.price > minPrice).map(i => i.id)", [2]],
    ["items.map(({ id, price: p = 0 }) => id + p)", [11, 32]],
    ["items.reduce((sum, i) => sum + i.price, 0)", 40],
    ["items.reduce((acc, i) => { acc[i.id] = i.price; return acc }, {})", { 1: 10, 2: 30 }],
    ["items.map(function (i) { return i.id * 10 })", [10, 20]],
    ["((n) => { let s = 0; for (let i = 1; i <= n; i++) s += i; return s })(4)", 10],
    ["((xs) => { const out = []; for (const x of xs) { if (x === 2) continue; out.push(x) } return out })([1, 2, 3])", [1, 3]],
    ["((o) => { const keys = []; for (const k in o) keys.push(k); return keys })({ p: 1, q: 2 })", ["p", "q"]],
    ["((n) => { let i = 0; while (true) { if (++i >= n) break } return i })(3)", 3],
    ["((n) => { let i = 0; do { i++ } while (i < n); return i })(2)", 2],
    ["((x) => { switch (x) { case 1: return 'one'; case 2: case 3: return 'few'; default: return 'many' } })(3)", "few"],
    ["(() => { try { throw new Error('boom') } catch (e) { return e.message } })()", "boom"],
    ["(() => { try { return 1 } finally { } })()", 1],
    ["(() => { try { null.x } catch { return 'caught' } })()", undefined],
    ["((o) => { delete o.a; return o })({ a: 1, b: 2 })", { b: 2 }],
    ["(function fact(n) { return n < 2 ? 1 : n * fact(n - 1) })(5)", 120],
    ["(() => { function g() { return h() } function h() { return 'hoisted' } return g() })()", "hoisted"],
    ["(() => { let x; [x] = [7]; ({ y: x } = { y: x + 1 }); return x })()", 8],
    ["({ get v() { return a * 2 }, m(x) { return x + 1 } }).v", 6],
    ["((x, y = x + 1, ...rest) => [x, y, rest])(1)", [1, 2, []]],
    ["((f) => f(2))(x => x * x)", 4],
  ]);
});

describe("locals shadow scope names and globals", () => {
  check([
    ["((a) => a)(99)", 99],
    ["((Math) => Math)(7)", 7],
    ["items.map(items => items.id)", [1, 2]],
  ]);
});

describe("globals", () => {
  check([
    ["Math.max(a, b)", 5],
    ["Math.round(2.5)", 3],
    ["JSON.stringify({ a })", '{"a":3}'],
    ["JSON.parse('[1]')", [1]],
    ["parseInt('42px')", 42],
    ["Number.isInteger(a)", true],
    ["Array.isArray(items)", true],
    ["Array.from({ length: 3 }, (_, i) => i)", [0, 1, 2]],
    ["Object.keys({ x: 1, y: 2 })", ["x", "y"]],
    ["Object.entries({ x: 1 })", [["x", 1]]],
    ["Object.assign({}, { x: 1 })", { x: 1 }],
    ["Object.fromEntries([['k', 1]])", { k: 1 }],
    ["({}) instanceof Object", true],
    ["new Object()", {}],
    ["String(a)", "3"],
    ["new Date(0).getTime()", 0],
    ["new Map([[1, 'one']]).get(1)", "one"],
    ["new Set([1, 1, 2]).size", 2],
    ["new Intl.NumberFormat('en-US').format(1234.5)", "1,234.5"],
    ["new URLSearchParams('a=1').get('a')", "1"],
    ["new Error('m').message", "m"],
    ["encodeURIComponent('a b')", "a%20b"],
    ["isNaN(NaN)", true],
    ["Infinity > 1e308", true],
    ["undefined", undefined],
  ]);
});

test("regex literals: a fresh object per evaluation (no lastIndex carried over)", () => {
  // XMLUI had this bug: one RegExp per AST node, so `g` patterns kept lastIndex.
  expect(evaluate("/a/g.test(s)", scope)).toBe(true);
  expect(evaluate("/a/g.test(s)", scope)).toBe(true);
  expect(evaluate("s.replace(/b/g, 'c')", scope)).toBe("ac");
});

test("evaluating a binding twice gives the same result; scope values are read live", () => {
  const live = { n: 1 };
  expect(evaluate("n * 10", live)).toBe(10);
  live.n = 2;
  expect(evaluate("n * 10", live)).toBe(20);
});

describe("interpolated values (XMLUI extractParam rules)", () => {
  test.each<[text: string, expected: unknown]>([
    ["{a}", 3],
    [" {a} ", 3],
    ["{items}", scope.items],
    ["{ {x: a} }", { x: 3 }],
    ["Hello {user.name}!", "Hello Ada!"],
    ["{a}{b}", "35"],
    ["{a} + {b} = {a + b}", "3 + 5 = 8"],
    ["[{nothing}]", "[]"],
    ["[{missing}]", "[]"],
    ["[{user.address.city}]", "[]"],
    ["[{0}] [{false}]", "[0] [false]"],
    ["[{user.tags}]", "[x,y]"],
    ["[{ {} }]", "[[object Object]]"],
    ["plain", "plain"],
    ["\\{a}", "{a}"],
  ])("%j", (text, expected) => {
    expect(evaluateText(text, scope)).toEqual(expected);
  });
});

describe("bindings are synchronous", () => {
  test("a promise result throws a BindingError", () => {
    const later = () => Promise.resolve(1);
    expect(() => evaluate("later()", { later })).toThrow(BindingError);
  });

  test("any thenable counts", () => {
    expect(() => evaluate("{ then() {} }")).toThrow(BindingError);
  });

  test("a promise inside the result is not detected (only the result is checked)", () => {
    const later = () => Promise.resolve(1);
    expect(evaluate("[later()]", { later })).toEqual([expect.any(Promise)]);
  });
});

test("runtime errors propagate as ordinary exceptions", () => {
  expect(() => evaluate("(() => { throw new RangeError('r') })()")).toThrow(RangeError);
  // Writing through a missing object still throws: only reads are optional.
  expect(() => evaluate("((o) => { o.a.b = 1 })({})")).toThrow(TypeError);
});
