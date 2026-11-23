// The shape of generated code: one line per construct, so a reader can see
// exactly what a binding compiles to. Behavior is tested in the runtime package
// (tests/script/semantics.test.ts), where the code actually runs.
import { describe, expect, test } from "vitest";
import { compile } from "./helpers";

function check(cases: [source: string, expected: string][]) {
  test.each(cases)("%s", (source, expected) => {
    const result = compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toBe(`($$s) => ${expected}`);
    // Generated code is always valid JavaScript.
    expect(() => new Function("$$g", "$$r", `"use strict"; return (${result.code});`)).not.toThrow();
  });
}

describe("names", () => {
  check([
    ["count", "$$s.count"],
    ["$item", "$$s.$item"],
    ["Math", "$$g.Math"],
    ["undefined", "undefined"],
    ["NaN", "NaN"],
    ["(x) => x", "(x) => x"],
    ["((Math) => Math)(1)", "((Math) => Math)?.(1)"],
    ["((count) => count)(1)", "((count) => count)?.(1)"],
  ]);
});

describe("optional chaining by default", () => {
  check([
    ["user.address.city", "$$s.user?.address?.city"],
    ["user?.address", "$$s.user?.address"],
    ["items[0]", "$$s.items?.[0]"],
    ["items['x']", "$$s.items?.['x']"],
    ["Math.max(a, b)", "$$g.Math?.max?.($$s.a, $$s.b)"],
    ["user.name.toUpperCase()", "$$s.user?.name?.toUpperCase?.()"],
    ["items.filter(i => i.ok).length", "$$s.items?.filter?.((i) => i?.ok)?.length"],
  ]);
});

describe("sandbox guards", () => {
  check([
    // Calls through the scope or the globals object get `this === undefined`.
    ["f(a)", "(0, $$s.f)?.($$s.a)"],
    ["parseInt(a)", "(0, $$g.parseInt)?.($$s.a)"],
    ["((g) => g(1))(f)", "((g) => g?.(1))?.($$s.f)"],
    // Computed keys are checked at runtime unless they are literals.
    ["user[a]", "$$s.user?.[$$r.key($$s.a)]"],
    ["user[`x`]", "$$s.user?.[$$r.key(`x`)]"],
    // `new` with an allowlisted constructor; the callee is parenthesized.
    ["new Date(a)", "new ($$g.Date)($$s.a)"],
    ["new Date", "new ($$g.Date)()"],
    ["new Intl.NumberFormat('en').format(a)", "new ($$g.Intl?.NumberFormat)('en')?.format?.($$s.a)"],
  ]);
});

describe("precedence and parentheses", () => {
  check([
    ["a + b * c", "$$s.a + $$s.b * $$s.c"],
    ["(a + b) * c", "($$s.a + $$s.b) * $$s.c"],
    ["a - (b - c)", "$$s.a - ($$s.b - $$s.c)"],
    ["a ** b ** c", "$$s.a ** $$s.b ** $$s.c"],
    ["(a ** b) ** c", "($$s.a ** $$s.b) ** $$s.c"],
    ["(-a) ** 2", "(-$$s.a) ** 2"],
    ["- -a", "- -$$s.a"],
    ["-(-a)", "- -$$s.a"],
    ["+ +a", "+ +$$s.a"],
    ["!(a && b)", "!($$s.a && $$s.b)"],
    // pfui accepts `a ?? b || c`; JavaScript needs the parentheses.
    ["a ?? b || c", "$$s.a ?? ($$s.b || $$s.c)"],
    ["(a ?? b) || c", "($$s.a ?? $$s.b) || $$s.c"],
    ["a ? b : c ? 1 : 2", "$$s.a ? $$s.b : $$s.c ? 1 : 2"],
    ["(a ? b : c) ? 1 : 2", "($$s.a ? $$s.b : $$s.c) ? 1 : 2"],
    ["(a, b)", "($$s.a, $$s.b)"],
    ["f((a, b))", "(0, $$s.f)?.(($$s.a, $$s.b))"],
    ["typeof a === 'string'", "typeof $$s.a === 'string'"],
    ["(() => 1)()", "(() => 1)?.()"],
    ["(x => x) || a", "((x) => x) || $$s.a"],
  ]);
});

describe("literals", () => {
  check([
    ["'it\\'s'.length", "'it\\'s'?.length"],
    ["1_000 + 0x1F + 10n", "1_000 + 0x1F + 10n"],
    ["`x ${a} y ${`z${b}`}`", "`x ${$$s.a} y ${`z${$$s.b}`}`"],
    ["/ab+c/gi.test(a)", "/ab+c/gi?.test?.($$s.a)"],
    ["[a, , ...b]", "[$$s.a, , ...$$s.b]"],
    ["[a, ,]", "[$$s.a, , ]"],
    ["{ a: 1 }", "({ a: 1 })"],
    ["{ a, [b]: 2, ...c }", "({ a: $$s.a, [$$s.b]: 2, ...$$s.c })"],
    ["{ get v() { return a }, m(x) { return x } }", "({ get v() { return $$s.a; }, m(x) { return x; } })"],
    ["x => ({ x })", "(x) => ({ x: x })"],
  ]);
});

describe("functions and statements inside a binding", () => {
  check([
    ["items.map(([k, v = 1], i) => k)", "$$s.items?.map?.(([k, v = 1], i) => k)"],
    ["items.reduce((acc, x) => { acc[x.id] = x; return acc }, {})", "$$s.items?.reduce?.((acc, x) => { $$r.obj(acc)[$$r.key(x?.id)] = x; return acc; }, {})"],
    // Member writes go through $$r.obj(), which refuses function objects.
    ["(o => { o.a.b = 1; o.n++; delete o.c; [o.d] = [1] })", "(o) => { $$r.obj(o?.a).b = 1; $$r.obj(o).n++; delete $$r.obj(o)?.c; [$$r.obj(o).d] = [1]; }"],
    ["(x => { if (x) return 1; else return 2 })", "(x) => { if (x) { return 1; } else { return 2; } }"],
    ["(n => { let s = 0; for (let i = 0; i < n; i++) s += i; return s })", "(n) => { let s = 0; for (let i = 0; i < n; i++) { s += i; } return s; }"],
    ["(o => { for (let i = ('x' in o) ? 1 : 0; i < 2; i++) {} })", "(o) => { for (let i = ('x' in o ? 1 : 0); i < 2; i++) {} }"],
    ["(xs => { for (const [k, v] of xs) {} for (const k in xs) {} })", "(xs) => { for (const [k, v] of xs) {} for (const k in xs) {} }"],
    ["(x => { switch (x) { case 1: return 'a'; default: return 'b' } })", "(x) => { switch (x) { case 1: return 'a'; default: return 'b'; } }"],
    ["(() => { try { f() } catch ({ message }) { return message } finally { } })", "() => { try { (0, $$s.f)?.(); } catch ({ message: message }) { return message; } finally {} }"],
    ["(() => { let x; ({ x } = {}); [x] = [1]; return x })", "() => { let x; ({ x: x } = {}); [x] = [1]; return x; }"],
    ["(function fact(n) { return n < 2 ? 1 : n * fact(n - 1) })", "function fact(n) { return n < 2 ? 1 : n * fact?.(n - 1); }"],
    ["(() => { function g() { return h() } function h() { return 1 } return g() })", "() => { function g() { return h?.(); } function h() { return 1; } return g?.(); }"],
  ]);
});
