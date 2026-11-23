// compileInterpolation: XMLUI's rules for interpolated values (extractParam.ts).
// Evaluated results are tested in the runtime package (tests/script/semantics.test.ts).
import { expect, test } from "vitest";
import { compileInterpolation } from "../../src/codegen/compile";
import { parseInterpolation } from "../../src/script/interpolation";
import { SCOPE } from "./helpers";

const compile = (text: string) => compileInterpolation(parseInterpolation(text).segments, { scope: SCOPE });

test.each<[text: string, code: string, dependencies: string[]]>([
  ["{a}", "$$s.a", ["a"]],
  // Whitespace-only literals at either end are dropped: the raw value, not a string.
  ["  {a}\n ", "$$s.a", ["a"]],
  ["{ {x: a} }", "({ x: $$s.a })", ["a"]],
  ["Hi {a}!", '"Hi " + $$r.str($$s.a) + "!"', ["a"]],
  ["{a}{b}", "$$r.str($$s.a) + $$r.str($$s.b)", ["a", "b"]],
  ["{a} {b}", '$$r.str($$s.a) + " " + $$r.str($$s.b)', ["a", "b"]],
  ["{b}, {a}, {b}", '$$r.str($$s.b) + ", " + $$r.str($$s.a) + ", " + $$r.str($$s.b)', ["a", "b"]],
])("%j", (text, code, dependencies) => {
  const result = compile(text);
  expect(result.diagnostics).toEqual([]);
  expect(result.constant).toBe(false);
  expect(result.code).toBe(`($$s) => ${code}`);
  expect(result.dependencies).toEqual(dependencies);
});

test.each<[text: string, value: string]>([
  ["", ""],
  ["plain text", "plain text"],
  ["   ", "   "],
  [" padded ", " padded "],
  ["\\{a}", "{a}"],
  ["trailing {", "trailing {"],
])("constant %j", (text, value) => {
  const result = compile(text);
  expect(result).toEqual({ code: `($$s) => ${JSON.stringify(value)}`, dependencies: [], constant: true, value, diagnostics: [] });
});

test("a segment with a syntax error compiles to undefined (the parser reported it)", () => {
  const parsed = parseInterpolation("x {a +} y");
  expect(parsed.diagnostics).toHaveLength(1);
  expect(compileInterpolation(parsed.segments, { scope: SCOPE }).code).toBe('($$s) => "x " + $$r.str(undefined) + " y"');
});

test("diagnostics from every segment are collected", () => {
  const result = compile("{missing} and {window}");
  expect(result.diagnostics.map((d) => d.code)).toEqual(["C001", "C002"]);
});
