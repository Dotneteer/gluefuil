// Step 21B: global variables (`global.*`, `<global>`, Globals.xs) in user
// components. See .ai/plan/poc-21b-globals.md.
import { describe, expect, test } from "vitest";
import { analyzeModule, compileModule, type CompileModuleOptions } from "../../src/index";

/** Diagnostics as [code, source text]; `globalsCode` problems as ["Globals.xs", code, text]. */
function problems(markup: string, options: CompileModuleOptions = {}): string[][] {
  const result = compileModule(markup, { sourceMap: false, ...options });
  const own = result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
  const globals = (result.globalsDiagnostics ?? []).map((d) => ["Globals.xs", d.code, options.globalsCode!.slice(d.start, d.end)]);
  const codeBehind = (result.codeBehindDiagnostics ?? []).map((d) => ["code-behind", d.code, options.codeBehind!.slice(d.start, d.end)]);
  return [...own, ...globals, ...codeBehind];
}

describe("analyzeModule: the globals of an app file", () => {
  test.each<[label: string, markup: string, globalsCode: string | undefined, expected: string[]]>([
    ["global.* and <global>, in order", '<App global.a="{1}" var.b="{2}"><global name="c" value="{3}"/></App>', undefined, ["a", "c"]],
    ["Globals.xs var and function names follow", '<App global.a="{1}"/>', "var x = 1; function f() { return x; }", ["a", "x", "f"]],
    ["a name in both places appears once", '<App global.a="{1}"/>', "var a = 2;", ["a"]],
    ["none", "<App/>", undefined, []],
    ["a component file has none (Globals.xs belongs to the app)", '<Component name="A"><Text/></Component>', "var x = 1;", []],
  ])("%s", (_, markup, globalsCode, expected) => {
    expect(analyzeModule(markup, globalsCode !== undefined ? { globalsCode } : {}).globals).toEqual(expected);
  });
});

describe("a component file with the app's globals", () => {
  const globals = ["count", "session", "format"];
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["reads a global", '<Component name="A"><Text>{count} {session.user}</Text></Component>', []],
    ["writes a global, deeply too", '<Component name="A"><Button onClick="count++; session.user = \'Bo\'"/></Component>', []],
    ["calls one", '<Component name="A"><Text>{format(count)}</Text></Component>', []],
    ["in a method and a template", '<Component name="A" method.reset="count = 0"><Items data="{[1]}"><Text>{count + $item}</Text></Items></Component>', []],
    ["shadowed by its own var: still writable (its own)", '<Component name="A" var.count="{0}"><Button onClick="count++"/></Component>', []],
    ["shadowed by its own ID: not writable", '<Component name="A"><TextBox id="count"/><Button onClick="count = 1"/></Component>', [["C012", "count"]]],
    ["shadowed by a template's ID: not writable there", '<Component name="A"><Items data="{[1]}"><TextBox id="count"/><Button onClick="count = 1"/></Items></Component>', [["C012", "count"]]],
    ["an undeclared name is still C001", '<Component name="A"><Text>{cuont}</Text></Component>', [["C001", "cuont"]]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup, { globals })).toEqual(expected);
  });

  test("shadowed by a code-behind function: not writable", () => {
    expect(problems('<Component name="A"><Button onClick="format = 1"/></Component>', { globals, codeBehind: "function format(x) { return x; }" })).toEqual([["C012", "format"]]);
  });

  test("generated code reads and writes through the component's scope (the prototype chain finds the global)", () => {
    const { code } = compileModule('<Component name="A"><Button onClick="count++"/></Component>', { globals, sourceMap: false });
    expect(code).toContain("$$s.count++");
  });

  test("without the option, a global is C001 (isolation, as before)", () => {
    expect(problems('<Component name="A"><Text>{count}</Text></Component>')).toEqual([["C001", "count"]]);
  });

  test("the app file's own body doesn't see the options' globals (only components do)", () => {
    expect(problems("<App><Text>{count}</Text></App>", { globals })).toEqual([["C001", "count"]]);
  });
});

