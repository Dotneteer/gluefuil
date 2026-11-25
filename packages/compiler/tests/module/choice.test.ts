// Step 25: the children of Select and AutoComplete compile to one options array
// (`childrenAsOptions`): Option elements are objects, Items spread their
// template's options per item, `when` filters. Design: .ai/plan/poc-25-choice.md
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) => {
  const result = compileModule(markup, { sourceMap: false });
  return result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
};
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;
/** The hoisted options binding of the (single) Select or AutoComplete. */
const options = (markup: string) => code(markup).match(/const \$\$o\d+ = (.*);$/m)?.[1];

describe("diagnostics", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["Options, Items of Options, comments and whitespace", '<App><Select><!-- c --><Option value="a"/>\n  <Items data="{[1]}"><Option value="{$item}"/></Items></Select></App>', []],
    ["AutoComplete takes the same children", '<App><AutoComplete><Option value="a"/><Items data="{[1]}"><Option value="{$item}"/></Items></AutoComplete></App>', []],
    ["any attribute on an Option is a field (groupBy)", '<App><Select groupBy="category"><Option value="a" category="Fruit" type="{1}"/></Select></App>', []],
    ["a text child is the label; element children are content", '<App><Select><Option value="a">Apple {1}</Option><Option value="b"><Text>Rich</Text></Option></Select></App>', []],
    ["another element inside a Select", '<App><Select><Option value="a"/><Text>x</Text></Select></App>', [["E035", "Text"]]],
    ["another element inside an Items of a Select", '<App><Select><Items data="{[1]}"><HStack/></Items></Select></App>', [["E035", "HStack"]]],
    ["text inside a Select", "<App><Select>loose text</Select></App>", [["E035", "loose text"]]],
    ["data and Option children", '<App><Select data="{[1]}"><Option value="a"/></Select></App>', [["E036", "data"]]],
    ["data alone", '<App><Select data="{[1]}"/></App>', []],
    ["$item outside an Items", '<App><Select><Option value="{$item}"/></Select></App>', [["C014", "$item"]]],
    ["$item and $itemIndex inside an Items", '<App><Select><Items data="{[1]}"><Option value="{$item}" label="{$itemIndex}"/></Items></Select></App>', []],
    ["an id on an Option", '<App><Select><Option id="o" value="a"/></Select></App>', [["E002", "id"]]],
    ["an event on an Option", '<App><Select><Option value="a" onClick="1"/></Select></App>', [["E002", "onClick"]]],
    ["responsive when on an Option", '<App><Select><Option value="a" when-md="true"/></Select></App>', [["E002", "when-md"]]],
    ["Items attributes besides data and when", '<App><Select><Items data="{[1]}" reverse="true"><Option value="{$item}"/></Items></Select></App>', [["E002", "reverse"]]],
    ["an Option's enabled is checked as a boolean", '<App><Select><Option value="a" enabled="maybe"/></Select></App>', [["E022", '"maybe"']]],
    ["Options in a RadioGroup still render (attributes are checked)", '<App><RadioGroup><Option value="a" category="x"/></RadioGroup></App>', [["E020", "category"]]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });
});

describe("generated code", () => {
  test("constant Options: objects in the array; the Select gets the hidden $$options binding", () => {
    const out = code('<App><Select><Option value="a" label="A"/><Option value="b" category="c"/></Select></App>');
    expect(out).toMatch(/const \$\$o\d+ = \(\$\$s\) => \[\{ "value": "a", "label": "A" \}, \{ "value": "b", "category": "c" \}\];/);
    expect(out).toMatch(/\{ "\$\$options": \$\$o\d+ \}/);
  });

  test("bindings are evaluated in the scope; when spreads the option or nothing; a constant false when drops it", () => {
    const out = options('<App var.x="{1}"><Select><Option value="{x}" when="{x > 0}"/><Option value="never" when="false"/></Select></App>');
    expect(out).toBe('($$s) => [...((($$s) => $$s.x > 0)($$s) ? [{ "value": (($$s) => $$s.x)($$s) }] : [])]');
  });

  test("Items: $$optionItems with the data and a builder in the item scope", () => {
    const out = options('<App var.xs="{[]}"><Select><Items data="{xs}"><Option value="{$item.id}"/></Items></Select></App>');
    expect(out).toMatch(/^\(\$\$s\) => \[\.\.\.\$\$optionItems\(\$\$s, \(\(\$\$s\) => \$\$s\.xs\)\(\$\$s\), \((\$\$s\d+)\) => \[\{ "value": \(\(\$\$s\) => \$\$s\.\$item\?\.id\)\(\1\) \}\]\)\]$/);
  });

  test("a text child is the label (interpolated, trimmed); element children are $$content, a template in the option's scope", () => {
    expect(options('<App><Select><Option value="a">  Apple   pie </Option></Select></App>')).toBe('($$s) => [{ "value": "a", "label": String(" Apple pie ").trim() }]');
    expect(options('<App><Select><Option value="a" label="L">ignored</Option></Select></App>')).toBe('($$s) => [{ "value": "a", "label": "L" }]');
    expect(options('<App><Select><Option value="a"><Text>Rich</Text></Option></Select></App>')).toMatch(/"\$\$content": \$\$h\(\$\$OptionContent, \{ render: \$\$T\d+, scope: \$\$s \}\)/);
  });

  test("no children: no $$options (data or an empty list)", () => {
    expect(code('<App><Select data="{[1]}"/></App>')).not.toContain("$$options");
  });
});
