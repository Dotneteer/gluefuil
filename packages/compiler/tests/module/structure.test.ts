// Step 28: the compiler's part of the structure components: headers as data
// (`childrenAsHeaders`, E038) with the same keys on the items compiled in
// place, `$overflow` in a scope per child (`perChildContextVars`), the splitter
// aliases. Design: .ai/plan/poc-28-structure.md
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) => {
  const result = compileModule(markup, { sourceMap: false });
  return result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
};
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;
/** The hoisted headers binding of the (single) Tabs or Stepper. */
const headers = (markup: string) => code(markup).match(/const \$\$o\d+ = (.*);$/m)?.[1];

describe("headers as data (E038)", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["TabItems and an Items of TabItems", '<App><Tabs><TabItem label="a"/><Items data="{[1]}"><TabItem label="{$item}"/></Items></Tabs></App>', []],
    ["Steps in a Stepper", '<App><Stepper><Step label="a" completed="true"/><Step label="b"/></Stepper></App>', []],
    ["IDs, events and variables on a TabItem and inside it", '<App var.n="{0}"><Tabs><TabItem id="t" label="a" onActivated="n++" var.x="1"><TextBox id="name"/></TabItem></Tabs><Text>{name.value} {x}</Text></App>', [["C001", "x"]]],
    ["another element inside a Tabs", '<App><Tabs><TabItem label="a"/><Text>x</Text></Tabs></App>', [["E038", "Text"]]],
    ["text inside a Stepper", "<App><Stepper>loose</Stepper></App>", [["E038", "loose"]]],
    ["a Step inside a Tabs", '<App><Tabs><Step label="a"/></Tabs></App>', [["E037", "Step"], ["E038", "Step"]]],
    ["another element inside an Items of a Tabs", '<App><Tabs><Items data="{[1]}"><Text>x</Text></Items></Tabs></App>', [["E038", "Text"]]],
    ["a TabItem outside a Tabs", '<App><TabItem label="a"/></App>', [["E037", "TabItem"]]],
    ["a binding problem is reported once", '<App><Tabs><TabItem label="{missing}"/></Tabs></App>', [["C001", "missing"]]],
    ["responsive when on a TabItem", '<App><Tabs><TabItem label="a" when-md="true"/></Tabs></App>', [["E002", "when-md"]]],
  ])("%s", (_label, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("the headers: keys by position, the item's props and id; when filters; an Items keys its items by $itemIndex", () => {
    const compiled = headers('<App var.show="{true}"><Tabs><TabItem id="first" label="A"/><TabItem label="B" when="{show}"/><Items data="{[1, 2]}"><TabItem label="{$item}"/></Items></Tabs></App>')!;
    expect(compiled).toContain('{ "$$key": "0", "id": "first", "label": "A" }');
    expect(compiled).toMatch(/\.\.\.\(\(.*\)\(\$\$s\) \? \[\{ "\$\$key": "1", "label": "B" \}\] : \[\]\)/);
    expect(compiled).toMatch(/\$\$optionItems\(\$\$s, .*, \(\$\$s(\d+)\) => \[\{ "\$\$key": \(\(\$\$s\) => "2:" \+ \$\$s\.\$itemIndex\)\(\$\$s\1\), "label": .*\}\]\)/);
  });

  test("the items in place get the same keys: a constant, or a binding of $itemIndex", () => {
    const compiled = code('<App><Tabs><TabItem label="A"/><Items data="{[1]}"><TabItem label="x"/></Items></Tabs></App>');
    expect(compiled).toContain('"$$key": "0"');
    expect(compiled).toMatch(/"\$\$key": \(\$\$s\) => "1:" \+ /);
  });

  test("a TabItem's headerTemplate goes into its header with the scope to render it in", () => {
    const compiled = headers('<App><Tabs><TabItem label="A"><property name="headerTemplate"><Text>{$header.label}</Text></property></TabItem></Tabs></App>')!;
    expect(compiled).toMatch(/"\$\$headerTemplate": \$\$T\d+, "\$\$scope": \$\$s/);
  });
});

describe("ResponsiveBar: $overflow per child", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["$overflow in each child", "<App><ResponsiveBar><Button label=\"{$overflow ? 'in menu' : 'in bar'}\"/><Text>{$overflow}</Text></ResponsiveBar></App>", []],
    ["IDs inside stay file-scoped", '<App><ResponsiveBar><TextBox id="q"/></ResponsiveBar><Text>{q.value}</Text></App>', []],
    ["$overflow outside", "<App><Text>{$overflow}</Text></App>", [["C014", "$overflow"]]],
  ])("%s", (_label, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("each element child is wrapped in a container with its own scope", () => {
    const compiled = code('<App><ResponsiveBar><Button label="a"/><Button label="b"/></ResponsiveBar></App>');
    expect(compiled.match(/\$\$usePerChildScope\(\$\$p, \["\$overflow"\]\)/g)).toHaveLength(2);
  });
});

describe("splitters", () => {
  test("HSplitter and VSplitter are Splitter with an orientation", () => {
    expect(code('<App><HSplitter><Text>a</Text><Text>b</Text></HSplitter></App>')).toMatch(/\$\$h\(\$\$C_Splitter, \{ "orientation": "horizontal" \}/);
    expect(code('<App><VSplitter><Text>a</Text><Text>b</Text></VSplitter></App>')).toMatch(/\$\$h\(\$\$C_Splitter, \{ "orientation": "vertical" \}/);
    expect(problems('<App><HSplitter orientation="vertical"/></App>')).toEqual([["E020", "orientation"]]);
  });
});
