// Step 23: `@{expression}` in Markdown text (XMLUI: components/Markdown/parse-binding-expr.ts).
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";
import { parseMarkdownBindings } from "../../src/script/markdown-bindings";

/** The parts as text: literals as they are, expressions as `«source»`. */
function parts(text: string): string {
  const result = parseMarkdownBindings(text);
  expect(result.diagnostics).toEqual([]);
  return result.parts.map((part) => (part.kind === "literal" ? part.value : `«${text.slice(part.start + 2, part.end - 1).trim()}»`)).join("");
}

describe("splitting Markdown text", () => {
  test.each<[name: string, text: string, expected: string]>([
    ["no binding", "plain *text*", "plain *text*"],
    ["one binding", "Hi @{name}!", "Hi «name»!"],
    ["an object literal inside", "@{ { a: 1 } }", "«{ a: 1 }»"],
    ["several", "@{a} and @{b}", "«a» and «b»"],
    ["an escaped one is literal (the backslash is dropped)", "\\@{a} @{b}", "@{a} «b»"],
    ["an empty one is removed (XMLUI)", "x @{} y @{   } z", "x  y  z"],
    ["inline code keeps it", "`@{a}` @{b}", "`@{a}` «b»"],
    ["a longer code span keeps it", "``x `@{a}` y`` @{b}", "``x `@{a}` y`` «b»"],
    ["a fence keeps it", "```\n@{a}\n```\n@{b}", "```\n@{a}\n```\n«b»"],
    ["an indented tilde fence keeps it", "  ~~~js\n  @{a}\n  ~~~\n@{b}", "  ~~~js\n  @{a}\n  ~~~\n«b»"],
    ["a shorter marker doesn't close a fence", "````\n```\n@{a}\n````\n@{b}", "````\n```\n@{a}\n````\n«b»"],
    ["a lone @ and { are literal", "mail@example.com {x}", "mail@example.com {x}"],
  ])("%s", (_name, text, expected) => {
    expect(parts(text)).toBe(expected);
  });

  test("an unclosed binding is a diagnostic; the text after the next } goes on", () => {
    const result = parseMarkdownBindings("a @{x y} b");
    expect(result.diagnostics.map((d) => d.code)).toContain("S040");
    expect(result.parts.at(-1)).toMatchObject({ kind: "literal", value: " b" });
  });

  test("positions map through the offsets", () => {
    const result = parseMarkdownBindings("ab @{x}", { offset: 100 });
    expect(result.parts[1]).toMatchObject({ kind: "expression", start: 103, end: 107 });
  });
});

describe("compiling a Markdown element", () => {
  const code = (markup: string) => {
    const result = compileModule(markup);
    return { code: result.code, codes: result.diagnostics.map((d) => d.code) };
  };

  test("text without bindings is one string child, as written (no {…} interpolation, whitespace kept)", () => {
    const { code: js, codes } = code("<App><Markdown>\n  # Title {not a binding}\n\n  text\n</Markdown></App>");
    expect(codes).toEqual([]);
    expect(js).toContain('"\\n  # Title {not a binding}\\n\\n  text\\n"');
  });

  test("@{…} becomes a $$parts binding: strings and values in order", () => {
    const { code: js, codes } = code('<App var.n="{2}"><Markdown>a @{n * 2} b</Markdown></App>');
    expect(codes).toEqual([]);
    expect(js).toContain('"$$parts": ($$s) => ["a ", $$s.n * 2, " b"]');
  });

  test("text and CDATA join; entities in text are decoded, CDATA stays raw", () => {
    const { code: js } = code("<App><Markdown>a &amp; <![CDATA[<b>&amp;</b>]]></Markdown></App>");
    expect(js).toContain('"a & <b>&amp;</b>"');
  });

  test("the binding is sandboxed and resolved like any other: an unknown name (C001), a banned global (C002)", () => {
    expect(code("<App><Markdown>@{nope}</Markdown></App>").codes).toEqual(["C001"]);
    expect(code("<App><Markdown>@{window.location}</Markdown></App>").codes).toEqual(["C002"]);
  });

  test('interpolateBindings="false" keeps @{…} as written', () => {
    const { code: js, codes } = code('<App><Markdown interpolateBindings="false">@{nope}</Markdown></App>');
    expect(codes).toEqual([]);
    expect(js).toContain('"@{nope}"');
  });

  test("an element inside is E034 (HTML belongs in CDATA)", () => {
    expect(code("<App><Markdown>a <Text>b</Text></Markdown></App>").codes).toEqual(["E034"]);
  });
});
