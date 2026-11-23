// compileModule and analyzeModule, step 14: user-defined components, slots,
// methods, isolation, code-behind. Behavior: components/tests/user-components.test.tsx.
import { describe, expect, test } from "vitest";
import { analyzeModule } from "../../src/module/analyze";
import { compileModule, type CompileModuleOptions } from "../../src/module/compile-module";

const compile = (markup: string, options: CompileModuleOptions = {}) => compileModule(markup, { sourceMap: false, ...options });

function code(markup: string, options?: CompileModuleOptions): string {
  const result = compile(markup, options);
  expect(result.diagnostics).toEqual([]);
  return result.code;
}

const diagnostics = (markup: string, options?: CompileModuleOptions) =>
  compile(markup, options).diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);

const LIST = { name: "List", slots: { $$slot: ["$item"], rowTemplate: ["$index", "$item"] }, methods: ["reset"], module: "./components/List.pfui" };

describe("analyzeModule", () => {
  test("an app file: inline definitions with their slots and methods; every referenced component", () => {
    const analysis = analyzeModule(`
      <Component name="Card" method.open="x" var.x="{1}">
        <method name="close">x = 0</method>
        <Stack>
          <Slot name="headerTemplate" title="{1}" level="2"/>
          <Items data="{[]}"><Slot item="{$item}"/></Items>
          <Slot/>
        </Stack>
      </Component>
      <App><Card/><Other/><Text/></App>`);
    expect(analysis).toEqual({
      kind: "app",
      components: [{ name: "Card", slots: { headerTemplate: ["$level", "$title"], $$slot: ["$item"] }, methods: ["close", "open"] }],
      references: ["App", "Card", "Items", "Other", "Stack", "Text"],
    });
  });

  test("a component file", () => {
    expect(analyzeModule('<Component name="Leaf"><Text>{$props.x}</Text></Component>')).toEqual({
      kind: "component",
      components: [{ name: "Leaf", slots: {}, methods: [] }],
      references: ["Text"],
    });
  });
});

describe("file forms", () => {
  test("an app with an inline component: a hoisted function, used through BoundUser", () => {
    const out = code('<Component name="Hello"><Text>hi {$props.name}</Text></Component><App><Hello name="Ann"/></App>');
    expect(out).toContain("function $$U_Hello({ input: $$in }) {\n  const $$c = $$useComponent($$in, $$scope, $$empty, $$empty, []);");
    expect(out).toContain('$$U_Hello.displayName = "Hello";');
    expect(out).toContain('$$h($$BoundUser, { type: $$U_Hello, props: { "name": "Ann" }, bindings: $$empty, scope: $$scope })');
    expect(out).toMatch(/export default Main;\n$/);
  });

  test("the app element and the definitions may come in any order", () => {
    expect(diagnostics('<App><Hello/></App><Component name="Hello"><Text/></Component>')).toEqual([]);
  });

  test("a component file exports its component", () => {
    expect(code('<Component name="Leaf"><Text/></Component>', { fileName: "Leaf.pfui" })).toMatch(/export default \$\$U_Leaf;\n$/);
    expect(code('<Component name="Leaf"><Text/></Component>', { format: "function" })).toMatch(/return \$\$U_Leaf;\n$/);
  });

  test.each<[label: string, markup: string, options: CompileModuleOptions, expected: [string, string][]]>([
    ["two components, no app", '<Component name="A"><Text/></Component><Component name="B"><Text/></Component>', {}, [["E003", "Component"]]],
    ["two app elements", '<App/><Stack/>', {}, [["E003", "<Stack/>"]]],
    ["file name mismatch", '<Component name="Leaf"><Text/></Component>', { fileName: "components/Branch.pfui" }, [["E016", '"Leaf"']]],
    ["invalid name", '<Component name="leaf"><Text/></Component><App/>', {}, [["E016", '"leaf"']]],
    ["no name", "<Component><Text/></Component><App/>", {}, [["E016", "Component"]]],
    ["a built-in's name", '<Component name="Button"><Text/></Component><App/>', {}, [["E016", '"Button"']]],
    ["defined twice", '<Component name="A"><Text/></Component><Component name="A"><Text/></Component><App/>', {}, [["E016", '"A"']]],
    ["inline and in a file", '<Component name="List"><Text/></Component><App/>', { userComponents: { List: LIST } }, [["E016", '"List"']]],
    ["nested <Component>", '<App><Component name="A"><Text/></Component></App>', {}, [["E016", "Component"]]],
    ["unknown <Component> attribute", '<Component name="A" width="1"><Text/></Component><App/>', {}, [["E016", "width"]]],
    ["a global in a component", '<Component name="A" global.g="1"><Text/></Component><App/>', {}, [["E006", "global.g"]]],
  ])("%s", (_, markup, options, expected) => {
    expect(diagnostics(markup, options)).toEqual(expected);
  });
});

