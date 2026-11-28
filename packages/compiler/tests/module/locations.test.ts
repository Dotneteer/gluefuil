// Step 35: markup positions compiled into the module (decision 2): one table per
// module (`$$L`), `at` on located elements, text and variables; `traced` and
// `sensitive` from the metadata. Positions are checked against the markup text.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

/** The module's location table: [element, line, column] triples, and its file. */
function table(markup: string, options: Parameters<typeof compileModule>[1] = {}) {
  const { code, diagnostics } = compileModule(markup, { sourceMap: false, ...options });
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const match = /const \$\$L = \$\$locations\(("[^"]*"), (\[.*\])\);/.exec(code);
  if (!match) return { code, file: undefined, entries: [] as [string, number, number][] };
  const flat = JSON.parse(match[2]!) as (string | number)[];
  const entries: [string, number, number][] = [];
  for (let i = 0; i < flat.length; i += 3) entries.push([flat[i] as string, flat[i + 1] as number, flat[i + 2] as number]);
  return { code, file: JSON.parse(match[1]!) as string, entries };
}

/** The markup text at a 1-based line and column, `length` characters. */
function at(markup: string, line: number, column: number, length: number): string {
  return markup.split("\n")[line - 1]!.slice(column - 1, column - 1 + length);
}

describe("the location table", () => {
  const markup = ['<App var.count="{0}">', '  <Button label="Add" onClick="count++"/>', "  <Text>Total: {count}</Text>", '  <Stack gap="4px"/>', "</App>"].join("\n");

  test.each<[what: string, element: string, text: string]>([
    ["a variable: its attribute", "count", "var.count"],
    ["an element with a handler: its tag", "Button", "<Button"],
    ["text with a binding: its first character", "#text", "Total:"],
  ])("%s", (_, element, text) => {
    const { entries } = table(markup);
    const entry = entries.find(([name]) => name === element)!;
    expect(at(markup, entry[1], entry[2], text.length)).toBe(text);
  });

  test("an element with nothing dynamic has no position (it isn't a Bound)", () => {
    const { entries, code } = table(markup);
    expect(entries.map(([name]) => name)).not.toContain("Stack");
    expect(code).toContain('$$h($$C_Stack, { "gap": "4px" })');
  });

  test("elements pass `at: $$L[i]`; variables too", () => {
    const { code } = table(markup);
    expect(code).toMatch(/type: \$\$C_Button, props: \{ "label": "Add" \}, bindings: \$\$empty, handlers: \$\$e\d+, at: \$\$L\[\d\], scope/);
    expect(code).toMatch(/"count": \{ init: \(\$\$s\) => 0, at: \$\$L\[0\] \}/);
  });

  test("the file: fileName, or locationFile when given (the plugin's path from the root)", () => {
    expect(table(markup, { fileName: "Main.gui" }).file).toBe("Main.gui");
    expect(table(markup, { fileName: "Main.gui", locationFile: "src/Main.gui" }).file).toBe("src/Main.gui");
  });

  test("a module with nothing located has no table", () => {
    expect(table("<App><Stack/></App>").code).not.toContain("$$locations(");
  });

  test("positions are exact through entities and on later lines of a multi-line tag", () => {
    const multi = ['<App>', "  <Text", '    value="&amp;{1}"/>', '  <Button', '    onClick="x = 1"', "    var.x=\"{0}\"/>", "</App>"].join("\n");
    const { entries } = table(multi);
    const button = entries.find(([name]) => name === "Button")!;
    expect(at(multi, button[1], button[2], 7)).toBe("<Button");
    const x = entries.find(([name]) => name === "x")!;
    expect(at(multi, x[1], x[2], 5)).toBe("var.x");
  });
});

describe("metadata flags", () => {
  test.each<[label: string, markup: string, component: string, flags: string[]]>([
    ["a DataSource is traced (and stays a Bound without bindings or an id)", '<App><DataSource url="/api/x"/></App>', "DataSource", ["traced: true"]],
    ["an APICall is traced", '<App><APICall id="save" url="/api/x"/></App>', "APICall", ["traced: true"]],
    ["a Table is traced", "<App><Table data=\"{[]}\"/></App>", "Table", ["traced: true"]],
    ["a PasswordInput is sensitive", '<App><PasswordInput onDidChange="x = 1" var.x="{0}"/></App>', "PasswordInput", ["sensitive: true"]],
    ["a TextBox of type password is sensitive", '<App><TextBox type="password" onDidChange="x = 1" var.x="{0}"/></App>', "TextBox", ["sensitive: true"]],
  ])("%s", (_, markup, component, flags) => {
    const { code } = table(markup);
    const element = new RegExp(`type: \\$\\$C_${component}[^)]*`).exec(code)![0];
    for (const flag of flags) expect(element).toContain(flag);
  });

  test("an ordinary TextBox is neither", () => {
    const { code } = table('<App><TextBox onDidChange="x = 1" var.x="{0}"/></App>');
    expect(code).not.toContain("sensitive: true");
    expect(code).not.toContain("traced: true");
  });
});
