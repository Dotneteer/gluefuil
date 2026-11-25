// Step 15: component contracts. Markup gives the expected diagnostic, at the
// expected span, with the expected severity. See .ai/plan/poc-15-contracts.md.
import { componentMetadata, type ComponentMetadata } from "@gluefuil/components/metadata";
import { describe, expect, test } from "vitest";
import { analyzeModule } from "../../src/module/analyze";
import { compileModule, type CompileModuleOptions } from "../../src/module/compile-module";
import { checkLiteral } from "../../src/module/contracts";
import { closestMatch, editDistance } from "../../src/source/suggest";

const WIDGET: ComponentMetadata = {
  description: "A test component with every kind of contract.",
  props: {
    label: { description: "", valueType: "string" },
    count: { description: "", valueType: "integer" },
    ratio: { description: "", valueType: "number" },
    enabled: { description: "", valueType: "boolean" },
    size: { description: "", valueType: "string", availableValues: ["sm", "md", "lg"] },
    src: { description: "", isRequired: true },
    old: { description: "", deprecationMessage: "use 'label'" },
  },
  events: { click: { description: "" }, legacy: { description: "", deprecationMessage: "use 'click'" } },
  api: { open: { description: "" }, value: { description: "" } },
};
const components = { ...componentMetadata, Widget: WIDGET };

type Found = [code: string, span: string, severity?: "warning"];
function check(markup: string, options: CompileModuleOptions = {}): Found[] {
  return compileModule(markup, { components, sourceMap: false, ...options }).diagnostics.map((d) => {
    const found: Found = [d.code, markup.slice(d.start, d.end)];
    if (d.severity === "warning") found.push("warning");
    return found;
  });
}
const messages = (markup: string, options?: CompileModuleOptions) => compileModule(markup, { components, sourceMap: false, ...options }).diagnostics.map((d) => d.message);

describe("props", () => {
  test.each<[markup: string, expected: Found[]]>([
    // Unknown prop (with a suggestion: see the messages test).
    ['<Widget src="a" labl="x"/>', [["E020", "labl"]]],
    ['<Widget src="a" colour="red"/>', [["E020", "colour"]]],
    // Required.
    ["<Widget/>", [["E021", "Widget"]]],
    ['<Widget src="{1}"/>', []],
    ["<Widget src/>", []],
    // Types: only literal values.
    ['<Widget src="a" count="3"/>', []],
    ['<Widget src="a" count="-3"/>', []],
    ['<Widget src="a" count="1.5"/>', [["E022", '"1.5"']]],
    ['<Widget src="a" count="{1.5}"/>', []],
    ['<Widget src="a" ratio="1.5e3"/>', []],
    ['<Widget src="a" ratio="abc"/>', [["E022", '"abc"']]],
    ['<Widget src="a" ratio=""/>', [["E022", '""']]],
    ['<Widget src="a" enabled="false"/>', []],
    ['<Widget src="a" enabled/>', []],
    ['<Widget src="a" enabled="yes"/>', [["E022", '"yes"']]],
    ['<Widget src="a" enabled="{1 > 0}"/>', []],
    ['<Widget src="a" label="anything at all"/>', []],
    // Enums.
    ['<Widget src="a" size="md"/>', []],
    ['<Widget src="a" size="xl"/>', [["E023", '"xl"']]],
    ['<Widget src="a" size="{\'xl\'}"/>', []],
    // Deprecation: a warning, with the component still compiled.
    ['<Widget src="a" old="x"/>', [["E024", "old", "warning"]]],
    // Framework attributes are never props.
    ['<Widget src="a" id="w" when="{true}" when-md="false" var.x="{1}" handlerPolicy="queue" handlerTimeoutMs:onClick="5" onClick="x++" onMount="x++"/>', []],
  ])("%s", (markup, expected) => {
    expect(check(markup)).toEqual(expected);
  });

  test("messages: suggestions, expected types, enum values, deprecation text", () => {
    expect(messages('<Widget src="a" labl="x"/>')).toEqual(["'Widget' has no prop 'labl'. Did you mean 'label'?"]);
    expect(messages('<Widget src="a" colour="red"/>')).toEqual(["'Widget' has no prop 'colour'."]);
    expect(messages("<Widget/>")).toEqual(["'Widget' requires the prop 'src'"]);
    expect(messages('<Widget src="a" count="1.5"/>')).toEqual(["'1.5' is not a valid value for 'count': expected an integer"]);
    expect(messages('<Widget src="a" size="xl"/>')).toEqual(["'xl' is not a valid value for 'size': expected one of 'sm', 'md', 'lg'"]);
    expect(messages('<Widget src="a" old="x"/>')).toEqual(["The prop 'old' of 'Widget' is deprecated: use 'label'"]);
  });
});

