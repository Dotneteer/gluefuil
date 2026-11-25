// Step 18: behaviors, attached at compile time as Bound wrappers.
// Behavior in the DOM: components/tests/behaviors.test.tsx.
import { describe, expect, test } from "vitest";
import { compileModule, type CompileModuleOptions } from "../../src/module/compile-module";

const compile = (markup: string, options: CompileModuleOptions = {}) => compileModule(markup, { sourceMap: false, ...options });
const diagnostics = (markup: string) => compile(markup).diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
function code(markup: string): string {
  const result = compile(markup);
  expect(result.diagnostics).toEqual([]);
  return result.code;
}

/** The behavior wrappers of the compiled module, outermost first. */
const wrappers = (out: string) => [...out.matchAll(/\$\$C_(\w+Behavior)\b(?=, props)/g)].map((m) => m[1]);

describe("attachment", () => {
  test.each<[label: string, markup: string, attached: string[]]>([
    ["tooltip on a Button", '<App><Button label="Save" tooltip="Saves"/></App>', ["TooltipBehavior"]],
    ["label on a TextBox (no label prop of its own)", '<App><TextBox label="Name"/></App>', ["LabelBehavior"]],
    ["label on a Button: it declares label, so no behavior", '<App><Button label="Save"/></App>', []],
    ["variant on a Button (it has theme variables)", '<App><Button label="x" variant="danger"/></App>', ["VariantBehavior"]],
    ["a bound trigger attaches too", "<App><Button label=\"x\" tooltip=\"{'t'}\"/></App>", ["TooltipBehavior"]],
    // Outermost first: variant, tooltip, label (label wraps the component).
    ['<App><TextBox label="Name" tooltip="t" variant="v"/></App>', '<App><TextBox label="Name" tooltip="t" variant="v"/></App>', ["VariantBehavior", "TooltipBehavior", "LabelBehavior"]],
  ])("%s", (_, markup, attached) => {
    expect(wrappers(code(markup))).toEqual(attached);
  });

  test.each<[label: string, markup: string, expected: [string, string][]]>([
    // Non-visual components take no behaviors: the prop is unknown.
    ["tooltip on Items", '<App><Items data="{[]}" tooltip="t"/></App>', [["E020", "tooltip"]]],
    ["tooltip on Theme", '<App><Theme tooltip="t"/></App>', [["E025", "tooltip"]]],
    // A behavior's other props without its trigger: not attached, unknown.
    ["labelPosition without label", '<App><TextBox labelPosition="start"/></App>', [["E020", "labelPosition"]]],
    // Behavior props are type-checked.
    ["an invalid labelPosition", '<App><TextBox label="x" labelPosition="left"/></App>', [["E023", '"left"']]],
  ])("%s", (_, markup, expected) => {
    expect(diagnostics(markup)).toEqual(expected);
  });
});

describe("the generated code", () => {
  test("a behavior is a Bound of its component around the element; its props never reach the component", () => {
    const out = code('<App var.tip="t"><Button label="Save" tooltip="{tip}" onClick="tip = \'u\'"/></App>');
    expect(out).toContain('$$h($$Bound, { type: $$C_TooltipBehavior, props: null, bindings: $$b');
    expect(out).toMatch(/\$\$C_TooltipBehavior, props: null, bindings: \$\$b\d+, scope: \$\$c \}, \$\$h\(\$\$Bound, \{ type: \$\$C_Button, props: \{ "label": "Save" \}, bindings: \$\$empty, handlers/);
    expect(out).toMatch(/const \$\$b\d+ = \{ "tooltip": \(\$\$s\) => \$\$s\.tip \};/);
  });

  test("variant gets the component's name", () => {
    expect(code('<App><Button label="x" variant="danger"/></App>')).toContain('$$h($$Bound, { type: $$C_VariantBehavior, props: { "variant": "danger", "component": "Button" }, bindings: $$empty, scope: $$scope }');
  });

  test("when stays outermost; id stays on the component", () => {
    const out = code('<App var.show="{true}"><TextBox id="box" label="Name" when="{show}"/><Text>{box.value}</Text></App>');
    expect(out).toMatch(/\$\$h\(\$\$When, \{[^}]*\}, \$\$h\(\$\$Bound, \{ type: \$\$C_LabelBehavior/);
    expect(out).toContain('type: $$C_TextBox, props: null, bindings: $$empty, id: "box"');
  });
});

describe("user-defined components (gfui applies behaviors to them; XMLUI does not)", () => {
  test.each<[label: string, markup: string, attached: string[], expected: [string, string][]]>([
    ["a UDC that does not read the prop: the behavior wraps it", '<Component name="InfoCard"><Text>{$props.title}</Text></Component><App><InfoCard title="x" tooltip="t"/></App>', ["TooltipBehavior"], []],
    ["a UDC that reads $props.tooltip handles it itself", '<Component name="InfoCard"><Text>{$props.tooltip}</Text></Component><App><InfoCard tooltip="t"/></App>', [], []],
    ["an open UDC contract: the behavior attaches", "<Component name=\"InfoCard\"><Text>{$props['x']}</Text></Component><App><InfoCard tooltip=\"t\"/></App>", ["TooltipBehavior"], []],
    ["variant needs theme variables, which UDCs don't have", '<Component name="InfoCard"><Text>{$props.title}</Text></Component><App><InfoCard variant="v"/></App>', [], [["E020", "variant"]]],
  ])("%s", (_, markup, attached, expected) => {
    const result = compile(markup);
    expect(result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)])).toEqual(expected);
    if (expected.length === 0) expect(wrappers(result.code)).toEqual(attached);
  });
});

describe("variant theme variables", () => {
  test.each<[markup: string, expected: [string, string][]]>([
    ['<App><Theme backgroundColor-Button-danger="red" backgroundColor-Button-danger--hover="darkred"/></App>', []],
    ['<App><Theme backgroundColor-Buton-danger="red"/></App>', [["E025", "backgroundColor-Buton-danger"]]],
  ])("%s", (markup, expected) => {
    expect(diagnostics(markup)).toEqual(expected);
  });
});
