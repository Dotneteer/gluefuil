// Interpolated values: literal text and {expression} segments (XMLUI's AttributeValueParser rules).
import { describe, expect, test } from "vitest";
import { decodeEntitiesWithOffsets } from "../../src/markup/entities";
import { parseMarkup } from "../../src/markup/parser";
import { parseInterpolation } from "../../src/script/interpolation";
import { print } from "./print";

/** Compact segment form: literals as JSON strings, expressions as S-expressions in braces. */
function segmentsOf(text: string): string[] {
  const { segments, diagnostics } = parseInterpolation(text);
  expect(diagnostics).toEqual([]);
  return segments.map((s) => (s.kind === "literal" ? JSON.stringify(s.value) : `{${print(s.expression)}}`));
}

describe("segments", () => {
  test.each([
    ["", []],
    ["plain text", ['"plain text"']],
    ["{x}", ["{x}"]],
    ["Hello {name}!", ['"Hello "', "{name}", '"!"']],
    ["{a}{b}", ["{a}", "{b}"]],
    ["Count: { count + 1 } items", ['"Count: "', "{(+ count 1)}", '" items"']],
    ["{{ a: 1, b: [2] }}", ["{(object (prop a 1) (prop b (array 2)))}"]],
    ["{ {a: 1}.a }", ["{(. (object (prop a 1)) a)}"]],
    ["{ `t ${x}` }", ['{(template "t " x)}']],
    ["{ '}' }", ["{'}'}"]],
    ["{ s.split('{') }", ["{(call (. s split) '{')}"]],
    ["{ x => ({ y: x }) }", ["{(=> (params x) (object (prop y x)))}"]],
    ["{a, b}", ["{(, a b)}"]],
    ["a } b", ['"a } b"']],
    ["{$item.firstName} {$item.lastName}", ["{(. $item firstName)}", '" "', "{(. $item lastName)}"]],
  ])("%j", (text, expected) => {
    expect(segmentsOf(text)).toEqual(expected);
  });
});

describe("escapes (XMLUI rules)", () => {
  test.each([
    ["\\{x}", ['"{x}"']],
    ["a \\{ b", ['"a { b"']],
    ["\\\\{x}", ['"\\\\{x}"']],
    ["path\\to", ['"path\\\\to"']],
    ["ends with \\", ['"ends with \\\\"']],
    ["trailing {", ['"trailing {"']],
  ])("%j", (text, expected) => {
    expect(segmentsOf(text)).toEqual(expected);
  });
});

describe("positions", () => {
  test("segments and expressions carry file offsets via `offset`", () => {
    const file = `<Text value="Hi {user.name}!" />`;
    const valueStart = file.indexOf("Hi");
    const value = "Hi {user.name}!";
    const { segments } = parseInterpolation(value, { offset: valueStart });
    expect(segments.map((s) => file.slice(s.start, s.end))).toEqual(["Hi ", "{user.name}", "!"]);
    const expression = segments[1]!.kind === "expression" ? segments[1]!.expression! : null;
    expect(file.slice(expression!.start, expression!.end)).toBe("user.name");
  });

  test("entity-decoded text content maps back to the raw markup", () => {
    const file = `<Text>{a &lt; b} &amp; {c}</Text>`;
    const element = parseMarkup(file).document.children[0];
    if (element?.kind !== "element") throw new Error("expected element");
    const textNode = element.children[0];
    if (textNode?.kind !== "text") throw new Error("expected text");

    const decoded = decodeEntitiesWithOffsets(textNode.raw, textNode.start);
    expect(decoded.value).toBe("{a < b} & {c}");
    const { segments, diagnostics } = parseInterpolation(decoded.value, { offsets: decoded.offsets });
    expect(diagnostics).toEqual([]);
    expect(segments.map((s) => file.slice(s.start, s.end))).toEqual(["{a &lt; b}", " &amp; ", "{c}"]);
    const comparison = segments[0]!.kind === "expression" ? segments[0]!.expression! : null;
    expect(file.slice(comparison!.start, comparison!.end)).toBe("a &lt; b");
  });
});

describe("errors", () => {
  test.each([
    ["S040 missing closing brace", "Hello {name", [["S040", "{"]]],
    ["S040 two expressions without an operator", "{a b}", [["S040", "{"]]],
    ["S010 empty braces", "{}", [["S010", "}"]]],
    ["syntax error inside the braces", "{a +}", [["S010", "}"]]],
  ])("%s", (_, text, expected) => {
    const { diagnostics } = parseInterpolation(text);
    expect(diagnostics.map((d) => [d.code, text.slice(d.start, d.end)])).toEqual(expected);
  });

  test("text after a broken expression is still segmented", () => {
    const { segments } = parseInterpolation("{a +} and {b}");
    expect(segments.map((s) => s.kind)).toEqual(["expression", "literal", "expression"]);
    expect(segments[0]).toMatchObject({ expression: null });
    expect(segments[2]).toMatchObject({ expression: { type: "Identifier", name: "b" } });
  });
});
