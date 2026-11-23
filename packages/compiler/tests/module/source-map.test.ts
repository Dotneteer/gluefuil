// compileModule source maps: every construct maps back to its place in the
// .pfui file. Each case names a token in the generated code and the text it
// must map to in the markup.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";
import { LineMap } from "../../src/source/line-map";
import { originalPositionFor } from "../../src/source/source-map";

/** Where `generatedNeedle` (n-th occurrence) maps to, as the markup text starting there. */
function mapsTo(markup: string, generatedNeedle: string, occurrence = 0): string {
  const { code, map, diagnostics } = compileModule(markup, { fileName: "App.pfui" });
  expect(diagnostics).toEqual([]);
  let offset = -1;
  for (let i = 0; i <= occurrence; i++) offset = code.indexOf(generatedNeedle, offset + 1);
  expect(offset, `"${generatedNeedle}" in generated code`).toBeGreaterThanOrEqual(0);
  const position = new LineMap(code).positionAt(offset);
  const original = originalPositionFor(map!, position.line, position.column);
  expect(original).toBeDefined();
  return markup.slice(new LineMap(markup).offsetAt({ line: original!.line, column: original!.column }));
}

describe("bindings", () => {
  test("an identifier in an attribute binding", () => {
    const markup = '<App var.count="{0}">\n  <Text value="{count * 2}"/>\n</App>';
    expect(mapsTo(markup, "$$s.count * 2")).toMatch(/^count \* 2/);
  });

  test("each part of an expression maps to its own position", () => {
    const markup = '<App var.a="{1}" var.b="{2}"><Text value="{a + Math.max(b, 3)}"/></App>';
    expect(mapsTo(markup, "$$g.Math")).toMatch(/^Math\.max\(b, 3\)/);
    expect(mapsTo(markup, "$$s.b,")).toMatch(/^b, 3\)/);
  });

  test("positions survive entity decoding", () => {
    const markup = '<App var.a="{true}"><Text value="{a &amp;&amp; target}"/></App>'.replace("target", "!a");
    expect(mapsTo(markup, "!$$s.a")).toMatch(/^!a/);
  });

  test("a binding in text content", () => {
    const markup = "<App var.name=\"x\">\n  <Text>\n    Hello, {name.toUpperCase()}!\n  </Text>\n</App>";
    expect(mapsTo(markup, "$$s.name?.toUpperCase")).toMatch(/^name\.toUpperCase\(\)/);
  });

  test("a variable initializer", () => {
    const markup = '<App var.items="{[1, 2].map(x => x * 10)}"/>';
    expect(mapsTo(markup, "x * 10")).toMatch(/^x \* 10/);
  });
});

describe("handlers", () => {
  test("every statement of a multi-line handler maps to its line", () => {
    const markup = [
      '<App var.n="{0}">',
      "  <Button",
      '    onClick="',
      "      n++;",
      "      n += 2;",
      "      throw new Error('boom');",
      '    "/>',
      "</App>",
    ].join("\n");
    expect(mapsTo(markup, "$$s.n++")).toMatch(/^n\+\+;/);
    expect(mapsTo(markup, "$$s.n += 2")).toMatch(/^n \+= 2;/);
    expect(mapsTo(markup, "throw new")).toMatch(/^throw new Error\('boom'\);/);
  });

  test("a call wrapped in an implicit await maps to the call", () => {
    const markup = '<App var.n="{0}"><Button onClick="n = 1; delay(5)"/></App>';
    expect(mapsTo(markup, "(0, $$s.delay)")).toMatch(/^delay\(5\)/);
  });

  test("a callback inside a handler", () => {
    const markup = '<App var.items="{[]}"><Button onClick="items.forEach(item => item.done)"/></App>';
    expect(mapsTo(markup, "item?.done")).toMatch(/^item\.done/);
  });

  test("<event> content and CDATA", () => {
    const markup = '<App var.n="{0}"><Button><event name="click">\n  n = 41 + 1;\n</event></Button></App>';
    expect(mapsTo(markup, "$$s.n = 41")).toMatch(/^n = 41 \+ 1;/);
    const cdata = '<App var.ok="{0}"><Button><event name="click"><![CDATA[ok = 1 < 2]]></event></Button></App>';
    expect(mapsTo(cdata, "$$s.ok = 1 < 2")).toMatch(/^ok = 1 < 2/);
  });
});

describe("elements", () => {
  test("each element's creation maps to its tag", () => {
    const markup = "<App>\n  <Stack>\n    <Text value='a'/>\n  </Stack>\n</App>";
    expect(mapsTo(markup, "$$h($$C_Stack")).toMatch(/^<Stack>/);
    expect(mapsTo(markup, "$$h($$C_Text")).toMatch(/^<Text value='a'\/>/);
  });

  test("a container maps to its tag; its inner element creation too", () => {
    const markup = '<App>\n  <Stack var.x="{1}">\n    <Text value="{x}"/>\n  </Stack>\n</App>';
    expect(mapsTo(markup, "$$h($$K")).toMatch(/^<Stack var\.x/);
    expect(mapsTo(markup, "$$h($$C_Stack")).toMatch(/^<Stack var\.x/);
  });
});

describe("the map itself", () => {
  test("names the source, embeds its content, and names the generated file", () => {
    const markup = "<App/>";
    const { map } = compileModule(markup, { fileName: "src/Main.pfui" });
    expect(map).toMatchObject({ version: 3, file: "src/Main.pfui.js", sources: ["src/Main.pfui"], sourcesContent: [markup] });
  });

  test("defaults: Main.pfui; sourceMap: false omits it", () => {
    expect(compileModule("<App/>").map?.sources).toEqual(["Main.pfui"]);
    expect(compileModule("<App/>", { sourceMap: false }).map).toBeUndefined();
  });

  test("the generated code contains no markers", () => {
    const { code } = compileModule('<App var.a="{1}"><Text value="{a}"/><Button onClick="a++"/></App>');
    expect(code).not.toMatch(/[]/);
  });
});
