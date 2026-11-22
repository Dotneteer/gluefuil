// Conformance table: valid markup -> tree shape, with no diagnostics.
import { describe, expect, test } from "vitest";
import { parseMarkup } from "../../src/markup/parser";
import { summarize, type Summary } from "./helpers";

const cases: [description: string, markup: string, expected: Summary[]][] = [
  // --- Elements
  ["self-closing element", `<App/>`, [["App", {}]]],
  ["self-closing with whitespace", `<App  />`, [["App", {}]]],
  ["empty element", `<App></App>`, [["App", {}]]],
  ["nested elements", `<App><Card><Text/></Card></App>`, [["App", {}, ["Card", {}, ["Text", {}]]]]],
  ["siblings", `<App><A/><B/><C/></App>`, [["App", {}, ["A", {}], ["B", {}], ["C", {}]]]],
  ["multiple top-level elements (single-root is a later, semantic rule)", `<Component name="A"/><App/>`, [["Component", { name: "A" }], ["App", {}]]],
  ["whitespace before '>' of a closing tag", `<App></App  >`, [["App", {}]]],
  ["lowercase helper tag", `<App><variable name="x" value="1"/></App>`, [["App", {}, ["variable", { name: "x", value: "1" }]]]],

  // --- Names
  ["namespaced element", `<Ext:Gauge/>`, [["Ext:Gauge", {}]]],
  ["names with digits, '_', '$'", `<H1 a_b="1" $x="2" b2="3"/>`, [["H1", { a_b: "1", $x: "2", b2: "3" }]]],
  ["dotted attribute name (var.)", `<App var.count="{0}"/>`, [["App", { "var.count": "{0}" }]]],
  ["dashed attribute name (responsive)", `<Text when-md="{true}" width-sm="100px"/>`, [["Text", { "when-md": "{true}", "width-sm": "100px" }]]],
  ["namespaced attribute", `<App xmlns:Ext="component-ns:Ext"/>`, [["App", { "xmlns:Ext": "component-ns:Ext" }]]],
  ["method. attribute", `<Component name="C" method.reset="count = 0"/>`, [["Component", { name: "C", "method.reset": "count = 0" }]]],

  // --- Attribute values
  ["double-quoted value", `<A x="1"/>`, [["A", { x: "1" }]]],
  ["single-quoted value", `<A x='1'/>`, [["A", { x: "1" }]]],
  ["backtick-quoted value", "<A x=`1`/>", [["A", { x: "1" }]]],
  ["other quotes inside a value", `<A x='say "hi"' y="it's" z=\`'"\`/>`, [["A", { x: 'say "hi"', y: "it's", z: `'"` }]]],
  ["empty value", `<A x=""/>`, [["A", { x: "" }]]],
  ["whitespace around '='", `<A x = "1"/>`, [["A", { x: "1" }]]],
  ["valueless attribute", `<Component receivesContextVars name="C"/>`, [["Component", { receivesContextVars: true, name: "C" }]]],
  ["valueless attribute last", `<A flag/>`, [["A", { flag: true }]]],
  ["multi-line value", `<A x="line1\nline2"/>`, [["A", { x: "line1\nline2" }]]],
  ["'<' and '>' inside a value", `<A when="{a < b && c > d}"/>`, [["A", { when: "{a < b && c > d}" }]]],
  ["entities are decoded in values (as XMLUI's transform does)", `<A when="{a &amp;&amp; b &lt; c}"/>`, [["A", { when: "{a && b < c}" }]]],
  ["object literal value", `<Form data='{{ a: "x", b: [1, 2] }}'/>`, [["Form", { data: '{{ a: "x", b: [1, 2] }}' }]]],
  ["attributes separated by newlines", `<A\n  x="1"\n  y="2"\n/>`, [["A", { x: "1", y: "2" }]]],

  // --- Text content
  ["text", `<Text>Hello</Text>`, [["Text", {}, "Hello"]]],
  ["text with an expression", `<Text>Hello {name}!</Text>`, [["Text", {}, "Hello {name}!"]]],
  ["text is kept verbatim (no whitespace collapsing)", `<Text>  a\n  b  </Text>`, [["Text", {}, "  a\n  b  "]]],
  ["entities are decoded in text", `<T>a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;&nbsp;g</T>`, [["T", {}, `a & b < c > d "e" 'f' g`]]],
  ["unknown entities are kept literally", `<T>&copy; &amp</T>`, [["T", {}, "&copy; &amp"]]],
  ["'>' in text", `<T>a > b</T>`, [["T", {}, "a > b"]]],
  ["mixed text and elements", `<T>a<B/>b</T>`, [["T", {}, "a", ["B", {}], "b"]]],
  ["text at top level", `hello <App/>`, ["hello ", ["App", {}]]],

  // --- Raw sections
  ["comment", `<App><!-- note --></App>`, [["App", {}, { comment: " note " }]]],
  ["comment containing markup", `<!-- <A x="1"/> -->`, [{ comment: ` <A x="1"/> ` }]],
  ["comment inside a start tag (found in XMLUI docs)", `<App\n  <!-- note -->\n  var.x="{1}">\n</App>`, [["App", { "var.x": "{1}" }]]],
  ["CDATA", `<Markdown><![CDATA[# Title <b>x</b>]]></Markdown>`, [["Markdown", {}, { cdata: "# Title <b>x</b>" }]]],
  ["script", `<App><script>var x = a < b;</script></App>`, [["App", {}, { script: "var x = a < b;" }]]],
  ["script content with tags", `<script>const s = "<A/>";</script>`, [{ script: `const s = "<A/>";` }]],

  // --- Realistic app markup
  [
    "user-defined component with slot and method",
    `<Component name="Counter" method.reset="count = 0">
  <variable name="count" value="{0}" />
  <Button label="Increment" onClick="count++" />
  <Slot name="footerTemplate" item="{$item}" />
</Component>`,
    [
      [
        "Component",
        { name: "Counter", "method.reset": "count = 0" },
        ["variable", { name: "count", value: "{0}" }],
        ["Button", { label: "Increment", onClick: "count++" }],
        ["Slot", { name: "footerTemplate", item: "{$item}" }],
      ],
    ],
  ],
  [
    "event helper tag with statement content",
    `<Button><event name="click">{ count++ }</event></Button>`,
    [["Button", {}, ["event", { name: "click" }, "{ count++ }"]]],
  ],
];

