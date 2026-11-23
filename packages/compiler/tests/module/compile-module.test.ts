// compileModule: .pfui document -> JavaScript module. Rendering is tested in
// the components package (tests/first-app.test.tsx), where the code runs.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

/** The body of Main's return statement, for the "function" format. */
function body(markup: string): string {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const match = /function Main\(\) \{\n {2}return (.*);\n\}/s.exec(code);
  return match![1]!;
}

/** The hoisted binding objects. */
function hoisted(markup: string): string[] {
  return compileModule(markup).code.split("\n").filter((line) => line.startsWith("const $$b"));
}

describe("module shape", () => {
  const markup = '<App><Text value="{1 + 2}"/></App>';

  test("esm: imports from the runtime and the components package, exports Main", () => {
    const { code } = compileModule(markup);
    expect(code.split("\n")).toEqual([
      'import { createElement as $$h, Bound as $$Bound, TextNode as $$TextNode, createAppScope as $$createAppScope, useScope as $$useScope, useFileScope as $$useFileScope, When as $$When, BoundUser as $$BoundUser, Slot as $$Slot, useComponent as $$useComponent, Fragment as $$Fragment, scriptGlobals as $$g, scriptRuntime as $$r } from "@patchfuil/runtime";',
      'import { App as $$C_App, Text as $$C_Text } from "@patchfuil/components";',
      "const $$scope = $$createAppScope();",
      'const $$b0 = { "value": ($$s) => 1 + 2 };',
      "function Main() {",
      "  return $$h($$C_App, null, $$h($$Bound, { type: $$C_Text, props: null, bindings: $$b0, scope: $$scope }));",
      "}",
      "export default Main;",
      "",
    ]);
  });

  test("esm: module specifiers can be changed", () => {
    const { code } = compileModule(markup, { runtimeModule: "rt", componentsModule: "cmp" });
    expect(code).toContain('from "rt";');
    expect(code).toContain('from "cmp";');
  });

  test("function: reads $$imports and returns Main; valid as a function body", () => {
    const { code } = compileModule(markup, { format: "function" });
    expect(code.split("\n").slice(0, 2)).toEqual([
      "const { createElement: $$h, Bound: $$Bound, TextNode: $$TextNode, createAppScope: $$createAppScope, useScope: $$useScope, useFileScope: $$useFileScope, When: $$When, BoundUser: $$BoundUser, Slot: $$Slot, useComponent: $$useComponent, Fragment: $$Fragment, scriptGlobals: $$g, scriptRuntime: $$r } = $$imports.runtime;",
      "const { App: $$C_App, Text: $$C_Text } = $$imports.components;",
    ]);
    expect(code.trimEnd().endsWith("return Main;")).toBe(true);
    expect(() => new Function("$$imports", code)).not.toThrow();
  });
});

describe("elements and attributes", () => {
  test.each<[markup: string, expected: string]>([
    ["<App/>", "$$h($$C_App, null)"],
    ['<App><Stack gap="8px" orientation="horizontal"/></App>', '$$h($$C_App, null, $$h($$C_Stack, { "gap": "8px", "orientation": "horizontal" }))'],
    // A key-only attribute means "true" (as in XMLUI).
    ["<App><Items reverse/></App>", '$$h($$C_App, null, $$h($$C_Items, { "reverse": "true" }))'],
    // Entities are decoded; escaped braces are literal.
    ['<App><Text value="a &amp; b \\{c}"/></App>', '$$h($$C_App, null, $$h($$C_Text, { "value": "a & b {c}" }))'],
    // Constant and bound props on one element.
    [
      '<App><Stack gap="4px" orientation="{\'hor\' + \'izontal\'}"/></App>',
      '$$h($$C_App, null, $$h($$Bound, { type: $$C_Stack, props: { "gap": "4px" }, bindings: $$b0, scope: $$scope }))',
    ],
  ])("%s", (markup, expected) => {
    expect(body(markup)).toBe(expected);
  });

  test("bindings are hoisted, one object per element", () => {
    expect(hoisted('<App><Text value="{1}"/><Button label="{2}"/></App>')).toEqual([
      'const $$b0 = { "value": ($$s) => 1 };',
      'const $$b1 = { "label": ($$s) => 2 };',
    ]);
  });
});

