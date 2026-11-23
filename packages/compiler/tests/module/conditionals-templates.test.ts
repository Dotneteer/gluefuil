// compileModule, step 10: when / when-*, templates and context variables,
// lifecycle handlers. Behavior: components/tests/conditionals-templates.test.tsx.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

function lines(markup: string): string[] {
  const { code, diagnostics } = compileModule(markup, { sourceMap: false });
  expect(diagnostics).toEqual([]);
  return code.split("\n");
}
const diagnostics = (markup: string) => compileModule(markup).diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);

describe("when", () => {
  test("a binding wraps the element in When; the condition is hoisted", () => {
    const code = lines('<App var.show="{true}"><Text when="{show}" value="x"/></App>');
    expect(code).toContain('const $$w1 = { "test": ($$s) => $$s.show };');
    expect(code.some((l) => l.includes("$$h($$When, { test: $$w1.test, responsive: $$w1.responsive, scope: $$c }, $$h($$C_Text"))).toBe(true);
  });

  test.each<[markup: string, rendered: boolean]>([
    ['<App><Text when="false" value="x"/></App>', false],
    ['<App><Text when="" value="x"/></App>', false],
    ['<App><Text when="true" value="x"/></App>', true],
    ["<App><Text when value='x'/></App>", true],
    ['<App><Text when="yes" value="x"/></App>', true],
  ])("constant %s: rendered=%s, no wrapper", (markup, rendered) => {
    const code = lines(markup).join("\n");
    expect(code.includes("$$C_Text,")).toBe(rendered);
    expect(code).not.toContain("$$h($$When");
  });

  test("responsive rules: constants and bindings", () => {
    const code = lines('<App var.wide="{true}"><Text when="false" when-md="true" when-xl="{wide}" value="x"/></App>');
    expect(code).toContain('const $$w1 = { "test": false, "responsive": { "md": true, "xl": ($$s) => $$s.wide } };');
  });

  test("when is evaluated in the enclosing scope (not the element's own variables)", () => {
    expect(diagnostics('<App><Stack var.v="{1}" when="{v}"/></App>')).toEqual([["C001", "v"]]);
  });

  test("a hidden constant element is not compiled at all", () => {
    expect(diagnostics('<App><Text when="false" value="{undefinedName}"/></App>')).toEqual([]);
  });
});

describe("templates", () => {
  test("Items: children are the item template; context variables are readable", () => {
    const code = lines('<App var.list="{[1, 2]}"><Items data="{list}"><Text value="{$itemIndex}: {$item}"/></Items></App>');
    expect(code.some((l) => /^function \$\$T\d+\(\$\$c\) \{$/.test(l))).toBe(true);
    expect(code.some((l) => /^const \$\$t\d+ = \{ "itemTemplate": \$\$T\d+ \};$/.test(l))).toBe(true);
    expect(code.some((l) => l.includes("$$r.str($$s.$itemIndex)") && l.includes("$$r.str($$s.$item)"))).toBe(true);
  });

  test("<property name='itemTemplate'> is the same", () => {
    const code = lines('<App><Items data="{[1]}"><property name="itemTemplate"><Text value="{$item}"/></property></Items></App>');
    expect(code.some((l) => /"itemTemplate": \$\$T\d+/.test(l))).toBe(true);
  });

  test("several elements in a template are a fragment", () => {
    const code = lines('<App><Items data="{[1]}"><Text value="a"/><Text value="b"/></Items></App>');
    expect(code.some((l) => l.includes("return $$h($$Fragment, null,"))).toBe(true);
  });

  test("containers and handlers inside a template use the template scope", () => {
    const code = lines('<App var.log="{[]}"><Items data="{[1]}"><Stack var.open="{false}"><Button onClick="open = !open; log.push($item)"/></Stack></Items></App>');
    expect(code.some((l) => /\$\$h\(\$\$K\d+, \{ \$\$p: \$\$c \}\)/.test(l))).toBe(true);
  });

  test.each<[markup: string, expected: [code: string, text: string][]]>([
    // Context variables exist only inside their template.
    ['<App><Text value="{$item}"/></App>', [["C014", "$item"]]],
    ['<App><Items data="{[1]}"><Text value="{$item}"/></Items><Text value="{$itemIndex}"/></App>', [["C014", "$itemIndex"]]],
    // They are read-only.
    ['<App><Items data="{[1]}"><Button onClick="$item = 2"/></Items></App>', [["C012", "$item"]]],
    // Unknown template property; content besides an explicit template.
    ['<App><Items><property name="footer"><Text/></property></Items></App>', [["E013", '"footer"']]],
    ['<App><Items><property name="itemTemplate"><Text/></property><Text value="x"/></Items></App>', [["E013", '<Text value="x"/>']]],
    // IDs inside templates are not supported yet.
    ['<App><Items data="{[1]}"><TextBox id="box"/></Items></App>', [["E014", "id"]]],
    ['<App><Items><property name="itemTemplate"><TextBox id="b"/></property></Items></App>', [["E014", "id"]]],
  ])("%s", (markup, expected) => {
    expect(diagnostics(markup)).toEqual(expected);
  });
});

describe("lifecycle", () => {
  test("onMount / onUnmount (and the onInit / onCleanup aliases) on any element", () => {
    const code = lines('<App var.n="{0}"><Text onMount="n++" onCleanup="n--"/></App>').join("\n");
    expect(code).toMatch(/const \$\$l\d+ = \{ "mount": .*\$\$s\.n\+\+.*, "unmount": .*\$\$s\.n--/);
    expect(code).toMatch(/lifecycle: \$\$l\d+/);
    expect(code).not.toContain('"onMount"');
  });

  test("<event name='mount'>", () => {
    const code = lines('<App var.n="{0}"><Text><event name="mount">n = 1</event></Text></App>').join("\n");
    expect(code).toMatch(/"mount": /);
  });
});

test.each<[markup: string, expected: [code: string, text: string][]]>([
  ['<App><Text when-huge="true"/></App>', [["E015", "when-huge"]]],
])("%s", (markup, expected) => {
  expect(diagnostics(markup)).toEqual(expected);
});