describe("parseMarkup: valid markup", () => {
  test.each(cases)("%s", (_, markup, expected) => {
    const { document, diagnostics } = parseMarkup(markup);
    expect(diagnostics).toEqual([]);
    expect(summarize(document)).toEqual(expected);
  });
});

describe("parseMarkup: whitespace text nodes", () => {
  test("whitespace between elements is kept as text nodes", () => {
    const { document } = parseMarkup(`<App>\n  <A/>\n</App>`);
    expect(summarize(document, true)).toEqual([["App", {}, "\n  ", ["A", {}], "\n"]]);
  });

  test("text keeps both decoded value and raw source", () => {
    const { document } = parseMarkup(`<T>a &amp; b</T>`);
    const element = document.children[0];
    if (element?.kind !== "element") throw new Error("expected element");
    expect(element.children[0]).toMatchObject({ kind: "text", value: "a & b", raw: "a &amp; b" });
  });
});

describe("parseMarkup: node details", () => {
  test("element flags and names", () => {
    const { document } = parseMarkup(`<Ext:Gauge/><App></App>`);
    expect(document.children[0]).toMatchObject({
      kind: "element",
      selfClosing: true,
      name: { prefix: "Ext", local: "Gauge", full: "Ext:Gauge" },
    });
    expect(document.children[0]).not.toHaveProperty("closeTag");
    expect(document.children[1]).toMatchObject({ selfClosing: false, name: { local: "App", full: "App" } });
    expect(document.children[1]).toHaveProperty("closeTag");
  });

  test("comments inside a start tag are kept on the element, not as children", () => {
    const markup = `<A <!-- one --> x="1" <!-- two -->/>`;
    const element = parseMarkup(markup).document.children[0];
    if (element?.kind !== "element") throw new Error("expected element");
    expect(element.children).toEqual([]);
    expect(element.tagComments?.map((c) => [c.value, markup.slice(c.start, c.end)])).toEqual([
      [" one ", "<!-- one -->"],
      [" two ", "<!-- two -->"],
    ]);
  });

  test("attribute value keeps both the decoded value and the raw text", () => {
    const { document } = parseMarkup(`<A x="a &amp; b"/>`);
    const element = document.children[0];
    if (element?.kind !== "element") throw new Error("expected element");
    expect(element.attributes[0]!.value).toMatchObject({ value: "a & b", raw: "a &amp; b" });
  });

  test("attribute value records its quote", () => {
    const { document } = parseMarkup(`<A x="1" y='2' z=\`3\`/>`);
    const element = document.children[0];
    if (element?.kind !== "element") throw new Error("expected element");
    expect(element.attributes.map((a) => a.value?.quote)).toEqual(['"', "'", "`"]);
  });

  test("empty input gives an empty document", () => {
    expect(parseMarkup("")).toEqual({
      document: { kind: "document", children: [], start: 0, end: 0 },
      diagnostics: [],
    });
  });

  test("deep nesting does not overflow the stack", () => {
    const depth = 20_000;
    const markup = "<A>".repeat(depth) + "</A>".repeat(depth);
    const { diagnostics, document } = parseMarkup(markup);
    expect(diagnostics).toEqual([]);
    let node = document.children[0];
    let levels = 0;
    while (node?.kind === "element") {
      levels++;
      node = node.children[0];
    }
    expect(levels).toBe(depth);
  });
});
