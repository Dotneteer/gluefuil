// Step 29: the compiler's part of List: `syncWithVar` names a variable
// (`variableName`: its value and a hidden setter `$$setSyncWithVar`, E039
// otherwise), `refreshOn` is ignored with a warning. Design: .ai/plan/poc-29-list.md
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string, globals?: string[]) => {
  const result = compileModule(markup, { sourceMap: false, ...(globals ? { globals } : {}) });
  return result.diagnostics.map((d) => [d.code, d.severity, markup.slice(d.start, d.end)]);
};

describe("syncWithVar (E039)", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["a variable of the App", '<App var.sel="{{}}"><List syncWithVar="sel"/></App>', []],
    ["a variable of an element around it", '<App><VStack var.sel="{{}}"><List syncWithVar="sel"/></VStack></App>', []],
    ["a global of the App", '<App global.sel="{{}}"><List syncWithVar="sel"/></App>', []],
    ["an unknown name, with a suggestion", '<App var.sel="{{}}"><List syncWithVar="sell"/></App>', [["E039", "error", "sell"]]],
    ["an expression is not a name", '<App var.sel="{{}}"><List syncWithVar="{sel}"/></App>', [["E039", "error", "{sel}"]]],
    ["an id is not a variable", '<App><TextBox id="box"/><List syncWithVar="box"/></App>', [["E039", "error", "box"]]],
  ])("%s", (_label, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("the message names the prop and suggests the closest variable", () => {
    const [d] = compileModule('<App var.selection="{{}}"><List syncWithVar="selectoin"/></App>', { sourceMap: false }).diagnostics;
    expect(d!.message).toBe("'syncWithVar' of 'List' must name a variable visible here; 'selectoin' is not one. Did you mean 'selection'?");
  });

  test("a global of the app inside a component file", () => {
    expect(problems('<Component name="Picker"><List syncWithVar="sel"/></Component>', ["sel"])).toEqual([]);
  });

  test("the List gets the variable's value as a binding and a $$setSyncWithVar handler", () => {
    const { code } = compileModule('<App var.sel="{{}}"><List syncWithVar="sel"/></App>', { sourceMap: false });
    expect(code).toContain('{ "syncWithVar": ($$s) => $$s.sel }');
    expect(code).toMatch(/"\$\$setSyncWithVar": .*\$\$s\.sel = \$param;/);
  });
});

test("refreshOn is accepted and ignored, with a warning (E024)", () => {
  expect(problems('<App><List refreshOn="{1}"/></App>')).toEqual([["E024", "warning", "refreshOn"]]);
});