describe("events and components", () => {
  test.each<[markup: string, expected: Found[]]>([
    ['<Widget src="a" onClik="1"/>', [["E004", "onClik"]]],
    ['<Widget src="a" onLegacy="1"/>', [["E024", "onLegacy", "warning"]]],
    ['<Widget src="a"><event name="legacy">1</event></Widget>', [["E024", '"legacy"', "warning"]]],
    ["<App><Buton/></App>", [["E001", "Buton"]]],
  ])("%s", (markup, expected) => {
    expect(check(markup)).toEqual(expected);
  });

  test("messages", () => {
    expect(messages('<Widget src="a" onClik="1"/>')).toEqual(["'Widget' has no event 'clik'. Did you mean 'click'?"]);
    expect(messages("<App><Buton/></App>")).toEqual(["Unknown component 'Buton'. Did you mean 'Button'?"]);
    expect(messages("<App><Zzzzzz/></App>")).toEqual(["Unknown component 'Zzzzzz'"]);
  });
});

describe("API members through component IDs (C015)", () => {
  test.each<[markup: string, expected: Found[]]>([
    ['<App><Widget id="w" src="a"/><Button onClick="w.open()"/><Text>{w.value}</Text></App>', []],
    ['<App><Widget id="w" src="a"/><Button onClick="w.opne()"/></App>', [["C015", "opne"]]],
    ['<App><Widget id="w" src="a"/><Text>{w.valeu}</Text></App>', [["C015", "valeu"]]],
    // A component without an API: any member is unknown.
    ['<App><Text id="t"/><Text>{t.value}</Text></App>', [["C015", "value"]]],
    // Not checked: computed members, the ID itself, a local that shadows it.
    ["<App><Widget id=\"w\" src=\"a\"/><Text>{w['whatever']}</Text><Text>{w === undefined}</Text></App>", []],
    ['<App><Widget id="w" src="a"/><Button onClick="(w) => w.whatever"/></App>', []],
    // In code-behind too.
  ])("%s", (markup, expected) => {
    expect(check(markup)).toEqual(expected);
  });

  test("messages", () => {
    expect(messages('<App><Widget id="w" src="a"/><Button onClick="w.opne()"/></App>')).toEqual(["'w' (Widget) has no member 'opne'. Did you mean 'open'?"]);
    expect(messages('<App><Text id="t"/><Text>{t.value}</Text></App>')).toEqual(["'t' (Text) has no member 'value'."]);
  });

  test("code-behind is checked too", () => {
    const result = compileModule('<App><TextBox id="box"/></App>', { components, codeBehind: "function f() { return box.vale; }" });
    expect(result.codeBehindDiagnostics!.map((d) => [d.code, d.message])).toEqual([["C015", "'box' (TextBox) has no member 'vale'. Did you mean 'value'?"]]);
  });
});

describe("user-defined components: derived contracts", () => {
  const CARD = `
    <Component name="Card" method.reset="1">
      <Stack>
        <Text>{$props.title} {$props?.subtitle}</Text>
        <Button onClick="emitEvent('picked', 1); hasEventHandler('closed')"/>
      </Stack>
    </Component>`;

  test("analysis: the $props members read, the events emitted", () => {
    expect(analyzeModule(CARD).components[0]).toMatchObject({ props: ["subtitle", "title"], events: ["closed", "picked"], methods: ["reset"] });
  });

  test.each<[label: string, body: string, expected: { props?: string[]; events?: string[] }]>([
    ["$props used whole", "<Text>{JSON.stringify($props)}</Text>", { events: [] }],
    ["a computed $props member", "<Text>{$props['x']}</Text>", { events: [] }],
    ["a computed event name", '<Button onClick="emitEvent(name)"/>', { props: [] }],
    ["emitEvent as a value", '<Button onClick="const f = emitEvent; f(\'x\')"/>', { props: [] }],
    ["a parse error", "<Text>{$props.}</Text>", {}],
  ])("any props or events: %s", (_, body, expected) => {
    const info = analyzeModule(`<Component name="C">${body}</Component>`).components[0]!;
    expect({ props: info.props, events: info.events }).toEqual({ props: undefined, events: undefined, ...expected });
  });

  test("code-behind counts", () => {
    const info = analyzeModule('<Component name="C"><Text/></Component>', { codeBehind: "function f() { emitEvent('done', $props.x); }" }).components[0]!;
    expect(info).toMatchObject({ props: ["x"], events: ["done"] });
  });

  test.each<[markup: string, expected: Found[]]>([
    [`${CARD}<App><Card title="t" subtitle="s" onPicked="1" onClosed="1"/></App>`, []],
    [`${CARD}<App><Card titel="t"/></App>`, [["E020", "titel"]]],
    [`${CARD}<App><Card onPick="1"/></App>`, [["E004", "onPick"]]],
    [`${CARD}<App><Card id="c"/><Button onClick="c.rest()"/></App>`, [["C015", "rest"]]],
    // Open contracts accept anything.
    ['<Component name="Any"><Text>{$props[\'x\']}</Text><Button onClick="emitEvent(name)"/></Component><App><Any whatever="1" onAnything="1"/></App>', [["C001", "name"]]],
  ])("%s", (markup, expected) => {
    expect(check(markup)).toEqual(expected);
  });

  test("messages suggest the derived names", () => {
    expect(messages(`${CARD}<App><Card titel="t"/></App>`)).toEqual(["'Card' has no prop 'titel'. Did you mean 'title'?"]);
    expect(messages(`${CARD}<App><Card id="c"/><Button onClick="c.rest()"/></App>`)).toEqual(["'c' (Card) has no member 'rest'. Did you mean 'reset'?"]);
  });
});