describe("other files' components", () => {
  test("esm: imported from their module", () => {
    const out = code("<App><List/></App>", { userComponents: { List: LIST } });
    expect(out).toContain('import $$U_List from "./components/List.pfui";');
    expect(out).toContain("$$h($$BoundUser, { type: $$U_List,");
  });

  test("function format: looked up in $$imports.components at render time", () => {
    const out = code("<App><List/></App>", { format: "function", userComponents: { List: { ...LIST, module: undefined } } });
    expect(out).toContain('$$h($$BoundUser, { type: $$imports.components["List"],');
    expect(out).not.toContain("import ");
  });

  test("esm without a module is an error at the use", () => {
    expect(diagnostics("<App><List/></App>", { userComponents: { List: { ...LIST, module: undefined } } })).toEqual([["E016", "List"]]);
  });

  test("unknown names are still E001", () => {
    expect(diagnostics("<App><Lisst/></App>", { userComponents: { List: LIST } })).toEqual([["E001", "Lisst"]]);
  });
});

describe("using a component", () => {
  test.each<[label: string, markup: string]>([
    ["any event", '<App var.n="{0}"><List onWhatever="n++" onOther="(a, b) => n = a + b"/></App>'],
    ["a policy for any event", '<App><List onSaved="x => x" handlerPolicy:onSaved="queue"/></App>'],
    ["children: the default slot, with its slot props", "<App><List><Text>{$item}</Text></List></App>"],
    ["a named slot with its slot props", '<App><List><property name="rowTemplate"><Text>{$index}: {$item}</Text></property></List></App>'],
    ["methods through its id", '<App><List id="list"/><Button onClick="list.reset()"/></App>'],
    ["lifecycle and when on the element", '<App var.n="{0}"><List when="{n > 0}" onMount="n++"/></App>'],
  ])("%s", (_, markup) => {
    expect(diagnostics(markup, { userComponents: { List: LIST } })).toEqual([]);
  });

  const LEAF = { name: "Leaf", slots: {}, methods: [], module: "./Leaf.pfui" };
  test.each<[label: string, markup: string, expected: [string, string][]]>([
    ["children without a default slot", "<App><Leaf><Text/></Leaf></App>", [["E018", "<Text/>"]]],
    ["an unknown slot", '<App><List><property name="nope"><Text/></property></List></App>', [["E013", '"nope"']]],
    ["the reserved default-slot name", '<App><List><property name="$$slot"><Text/></property></List></App>', [["E013", '"$$slot"']]],
    ["a slot prop outside its slot", "<App><List/><Text>{$index}</Text></App>", [["C014", "$index"]]],
    ["the default slot's props in a named slot", '<App><Leaf/><List><property name="rowTemplate"><Text/></property></List></App>', []],
  ])("%s", (_, markup, expected) => {
    expect(diagnostics(markup, { userComponents: { List: LIST, Leaf: LEAF } })).toEqual(expected);
  });
});

