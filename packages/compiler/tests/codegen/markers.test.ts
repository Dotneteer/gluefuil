// Source markers: insertion, extraction, and safety against user text.
import { describe, expect, test } from "vitest";
import { compileExpression } from "../../src/codegen/compile";
import { bare, escapeMarkerChars, extractMarkers, jsString, mark } from "../../src/codegen/markers";
import { parseExpression } from "../../src/script/parse";

describe("markers", () => {
  test("extract returns clean code and [generated, original] pairs", () => {
    const text = `a ${mark(10, "b")} + ${mark(42, "c")}`;
    expect(extractMarkers(text)).toEqual({ code: "a b + c", pairs: [[2, 10], [6, 42]] });
  });

  test("nested markers at the same generated position: the innermost wins", () => {
    expect(extractMarkers(mark(1, mark(7, "x"))).pairs).toEqual([[0, 7]]);
  });

  test("bare strips every marker", () => {
    expect(bare(mark(5, `(${mark(6, "a")} + ${mark(9, "b")})`))).toBe("(a + b)");
  });

  test("the marker characters in user text are escaped", () => {
    expect(escapeMarkerChars("'\uE000\uE001'")).toBe("'\\uE000\\uE001'");
    expect(jsString("\uE000x")).toBe('"\\uE000x"');
  });
});

describe("user text containing the marker characters cannot be confused with a marker", () => {
  test.each<[source: string]>([
    ["'\uE000a1\uE001'"],
    ["`\uE000${1}\uE001`"],
    // (A regex keeps its behavior; its `.source` shows the escape.)
    ["/\uE000/.test(\'\uE000\')"],
  ])("%j compiles to code that evaluates to the same value", (source) => {
    const { expression } = parseExpression(source);
    const result = compileExpression(expression!, { scope: new Set() });
    expect(result.code).not.toMatch(/[\uE000\uE001]/);
    const compiled = new Function("$$g", "$$r", `"use strict"; return (${result.code});`)({}, {})({});
    const native = new Function(`"use strict"; return (${source});`)();
    expect(compiled).toBe(native);
  });
});
