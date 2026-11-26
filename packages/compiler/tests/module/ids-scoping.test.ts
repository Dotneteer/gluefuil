// compileModule, step 8: component IDs (file-scoped), name resolution and
// shadowing, context variables. Behavior: components/tests/ids-scoping.test.tsx.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

function code(markup: string): string {
  const result = compileModule(markup);
  expect(result.diagnostics).toEqual([]);
  return result.code;
}

const diagnostics = (markup: string) => compileModule(markup).diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);

describe("component IDs", () => {
  test("the file component creates a file scope holding the IDs", () => {
    const out = code('<App><TextBox id="name"/><TextBox id="email"/></App>');
    expect(out).toContain('  const $$f = $$useFileScope($$scope, ["name","email"]);');
    expect(out).toContain('$$h($$Bound, { type: $$C_TextBox, props: null, bindings: $$empty, id: "name", scope: $$f })');
  });

  test("without IDs, there is no file scope", () => {
    expect(code("<App><Text/></App>")).not.toContain("$$useFileScope(");
  });

  test.each<[markup: string]>([
    // A sibling's ID, in either order.
    ['<App><Text value="{box.value}"/><TextBox id="box"/></App>'],
    ['<App><TextBox id="box"/><Text value="{box.value}"/></App>'],
    // From a nested container, and an ID declared inside a container is visible outside it.
    ['<App var.x="{1}"><Stack var.y="{2}"><Text value="{box.value + x + y}"/></Stack><Stack><TextBox id="box"/></Stack></App>'],
    ['<App><Stack var.y="{1}"><TextBox id="inner"/></Stack><Text value="{inner.value}"/></App>'],
    // Handlers call API methods.
    ['<App><TextBox id="box"/><Button onClick="box.setValue(\'x\'); box.focus()"/></App>'],
  ])("%s", (markup) => {
    expect(compileModule(markup).diagnostics).toEqual([]);
  });

  test("an element inside a container registers in the file scope chain (its container's scope)", () => {
    const out = code('<App var.a="{1}"><TextBox id="box"/></App>');
    expect(out).toContain('id: "box", scope: $$c');
    expect(out).toContain("return $$h($$K");
    expect(out).toMatch(/\$\$h\(\$\$K\d+, \{ \$\$p: \$\$f \}\)/);
  });
});

describe("diagnostics", () => {
  test.each<[markup: string, expected: [code: string, text: string][]]>([
    ['<App><TextBox id="a"/><Stack><TextBox id="a"/></Stack></App>', [["E010", '"a"']]],
    ['<App><TextBox id="2a"/></App>', [["E011", '"2a"']]],
    ['<App><TextBox id="$a"/></App>', [["E011", '"$a"']]],
    ['<App><TextBox id="{x}"/></App>', [["E011", '"{x}"']]],
    ["<App><TextBox id/></App>", [["E011", "id"]]],
    ['<App var.box="{1}"><TextBox id="box"/></App>', [["E012", "var.box"]]],
    // IDs are read-only: changes go through API methods.
    ['<App><TextBox id="box"/><Button onClick="box = null"/></App>', [["C012", "box"]]],
    ['<App><TextBox id="box"/><Button onClick="box.value = 1"/></App>', [["C012", "box.value = 1"]]],
    ['<App><Text value="{box.value}"/></App>', [["C001", "box"]]],
  ])("%s", (markup, expected) => {
    expect(diagnostics(markup)).toEqual(expected);
  });
});

describe("name resolution and shadowing", () => {
  test.each<[markup: string, expected: [code: string, text: string][]]>([
    // Variables flow down; inner declarations shadow outer ones.
    ['<App var.m="a"><Stack var.m="b"><Text value="{m}"/></Stack><Text value="{m}"/></App>', []],
    // A variable is not visible to siblings of its declaring element.
    ['<App><Stack var.m="a"/><Text value="{m}"/></App>', [["C001", "m"]]],
    // Locals shadow everything.
    ['<App var.m="a"><Text value="{[1].map(m => m + 1)}"/></App>', []],
    // Context variables: only the ones that exist here.
    ['<App><Text value="{$item}"/></App>', [["C014", "$item"]]],
    ['<App var.n="{0}"><TextBox onDidChange="n = $param ?? 0; $cancel.aborted"/></App>', []],
    // Step 27: a pointer or argument-free event's statements declare no $param (an enclosing one shows through).
    ['<App var.n="{0}"><Button onClick="n = $param ?? 0; $cancel.aborted"/></App>', [["C014", "$param"]]],
    ['<App var.n="{0}"><Form onCancel="n = $params.length"/></App>', [["C014", "$params"]]],
    ['<App var.n="{0}"><Button onClick="(ev) => n = ev.clientX"/></App>', []],
    ['<App><Button onClick="$item"/></App>', [["C014", "$item"]]],
  ])("%s", (markup, expected) => {
    expect(diagnostics(markup)).toEqual(expected);
  });
});
