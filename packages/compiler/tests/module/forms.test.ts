// Step 22: Form's $data (childContextVars), the formBinding and validation
// behaviors (attached by bindTo on a component with a value API), and behavior
// events (onValidate).
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) => {
  const result = compileModule(markup, { sourceMap: false });
  return result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
};
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;

describe("diagnostics", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["$data inside a Form, in children and in the Form's own handlers", '<App><Form onSubmit="(d) => d === $data"><Text>{$data.name}</Text></Form></App>', []],
    ["$data outside a Form", "<App><Text>{$data.name}</Text></App>", [["C014", "$data"]]],
    ["an ID inside a Form is visible outside it", '<App><Form><TextBox id="box" bindTo="a"/></Form><Text>{box.value}</Text></App>', []],
    ["bound inputs with rules", '<App><Form><TextBox bindTo="a" label="A" required minLength="2" pattern="email" regex="^x" lengthInvalidSeverity="warning"/><Checkbox bindTo="b" required/><Select bindTo="c" noSubmit/></Form></App>', []],
    ["a rule without bindTo is an unknown prop", "<App><TextBox required/></App>", [["E020", "required"]]],
    ["bindTo on a component without a value API", '<App><Button bindTo="x"/></App>', [["E020", "bindTo"]]],
    ["bindTo on a non-visual component", '<App><Items bindTo="x"/></App>', [["E020", "bindTo"]]],
    ["an unknown pattern name", '<App><TextBox bindTo="a" pattern="zip"/></App>', [["E023", '"zip"']]],
    ["a severity must be error or warning", '<App><TextBox bindTo="a" maxLength="3" lengthInvalidSeverity="info"/></App>', [["E023", '"info"']]],
    ["validationMode values", '<App><TextBox bindTo="a" validationMode="onBlur"/></App>', [["E023", '"onBlur"']]],
    ["minLength is an integer", '<App><TextBox bindTo="a" minLength="many"/></App>', [["E022", '"many"']]],
    ["onValidate is the validation behavior's event", '<App><TextBox bindTo="a" onValidate="(v) => v ? null : \'empty\'"/></App>', []],
    ["onValidate without bindTo", '<App><TextBox onValidate="(v) => null"/></App>', [["E004", "onValidate"]]],
    ["a misspelled behavior event", '<App><TextBox bindTo="a" onValidat="(v) => null"/></App>', [["E004", "onValidat"]]],
    ["Form's own events", '<App><Form onWillSubmit="(d) => false" onSuccess="(r) => r" onSubmitError="(e) => e" onDirtyChanged="(d) => d" onCancel="1" onReset="1"/></App>', []],
    ["dataAfterSubmit values", '<App><Form dataAfterSubmit="drop"/></App>', [["E023", '"drop"']]],
    ["an exclusive prop (DateInput minValue, a date) isn't the validation's numeric range", '<App><Form><DateInput bindTo="d" minValue="01/01/2026" maxValue="{\'12/31/2026\'}"/></Form></App>', []],
    ["a shared prop (NumberBox minValue) is still checked as the range's number", '<App><Form><NumberBox bindTo="n" minValue="low"/></Form></App>', [["E022", '"low"']]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });
});

describe("generated code", () => {
  test("an exclusive prop goes to the component only (step 26)", () => {
    const out = code('<App><Form><DateInput bindTo="d" minValue="01/01/2026"/></Form></App>');
    expect(out).toContain("type: $$C_ValidationBehavior, props: null");
    expect(out).toContain('$$h($$C_DateInput, { "minValue": "01/01/2026" })');
  });

  test("a Form: a container creates the context scope; the Form gets it as contextScope; children use it", () => {
    const out = code('<App><Form><Text>{$data.a}</Text></Form></App>');
    expect(out).toMatch(/const \$\$c = \$\$useContextScope\(\$\$p, \["\$data"\]\);/);
    expect(out).toContain('"contextScope": $$c');
    expect(out).toContain("($$s) => $$s.$data?.a");
  });

  test("a bound input: label innermost, then formBinding, then validation (with its handler, results: true)", () => {
    const out = code('<App><TextBox bindTo="a" label="A" required onValidate="(v) => null"/></App>');
    const render = out.slice(out.indexOf("return "));
    const label = render.indexOf("$$C_LabelBehavior");
    const binding = render.indexOf("$$C_FormBindingBehavior");
    const validation = render.indexOf("$$C_ValidationBehavior");
    // The outermost wrapper comes first in the expression.
    expect(validation).toBeLessThan(binding);
    expect(binding).toBeLessThan(label);
    expect(out).toMatch(/type: \$\$C_ValidationBehavior, props: \{ "required": "true" \}, bindings: \$\$empty, handlers: \$\$e\d+, results: true/);
    expect(out).toContain('type: $$C_FormBindingBehavior, props: { "bindTo": "a" }');
  });
});
