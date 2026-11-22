// Conformance table: invalid markup -> diagnostics (code + the source text
// the diagnostic points at). Zero-width diagnostics are checked by offset.
import { describe, expect, test } from "vitest";
import { parseMarkup } from "../../src/markup/parser";

type Expected = [code: string, at: string];

const cases: [description: string, markup: string, expected: Expected[]][] = [
  ["M001 invalid character in a tag", `<A x="1" , y="2"/>`, [["M001", ","]]],
  ["M001 astral character in a tag", `<A 😀/>`, [["M001", "😀"]]],
  ["M002 unterminated string", `<A x="1/>`, [["M002", `"`], ["M009", ""]]],
  ["M003 unterminated comment", `<A/><!-- never closed`, [["M003", "<!--"]]],
  ["M004 unterminated CDATA", `<![CDATA[ x`, [["M004", "<![CDATA["]]],
  ["M005 unterminated script", `<script> let x;`, [["M005", "<script>"]]],
  ["M006 '<' not followed by a name", `<A>a < b</A>`, [["M006", "<"]]],
  ["M006 closing tag without a name", `<A></ ></A>`, [["M006", "</"]]],
  ["M007 string where an attribute name belongs", `<A "x"/>`, [["M007", `"x"`]]],
  ["M007 '=' without an attribute name", `<A ="x"/>`, [["M007", "="]]],
  ["M008 value missing after '='", `<A x= />`, [["M008", "="]]],
  ["M008 unquoted value", `<A x=1/>`, [["M008", "="], ["M001", "1"]]],
  ["M009 start tag broken by '<'", `<A x="1" <B/>`, [["M009", ""]]],
  ["M009 start tag broken by end of input", `<A x="1"`, [["M009", ""]]],
  ["M009 closing tag without '>'", `<A></A`, [["M009", ""]]],
  ["M010 closing tag does not match", `<A></B>`, [["M010", "</B>"], ["M011", "A"]]],
  ["M011 element never closed", `<A><B/>`, [["M011", "A"]]],
  ["M011 several unclosed elements, innermost first", `<A><B>`, [["M011", "B"], ["M011", "A"]]],
  ["M011 inner element closed implicitly by its parent's closing tag", `<A><B></A>`, [["M011", "B"]]],
  ["M012 closing tag with nothing open", `</A>`, [["M012", "</A>"]]],
  ["M013 duplicate attribute", `<A x="1" x="2"/>`, [["M013", "x"]]],
  ["M013 duplicate namespaced attribute", `<A n:x="1" n:x="2"/>`, [["M013", "n:x"]]],
  ["M014 nothing after an element prefix", `<Ext:/>`, [["M014", "Ext:"]]],
  ["M014 nothing after an attribute prefix", `<A xmlns:="x"/>`, [["M014", "xmlns:"]]],
  ["M015 attribute starts with uppercase", `<A Label="x"/>`, [["M015", "Label"]]],
];

describe("parseMarkup: diagnostics", () => {
  test.each(cases)("%s", (_, markup, expected) => {
    const { diagnostics } = parseMarkup(markup);
    expect(diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)])).toEqual(expected);
    for (const d of diagnostics) {
      expect(d.severity).toBe("error");
      expect(d.message).not.toBe("");
    }
  });
});

describe("zero-width diagnostics point at the right offset", () => {
  test("M009 at the '<' that broke the start tag", () => {
    const markup = `<A x="1" <B/>`;
    const [d] = parseMarkup(markup).diagnostics;
    expect(d!.start).toBe(markup.indexOf("<B"));
  });

  test("M009 at the end of the input", () => {
    const markup = `<A x="1"`;
    expect(parseMarkup(markup).diagnostics[0]!.start).toBe(markup.length);
  });
});

describe("names that are NOT errors", () => {
  test.each([
    ["uppercase after a namespace prefix", `<A xmlns:Ext="component-ns:Ext"/>`],
    ["same local name with different prefixes", `<A a:x="1" b:x="2"/>`],
    ["same attribute on different elements", `<A x="1"><B x="2"/></A>`],
  ])("%s", (_, markup) => {
    expect(parseMarkup(markup).diagnostics).toEqual([]);
  });
});

test("messages name the offending construct", () => {
  const messages = parseMarkup(`<A x="1" x="2"></B>`).diagnostics.map((d) => d.message);
  expect(messages).toContain("Duplicate attribute 'x'");
  expect(messages).toContain("Closing tag </B> does not match the open element <A>");
});