describe("inside a component", () => {
  test.each<[label: string, markup: string]>([
    ["$props, emitEvent, hasEventHandler, $self", '<Component name="A" method.m="1"><Button label="{$props.label}" onClick="hasEventHandler(\'x\') && emitEvent(\'x\', 1); $self.m()"/></Component>'],
    ["own variables, written by handlers and methods", '<Component name="A" var.n="{0}" method.reset="n = 0"><Button onClick="n++"/></Component>'],
    ["own IDs", '<Component name="A"><Stack><TextBox id="box"/><Text>{box.value}</Text></Stack></Component>'],
    ["slots with a fallback", '<Component name="A"><Slot><Text>fallback</Text></Slot></Component>'],
  ])("%s", (_, markup) => {
    expect(diagnostics(markup)).toEqual([]);
  });

  test.each<[label: string, markup: string, expected: [string, string][]]>([
    // Isolation: the body sees nothing of the file it is used from.
    ["a variable of the app", '<Component name="A"><Text>{count}</Text></Component><App var.count="{0}"><A/></App>', [["C001", "count"]]],
    ["an id of the app", '<Component name="A"><Text>{box.value}</Text></Component><App><TextBox id="box"/><A/></App>', [["C001", "box"]]],
    ["writing $props", '<Component name="A"><Button onClick="$props.x = 1"/></Component>', [["C012", "$props.x = 1"]]],
    ["writing $self", '<Component name="A"><Button onClick="$self = 1"/></Component>', [["C012", "$self"]]],
    // And the app doesn't see a component's names.
    ["$props in the app", "<App><Text>{$props.x}</Text></App>", [["C014", "$props"]]],
    ["emitEvent in the app", "<App><Button onClick=\"emitEvent('x')\"/></App>", [["C001", "emitEvent"]]],
    ["<Slot> outside a component", "<App><Slot/></App>", [["E017", "Slot"]]],
    ["a slot name without 'Template'", '<Component name="A"><Slot name="header"/></Component>', [["E017", '"header"']]],
    ["an invalid method name", '<Component name="A" method.1x="1"><Text/></Component>', [["E016", "method.1x"]]],
  ])("%s", (_, markup, expected) => {
    expect(diagnostics(markup)).toEqual(expected);
  });

  test("the generated component: variables, methods, IDs, slots", () => {
    const out = code('<Component name="A" var.n="{0}" method.go="n++"><Stack><TextBox id="box"/><Slot name="rowTemplate" item="{n}" open/></Stack></Component>');
    expect(out).toContain('const $$v0 = { "n": { init: ($$s) => 0 } };');
    expect(out).toContain('const $$m1 = { "go": ($$s) => ($$x) => async');
    expect(out).toContain('const $$c = $$useComponent($$in, $$scope, $$v0, $$m1, ["box"]);');
    expect(out).toContain('{ "$item": ($$s) => $$s.n, "$open": () => "true" }');
    expect(out).toContain('$$h($$Slot, { name: "rowTemplate", bindings: $$b2, scope: $$c })');
  });
});

describe("code-behind", () => {
  const cb = (markup: string, codeBehind: string) => {
    const result = compile(markup, { codeBehind });
    return {
      markup: result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]),
      codeBehind: result.codeBehindDiagnostics!.map((d) => [d.code, codeBehind.slice(d.start, d.end)]),
      code: result.code,
    };
  };

  test("the app root gets the variables and functions (a container, even without markup variables)", () => {
    const result = cb("<App><Text>{greet(name)}</Text></App>", "var name = 'x';\nfunction greet(who) { return 'hi ' + who; }");
    expect(result.markup).toEqual([]);
    expect(result.codeBehind).toEqual([]);
    expect(result.code).toContain('"name": { init: ($$s) => \'x\' }, "greet": { fn: ($$s) => function greet(who) { return \'hi \' + who; } }');
  });

  test("a component file's component gets them", () => {
    const result = cb('<Component name="A"><Button onClick="bump()"/></Component>', "var n = 0; function bump() { n++; }");
    expect(result.codeBehind).toEqual([]);
    expect(result.code).toContain('"bump": { fn: ($$s) => function bump() { $$s.n++; } }');
  });

  test("functions: synchronous unless they await; they may call each other", () => {
    const result = cb("<App/>", "function a() { return b(); } function b() { return delay(1); } function c() { delay(1); return 1; }");
    expect(result.codeBehind).toEqual([]);
    expect(result.code).toContain("function a() { return (0, $$s.b)?.(); }");
    expect(result.code).not.toContain("async function a");
  });

  test.each<[label: string, markup: string, codeBehind: string, expected: [string, string][]]>([
    ["let at the top level", "<App/>", "let x = 1;", [["E019", "let x = 1;"]]],
    ["a statement", "<App/>", "var x = 1; x++;", [["E019", "x++;"]]],
    ["destructuring", "<App/>", "var { a } = {};", [["E019", "{ a }"]]],
    ["a name also in the markup", '<App var.x="{1}"/>', "var x = 2;", [["E019", "x"]]],
    ["a function named like a variable", "<App/>", "var f = 1; function f() {}", [["E019", "f"]]],
    ["an unknown name", "<App/>", "function f() { return missing; }", [["C001", "missing"]]],
    ["writing a function", "<App/>", "function f() {} function g() { f = 1; }", [["C012", "f"]]],
    ["a cycle", "<App/>", "var a = b; var b = a;", [["E005", "a"]]],
  ])("%s", (_, markup, codeBehind, expected) => {
    expect(cb(markup, codeBehind).codeBehind).toEqual(expected);
  });

  test("a parse error is reported with code-behind positions", () => {
    const result = cb("<App/>", "var n = ;");
    expect(result.markup).toEqual([]);
    expect(result.codeBehind.length).toBeGreaterThan(0);
    expect(result.codeBehind.every(([code]) => code!.startsWith("S"))).toBe(true);
  });
});
