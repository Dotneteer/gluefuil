// After an error the parser must still produce a useful tree, so later
// stages (and the editor) can keep working.
import { describe, expect, test } from "vitest";
import { parseMarkup } from "../../src/markup/parser";
import { summarize, type Summary } from "./helpers";

const cases: [description: string, markup: string, expected: Summary[]][] = [
  ["a stray '<' in text becomes text", `<A>a < b</A>`, [["A", {}, "a ", "<", " b"]]],
  ["an unclosed inner element is closed by its parent's closing tag", `<A><B><C/></A><D/>`, [["A", {}, ["B", {}, ["C", {}]]], ["D", {}]]],
  ["an unmatched closing tag is ignored", `<A><B/></X><C/></A>`, [["A", {}, ["B", {}], ["C", {}]]]],
  ["a closing tag with nothing open is ignored", `</X><A/>`, [["A", {}]]],
  ["a start tag broken by '<' gets no children; the next tag is a sibling", `<P><A x="1" <B/></P>`, [["P", {}, ["A", { x: "1" }], ["B", {}]]]],
  ["invalid characters inside a tag are skipped", `<A x="1" ,, y="2"/>`, [["A", { x: "1", y: "2" }]]],
  ["a duplicate attribute is still recorded", `<A x="1" x="2"/>`, [["A", { x: "2" }]]],
  ["parsing continues after a missing value", `<A x= y="2"/>`, [["A", { x: true, y: "2" }]]],
  ["elements open at the end are kept", `<A><B>text`, [["A", {}, ["B", {}, "text"]]]],
];

describe("parseMarkup: error recovery", () => {
  test.each(cases)("%s", (_, markup, expected) => {
    const { document, diagnostics } = parseMarkup(markup);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(summarize(document)).toEqual(expected);
  });
});

test("unclosed elements end where they were implicitly closed", () => {
  const markup = `<A><B>x</A>`;
  const a = parseMarkup(markup).document.children[0];
  if (a?.kind !== "element") throw new Error("expected element");
  const b = a.children[0];
  if (b?.kind !== "element") throw new Error("expected element");
  expect(markup.slice(b.start, b.end)).toBe("<B>x");
  expect(b.closeTag).toBeUndefined();
  expect(markup.slice(a.start, a.end)).toBe(markup);
});

test("an element open at the end of input extends to the end", () => {
  const markup = `<A><B/>`;
  const a = parseMarkup(markup).document.children[0];
  expect(a).toMatchObject({ start: 0, end: markup.length });
});

test("the parser never throws, whatever the input", () => {
  const nasty = [`<`, `</`, `<<<>>>`, `<A x=`, `<A x="`, `<!--`, `<![CDATA[`, `<script>`, `&`, `<A:`, `<A b:`, `"'\``, `/>`, `<A/><`];
  for (const markup of nasty) {
    expect(() => parseMarkup(markup)).not.toThrow();
  }
});