describe("strictContracts: false (migration)", () => {
  test("violations become warnings; the unknown prop is still passed through", () => {
    const result = compileModule('<App><Widget src="a" labl="x" size="xl"/><Widget id="w" src="a"/><Button onClick="w.opne(); x++" onClik="1"/></App>', {
      components,
      sourceMap: false,
      strictContracts: false,
    });
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["E020", "warning"],
      ["E023", "warning"],
      ["C015", "warning"],
      ["C001", "error"],
      ["E004", "warning"],
    ]);
    expect(result.code).toContain('"labl": "x"');
  });

  test("missing required props are warnings too; unknown components stay errors", () => {
    expect(check("<App><Widget/><Nope/></App>", { strictContracts: false })).toEqual([
      ["E021", "Widget", "warning"],
      ["E001", "Nope"],
    ]);
  });
});

describe("helpers", () => {
  test.each([
    ["label", "label", 0],
    ["labl", "label", 1],
    ["lable", "label", 2],
    ["", "abc", 3],
    ["kitten", "sitting", 3],
  ])("editDistance(%s, %s) = %i", (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
    expect(editDistance(b, a)).toBe(d);
  });

  test("closestMatch: within 2 edits, the first on ties", () => {
    expect(closestMatch("lable", ["value", "label"])).toBe("label");
    expect(closestMatch("xyz", ["label"])).toBeUndefined();
    expect(closestMatch("ab", ["ac", "ad"])).toBe("ac");
  });

  test.each<[valueType: "string" | "boolean" | "number" | "integer" | "any", text: string, ok: boolean]>([
    ["any", "whatever", true],
    ["string", "", true],
    ["boolean", "true", true],
    ["boolean", "True", false],
    ["number", "-0.5", true],
    ["number", "Infinity", false],
    ["number", " ", false],
    ["integer", "42", true],
    ["integer", "4.0", false],
  ])("checkLiteral(%s, %j) ok: %s", (valueType, text, ok) => {
    expect(checkLiteral({ description: "", valueType }, text) === undefined).toBe(ok);
  });
});

describe("<Theme> and App theme props (step 17)", () => {
  test.each<[markup: string, expected: Found[]]>([
    ['<App><Theme backgroundColor-Button="red" color-primary="{x}" space-base="2px"/></App>', [["C001", "x"]]],
    ['<App><Theme backgroundColour-Button="red"/></App>', [["E025", "backgroundColour-Button"]]],
    ['<App><Theme tone="dim"/></App>', [["E023", '"dim"']]],
    ['<App><Theme themeId="gfui-blue"/></App>', [["E023", '"gfui-blue"']]],
    ['<App defaultTone="dark" defaultTheme="gfui-green"/>', []],
    ['<App defaultTone="night"/>', [["E023", '"night"']]],
    ['<App><Button onClick="toggleThemeTone(); setThemeTone(\'dark\'); setTheme(\'gfui-red\')"/><Text>{activeThemeTone} {activeThemeId}</Text></App>', []],
  ])("%s", (markup, expected) => {
    expect(check(markup)).toEqual(expected);
  });

  test("message", () => {
    expect(messages('<App><Theme backgroundColour-Button="red"/></App>')).toEqual(["'backgroundColour-Button' is not a theme variable. Did you mean 'backgroundColor-Button'?"]);
  });
});
