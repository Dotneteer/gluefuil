// Step 30: the compiler's part of Table: Column children compiled to data
// (`childrenAsColumns`: `$$columns`), E040, the Column's handlers and cell
// template, Columns from an Items. Design: .ai/plan/poc-30-table.md decision 2.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) => {
  const result = compileModule(markup, { sourceMap: false });
  return result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
};
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;
/** The hoisted columns binding of the (single) Table. */
const columns = (markup: string) => code(markup).match(/const \$\$o\d+ = (.*);$/m)?.[1];

describe("Columns as data (E040)", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["Columns, an Items of Columns, templates", '<App var.cols="{[\'a\']}"><Table data="{[]}"><Column bindTo="a"/><Items data="{cols}"><Column bindTo="{$item}"/></Items><property name="noDataTemplate"><Text>none</Text></property></Table></App>', []],
    ["a cell template reads the cell context", '<App><Table data="{[]}"><Column bindTo="a"><Text>{$item.a} {$cell} {$colIndex} {$rowIndex} {$rowId}</Text></Column></Table></App>', []],
    ["a row detail template", '<App><Table data="{[]}"><property name="rowDetailTemplate"><Text>{$item.a} {$isExpanded}</Text></property></Table></App>', []],
    ["another element inside a Table", '<App><Table><Column bindTo="a"/><Text>x</Text></Table></App>', [["E040", "Text"]]],
    ["text inside a Table", "<App><Table>loose</Table></App>", [["E040", "loose"]]],
    ["another element inside an Items of a Table", '<App><Table><Items data="{[1]}"><Text>x</Text></Items></Table></App>', [["E040", "Text"]]],
    ["a Column outside a Table", '<App><Column bindTo="a"/></App>', [["E037", "Column"]]],
    ["an unknown Column prop", '<App><Table><Column bindTo="a" widht="2*"/></Table></App>', [["E020", "widht"]]],
    ["an id on a Column", '<App><Table><Column id="c" bindTo="a"/></Table></App>', [["E002", "id"]]],
    ["a wrong literal", '<App><Table><Column bindTo="a" pinTo="middle"/></Table></App>', [["E023", '"middle"']]],
    ["an unknown event", '<App><Table><Column bindTo="a" onChanged="x => x"/></Table></App>', [["E004", "onChanged"]]],
    ["the cell context outside a cell", '<App><Table><Column bindTo="{$cell}"/></Table></App>', [["C014", "$cell"]]],
    ["syncWithAppState is gone", '<App><Table syncWithAppState="s"/></App>', [["E030", "syncWithAppState"]]],
  ])("%s", (_label, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("each Column is an entry: its key, props, cell template with its scope, handlers; nothing compiles in place", () => {
    const compiled = columns('<App var.n="{0}"><Table data="{[]}"><Column bindTo="a" header="A" width="2*"/><Column header="{n}" onDidChange="(v) => n = v"><Text>{$cell}</Text></Column></Table></App>')!;
    expect(compiled).toContain('{ "$$key": "0", "bindTo": "a", "header": "A", "width": "2*" }');
    expect(compiled).toMatch(/\{ "\$\$key": "1", "header": \(.*\)\(\$\$s\), "\$\$cell": \$\$T\d+, "\$\$scope": \$\$s, "\$\$handlers": \{ "onDidChange": /);
    expect(code('<App><Table><Column bindTo="a"/></Table></App>')).not.toContain("$$C_Column");
  });

  test("Columns in an Items: keyed position:$itemIndex, in the item's scope", () => {
    const compiled = columns('<App><Table><Items data="{[\'x\', \'y\']}"><Column bindTo="{$item}"/></Items></Table></App>')!;
    expect(compiled).toMatch(/\$\$optionItems\(\$\$s, .*, \(\$\$s(\d+)\) => \[\{ "\$\$key": \(.*"0:".*\)\(\$\$s\1\), "bindTo": .*\(\$\$s\1\) \}\]\)/);
  });

  test("when on a Column keeps it only while it holds", () => {
    expect(columns('<App var.show="{true}"><Table><Column bindTo="a" when="{show}"/></Table></App>')).toMatch(/\.\.\.\(\(.*\)\(\$\$s\) \? \[\{ "\$\$key": "0", "bindTo": "a" \}\] : \[\]\)/);
  });
});
