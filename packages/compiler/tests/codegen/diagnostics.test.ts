// Code generation diagnostics: each case lists [code, the source text it points at].
// Escape attempts are covered more broadly by the runtime's sandbox tests.
import { describe, expect, test } from "vitest";
import { compileExpression } from "../../src/codegen/compile";
import { parseExpression } from "../../src/script/parse";
import { compile, SCOPE } from "./helpers";

function check(cases: [source: string, expected: [code: string, text: string][]][]) {
  test.each(cases)("%s", (source, expected) => {
    const { diagnostics } = compile(source);
    expect(diagnostics.map((d) => [d.code, source.slice(d.start, d.end)])).toEqual(expected);
    for (const d of diagnostics) expect(d.severity).toBe("error");
  });
}

describe("name resolution", () => {
  check([
    ["missing + 1", [["C001", "missing"]]],
    ["items.map(x => y)", [["C001", "y"]]],
    ["(() => { { let z = 1 } return z })()", [["C001", "z"]]],
    // Scope names are resolved before the banned list: a variable may be called `top`.
    ["top", []],
    ["window.location", [["C002", "window"]]],
    ["eval('1')", [["C002", "eval"]]],
    ["setTimeout(f, 10)", [["C002", "setTimeout"]]],
    ["fetch('/api')", [["C002", "fetch"]]],
    ["globalThis", [["C002", "globalThis"]]],
    ["new Function('return 1')", [["C002", "Function"]]],
    ["$$s", [["C005", "$$s"]]],
    ["$$g.Math", [["C005", "$$g"]]],
    ["(($$x) => $$x)(1)", [["C005", "$$x"]]],
  ]);
});

describe("banned members", () => {
  check([
    ["a.constructor", [["C003", "constructor"]]],
    ["[].constructor.constructor('return this')()", [["C003", "constructor"], ["C003", "constructor"]]],
    ["a['__proto__']", [["C003", "'__proto__'"]]],
    ["a.prototype", [["C003", "prototype"]]],
    ["f.caller", [["C003", "caller"]]],
    ["a.__defineGetter__", [["C003", "__defineGetter__"]]],
    ["({ __proto__: a })", [["C003", "__proto__"]]],
    ["({ '__proto__': a })", [["C003", "'__proto__'"]]],
    ["(({ constructor }) => constructor)(f)", [["C003", "constructor"]]],
    ["(({ prototype: p }) => p)(f)", [["C003", "prototype"]]],
    ["Object.getPrototypeOf(a)", [["C011", "Object.getPrototypeOf"]]],
    ["Object.defineProperty(a, 'x', {})", [["C011", "Object.defineProperty"]]],
    // A computed literal key on a global is not checked statically: the curated
    // object simply doesn't have the member.
    ["Object['getPrototypeOf']", []],
    ["((Object) => Object.getPrototypeOf)(a)", []],
  ]);
});

describe("new", () => {
  check([
    ["new Map()", []],
    ["new Intl.DateTimeFormat()", []],
    ["new f()", [["C004", "f"]]],
    ["new Math.max()", [["C004", "Math.max"]]],
    ["new (f())()", [["C004", "f()"]]],
    ["((Date) => new Date())(f)", [["C004", "Date"]]],
    ["new Missing()", [["C001", "Missing"]]],
    ["new Promise(f)", [["C002", "Promise"]]],
  ]);
});

describe("bindings do not write state", () => {
  check([
    ["count = 1", [["C006", "count"]]],
    ["count++", [["C006", "count"]]],
    ["count += 1", [["C006", "count"]]],
    ["user.name = 'x'", [["C006", "user.name = 'x'"]]],
    ["user.tags[0] = 'x'", [["C006", "user.tags[0] = 'x'"]]],
    ["delete user.name", [["C006", "delete user.name"]]],
    ["[a, b] = [1, 2]", [["C006", "a"], ["C006", "b"]]],
    ["items.forEach(i => { count++ })", [["C006", "count"]]],
    // Locals can be written.
    ["items.reduce((acc, i) => { acc[i.id] = i; acc.n++; return acc }, {})", []],
    ["((x) => { x = 2; let y; y = x; return y })(1)", []],
    // Built-ins cannot be modified.
    ["Math.max = f", [["C010", "Math.max = f"]]],
    ["JSON = 1", [["C010", "JSON"]]],
    ["NaN = 1", [["C010", "NaN"]]],
    ["(() => { let x = {}; delete x })", [["C008", "x"]]],
  ]);
});

describe("other restrictions", () => {
  check([
    ["(() => { var x = 1; return x })()", [["C007", "var x = 1;"]]],
    ["(() => { let x = 1; return x })()", []],
  ]);
});

test("async and await are reported by the compiler too, if a caller ignores the parser's S030", () => {
  for (const [source, text] of [
    ["async () => 1", "async () => 1"],
    ["(() => { await f() })", "await f()"],
  ]) {
    const { expression, diagnostics: parse } = parseExpression(source!);
    expect(parse.map((d) => d.code)).toContain("S030");
    expect(expression).not.toBeNull();
    const { diagnostics } = compileExpression(expression!, { scope: SCOPE });
    expect(diagnostics.map((d) => [d.code, source!.slice(d.start, d.end)])).toEqual([["C009", text]]);
  }
});