describe("an app file's own globals", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["an inline component sees global.* and <global>", '<Component name="A"><Button label="{a + b}" onClick="a++; b++"/></Component><App global.a="{1}"><global name="b" value="{2}"/><A/></App>', []],
    ["but not the root's var.* (isolation)", '<Component name="A"><Text>{v}</Text></Component><App global.a="{1}" var.v="{2}"><A/></App>', [["C001", "v"]]],
    ["a global initializer reads another global", '<App global.a="{1}" global.b="{a + 1}"/>', []],
    ["a global initializer can't read the root's var.* (accepted divergence)", '<App var.v="{1}" global.b="{v + 1}"/>', [["C001", "v"]]],
    ["the root's var.* reads a global", '<App global.a="{1}" var.v="{a + 1}"/>', []],
    ["a cycle among globals is E005", '<App global.a="{b}" global.b="{a}"/>', [["E005", "global.a"]]],
    ["global.* below the root is E006", '<App><Stack global.a="{1}"/></App>', [["E006", "global.a"]]],
    ["global.* on a <Component> is E006", '<Component name="A" global.a="{1}"><Text/></Component>', [["E006", "global.a"]]],
    ["a global and a var of the same name are E007", '<App global.a="{1}" var.a="{2}"/>', [["E007", "var.a"]]],
    ["a global named like an ID is E012", '<App global.box="{1}"><TextBox id="box"/></App>', [["E012", "global.box"]]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("the root's globals form a container that provides GlobalScope, around the root's own variables", () => {
    const { code } = compileModule('<App global.a="{1}" var.b="{2}"/>', { sourceMap: false });
    expect(code).toContain('const $$v0 = { "a": { init: ($$s) => 1 } };');
    expect(code).toContain('const $$v1 = { "b": { init: ($$s) => 2 } };');
    expect(code).toMatch(/return \$\$h\(\$\$GlobalScope, \{ scope: \$\$c \}, \$\$h\(\$\$K\d+, \{ \$\$p: \$\$c \}\)\);/);
  });

  test("an app without globals renders no GlobalScope", () => {
    const { code } = compileModule('<App var.b="{2}"/>', { sourceMap: false });
    expect(code).not.toContain("$$h($$GlobalScope");
  });
});

describe("Globals.xs (globalsCode)", () => {
  test.each<[label: string, markup: string, globalsCode: string, expected: string[][]]>([
    ["its var and function are visible in the app and in inline components", '<Component name="A"><Button label="{label(n)}" onClick="n++"/></Component><App><Text>{label(n)}</Text><A/></App>', "var n = 1;\nfunction label(x) { return 'n=' + x; }", []],
    ["a function writes a global", "<App><Button onClick=\"bump()\"/></App>", "var n = 0;\nfunction bump() { n++; }", []],
    ["its functions are read-only", "<App><Button onClick=\"bump = 1\"/></App>", "function bump() {}", [["C012", "bump"]]],
    ["it sees global.* of the root", '<App global.a="{1}"/>', "var b = a + 1;", []],
    ["it doesn't see the root's var.*", '<App var.v="{1}"/>', "var b = v + 1;", [["Globals.xs", "C001", "v"]]],
    ["a name declared with global.* too", '<App global.a="{1}"/>', "var a = 2;", [["Globals.xs", "E019", "a"]]],
    ["a name declared with var.* on the root", '<App var.a="{1}"/>', "var a = 2;", [["Globals.xs", "E007", "a"]]],
    ["only var and function at the top level", "<App/>", "let x = 1;", [["Globals.xs", "E019", "let x = 1;"]]],
    ["a parse error is reported in its own positions", "<App/>", "var = ;", [["Globals.xs", "S013", "="]]],
  ])("%s", (_, markup, globalsCode, expected) => {
    expect(problems(markup, { globalsCode })).toEqual(expected);
  });

  test("a name declared in Main.gui.xs too", () => {
    expect(problems("<App/>", { globalsCode: "var a = 1;", codeBehind: "var a = 2;" })).toEqual([["Globals.xs", "E007", "a"]]);
  });

  test("Globals.xs alone makes the global container", () => {
    const { code, globalsDiagnostics } = compileModule("<App/>", { globalsCode: "var n = 1;", sourceMap: false });
    expect(globalsDiagnostics).toEqual([]);
    expect(code).toContain('const $$v0 = { "n": { init: ($$s) => 1 } };');
    expect(code).toContain("$$h($$GlobalScope, { scope: $$c }");
  });

  test("no globalsDiagnostics without globalsCode", () => {
    expect(compileModule("<App/>").globalsDiagnostics).toBeUndefined();
  });
});