describe("text content", () => {
  test.each<[markup: string, expected: string]>([
    ["<App><Text>Hello</Text></App>", '$$h($$C_App, null, $$h($$C_Text, null, "Hello"))'],
    // Whitespace-only text between elements is dropped.
    ["<App>\n  <Text/>\n  <Text/>\n</App>", "$$h($$C_App, null, $$h($$C_Text, null), $$h($$C_Text, null))"],
    // Whitespace runs collapse to one space...
    ["<App><Text>  a \n\t b  </Text></App>", '$$h($$C_App, null, $$h($$C_Text, null, " a b "))'],
    // ...but not non-breaking spaces.
    ["<App><Text>a&nbsp;&nbsp;b</Text></App>", '$$h($$C_App, null, $$h($$C_Text, null, "a\u00a0\u00a0b"))'],
    // CDATA is literal: no interpolation, no collapsing.
    ["<App><Text><![CDATA[{x}   y]]></Text></App>", '$$h($$C_App, null, $$h($$C_Text, null, "{x}   y"))'],
    ["<App><!-- a comment --><Text/></App>", "$$h($$C_App, null, $$h($$C_Text, null))"],
    // Text with an expression becomes a bound TextNode.
    ["<App><Text>Sum: {1 + 2}</Text></App>", "$$h($$C_App, null, $$h($$C_Text, null, $$h($$Bound, { type: $$TextNode, bindings: $$b0, scope: $$scope })))"],
  ])("%j", (markup, expected) => {
    expect(body(markup)).toBe(expected);
  });

  test("collapsing applies to literal parts only: expressions keep their spaces", () => {
    expect(hoisted("<App><Text>a   {'b   c'}   d</Text></App>")).toEqual([
      `const $$b0 = { "value": ($$s) => "a " + $$r.str('b   c') + " d" };`,
    ]);
  });
});

describe("diagnostics", () => {
  test.each<[markup: string, expected: [code: string, text: string][]]>([
    ["<App><Foo/></App>", [["E001", "Foo"]]],
    ["<App><ns:Text/></App>", [["E001", "ns:Text"]]],
    // Handlers and variables are step 6 (tests/module/variables-handlers.test.ts).
    ['<App><Button onClick="count++"/></App>', [["C001", "count"]]],
    // `when` (step 10) and `id` (step 8) are supported now.
    ['<App><Text when="{true}" id="t"/></App>', []],
    ["<App><property name='x'/></App>", [["E013", "'x'"]]],
    ["<App><Text><sometag/></Text></App>", [["E002", "sometag"]]],
    ["<App><script>var x = 1;</script></App>", [["E002", "<script>"]]],
    ["<App/><App/>", [["E003", "<App/>"]]],
    ["text <App/>", [["E003", "text "]]],
    ["<!-- only a comment -->", [["E003", "<!-- only a comment -->"]]],
    // Binding diagnostics point into the markup.
    ['<App><Text value="{missing + 1}"/></App>', [["C001", "missing"]]],
    ["<App><Text>Hi {window.name}</Text></App>", [["C002", "window"]]],
    ['<App><Text value="a &amp;&amp; {nope}"/></App>', [["C001", "nope"]]],
    // Syntax errors too.
    ['<App><Text value="{1 +}"/></App>', [["S010", "}"]]],
    ["<App><Text></App>", [["M011", "Text"]]],
  ])("%s", (markup, expected) => {
    const { diagnostics } = compileModule(markup);
    expect(diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)])).toEqual(expected);
  });

  test("extra component metadata makes more names known", () => {
    const components = { App: { description: "", props: {} }, Chart: { description: "", props: {} } };
    expect(compileModule("<App><Chart/></App>", { components }).diagnostics).toEqual([]);
    expect(compileModule("<App><Text/></App>", { components }).diagnostics.map((d) => d.code)).toEqual(["E001"]);
  });
});
