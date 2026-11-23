// compileModule, step 6: variable declarations (containers), handlers, <event>,
// and their diagnostics. Behavior is tested in the components package
// (tests/variables-handlers.test.tsx).
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

function lines(markup: string): string[] {
  const { code, diagnostics } = compileModule(markup);
  expect(diagnostics).toEqual([]);
  return code.split("\n");
}

describe("containers", () => {
  test("an element declaring variables becomes a component that creates them", () => {
    const code = lines('<App var.count="{0}" var.title="Hello"><Text value="{title}"/></App>');
    expect(code).toContain('const $$v0 = { "count": { init: ($$s) => 0 }, "title": { value: "Hello" } };');
    expect(code).toContain("function $$K2({ $$p }) {");
    expect(code).toContain("  const $$c = $$useScope($$p, $$v0);");
    expect(code).toContain("  return $$h($$C_App, null, $$h($$Bound, { type: $$C_Text, props: null, bindings: $$b1, scope: $$c }));");
    expect(code).toContain("  return $$h($$K2, { $$p: $$scope });");
  });

  test("<variable> and <global> children declare like attributes; key-only var.x is \"true\"", () => {
    const code = lines('<App global.g="{1}" var.flag><variable name="v" value="{g + 1}"/><global name="h"/></App>');
    expect(code).toContain(
      'const $$v0 = { "g": { init: ($$s) => 1 }, "flag": { value: "true" }, "v": { init: ($$s) => $$s.g + 1 }, "h": { value: undefined } };',
    );
  });

  test("nested containers receive the enclosing scope", () => {
    const code = lines('<App var.a="{1}"><Stack var.b="{a + 1}"><Text value="{a + b}"/></Stack></App>');
    expect(code.find((l) => l.startsWith("  return $$h($$C_App"))).toContain("$$h($$K");
    expect(code.find((l) => l.startsWith("const $$v") && l.includes('"b"'))).toBe('const $$v1 = { "b": { init: ($$s) => $$s.a + 1 } };');
    expect(code.some((l) => l.includes("$$h($$K3, { $$p: $$c })"))).toBe(true);
  });

  test("an element's own attributes and handlers see its variables", () => {
    const code = lines('<App><Button var.n="{1}" label="{n}" onClick="n++"/></App>');
    expect(code.some((l) => l.includes("handlers: $$e") && l.includes("scope: $$c"))).toBe(true);
  });
});

describe("handlers", () => {
  test("onClick compiles to a hoisted handler object on a Bound element", () => {
    const code = lines('<App var.count="{0}"><Button label="+" onClick="count++"/></App>');
    expect(code).toContain('const $$e1 = { "onClick": ($$s) => (...$params) => { const $param = $params[0]; $$s.count++; } };');
    expect(code).toContain("const $$empty = Object.freeze({});");
  });

  test("<event name='click'> is the same as onClick; its code is not whitespace-collapsed", () => {
    const code = lines('<App var.s="{\'\'}"><Button><event name="click">s = \'a   b\'</event></Button></App>');
    expect(code).toContain('const $$e1 = { "onClick": ($$s) => (...$params) => { const $param = $params[0]; $$s.s = \'a   b\'; } };');
  });

  test("<event> with CDATA", () => {
    const code = lines('<App var.ok="{false}"><Button><event name="click"><![CDATA[ok = 1 < 2 && 2 > 1]]></event></Button></App>');
    expect(code.some((l) => l.includes("$$s.ok = 1 < 2 && 2 > 1;"))).toBe(true);
  });
});

describe("diagnostics", () => {
  test.each<[markup: string, expected: [code: string, text: string][]]>([
    ['<App><Text onClick="x"/></App>', [["E004", "onClick"]]],
    ['<App><Button><event name="hover">x</event></Button></App>', [["E004", '"hover"']]],
    ['<App var.a="{b}" var.b="{a}"/>', [["E005", "var.a"]]],
    ['<App var.a="{a + 1}"/>', [["E005", "var.a"]]],
    ['<App var.a="{b}" var.b="{c}" var.c="{a}" var.d="{a}"/>', [["E005", "var.a"]]],
    ['<App><Stack global.g="{1}"/></App>', [["E006", "global.g"]]],
    ["<App><Stack><global name='g'/></Stack></App>", [["E006", "'g'"]]],
    ['<App var.a="1"><variable name="a" value="2"/></App>', [["E007", '"a"']]],
    ['<App var.$x="{1}"/>', [["E008", "var.$x"]]],
    ['<App var.2x="{1}"/>', [["E008", "var.2x"]]],
    ['<App><variable value="1"/></App>', [["E008", "variable"]]],
    ["<App><Button><event>x</event></Button></App>", [["E008", "event"]]],
    ["<App><Button><event name='click'><Text/></event></Button></App>", [["E002", "event"]]],
    // Handler code diagnostics point into the markup.
    ['<App var.n="{0}"><Button onClick="n++; nope()"/></App>', [["C001", "nope"]]],
    ['<App><Button onClick="n = ;"/></App>', [["S010", ";"]]],
    // Bindings still cannot write.
    ['<App var.n="{0}"><Text value="{n++}"/></App>', [["C006", "n"]]],
    // Shadowing: an inner variable with the same name is fine.
    ['<App var.t="{1}"><Stack var.t="{2}"><Text value="{t}"/></Stack></App>', []],
    // Shadowing applies to a variable's own initializer: `t` here is the inner `t`, a self-reference.
    ['<App var.t="{1}"><Stack var.t="{t + 1}"/></App>', [["E005", "var.t"]]],
  ])("%s", (markup, expected) => {
    const { diagnostics } = compileModule(markup);
    expect(diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)])).toEqual(expected);
  });
});
