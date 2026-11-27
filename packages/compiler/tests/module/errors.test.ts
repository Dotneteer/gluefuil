// Step 33: the per-element onError (a lifecycle entry), the components that keep
// their own `error` event, and AppError in script.
// Design: .ai/plan/poc-33-errors.md § The error pipeline, decision G.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) =>
  compileModule(markup, { sourceMap: false }).diagnostics.map((d) => [d.severity ?? "error", d.code, markup.slice(d.start, d.end)]);
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;

describe("onError", () => {
  test.each<[string, string, string[][]]>([
    ["on a Button (any element)", '<App var.m=""><Button onError="(e, source) => m = source"/></App>', []],
    ["as an <event>", '<App var.m=""><Stack><event name="error">m = $param.message</event></Stack></App>', []],
    ["on App: its own event", '<App var.m="" onError="(error, event) => event.preventDefault()"/>', []],
    ["on a DataSource: its own event", '<App var.m=""><DataSource id="d" url="/x" onError="e => m = e.code"/></App>', []],
    ["a misspelled event is still E004", '<App><Button onErorr="x = 1"/></App>', [["error", "E004", "onErorr"]]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("on an element without an `error` event, onError is a lifecycle entry, not a component prop", () => {
    const out = code('<App var.m=""><Button label="Go" onClick="throw new Error(\'x\')" onError="(e) => m = e.message"/></App>');
    expect(out).toMatch(/lifecycle: \$\$l\d+/);
    expect(out).toMatch(/\$\$l\d+ = \{ "error": /);
    expect(out).not.toContain('"onError"');
  });

  test("on App and DataSource it stays the component's handler prop", () => {
    expect(code('<App var.m="" onError="(e) => m = e.message"/>')).toContain('"onError"');
    expect(code('<App var.m=""><DataSource id="d" url="/x" onError="(e) => m = e.code"/></App>')).toContain('"onError"');
  });
});

describe("AppError in script", () => {
  test("new AppError({...}) compiles; App.errors is an app global", () => {
    expect(problems('<App><Button onClick="throw new AppError({ code: \'c\', category: \'validation\', message: \'m\' })"/><Text>{App.errors.length}</Text></App>')).toEqual([]);
  });
});
