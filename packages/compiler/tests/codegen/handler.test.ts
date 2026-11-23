// compileHandler: handler shapes and how writes compile. Behavior (running
// handlers against real variables) is tested in the components package.
import { describe, expect, test } from "vitest";
import { compileHandler } from "../../src/codegen/compile";
import { parseStatements } from "../../src/script/parse";

const VARIABLES = new Set(["count", "name", "settings", "items", "a", "b"]);
const SCOPE = new Set([...VARIABLES, "save", "api", "toast"]);

function compile(source: string) {
  const { program, diagnostics } = parseStatements(source);
  expect(diagnostics).toEqual([]);
  return compileHandler(program, { scope: SCOPE, variables: VARIABLES });
}

function check(cases: [source: string, expected: string][]) {
  test.each(cases)("%s", (source, expected) => {
    const result = compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toBe(`($$s) => ${expected}`);
    expect(() => new Function("$$g", "$$r", `"use strict"; return (${result.code});`)).not.toThrow();
  });
}

describe("handler shapes", () => {
  check([
    ["", "(...$params) => { const $param = $params[0]; }"],
    ["count++", "(...$params) => { const $param = $params[0]; $$s.count++; }"],
    ["count++; toast('done')", "(...$params) => { const $param = $params[0]; $$s.count++; (0, $$s.toast)?.('done'); }"],
    // A lone arrow or function is the handler itself.
    ["(item) => items.push(item)", '(item) => $$r.mutate($$s, "items", [], "push", [item])'],
    ["(function (v) { count = v })", "function(v) { $$s.count = v; }"],
    // A lone reference means "call it with the event arguments".
    ["save", "(...$params) => (0, $$s.save)?.(...$params)"],
    ["api.save", "(...$params) => $$s.api?.save?.(...$params)"],
    // $param and $params are locals.
    ["count = $param ?? $params.length", "(...$params) => { const $param = $params[0]; $$s.count = $param ?? $params?.length; }"],
  ]);
});

describe("writing variables", () => {
  check([
    // Through the scope's setter: plain JavaScript semantics.
    ["count = 1", "(...$params) => { const $param = $params[0]; $$s.count = 1; }"],
    ["count += 2", "(...$params) => { const $param = $params[0]; $$s.count += 2; }"],
    ["name ??= 'x'", "(...$params) => { const $param = $params[0]; $$s.name ??= 'x'; }"],
    ["[a, b] = [b, a]", "(...$params) => { const $param = $params[0]; [$$s.a, $$s.b] = [$$s.b, $$s.a]; }"],
    ["({ a, b } = settings)", "(...$params) => { const $param = $params[0]; ({ a: $$s.a, b: $$s.b } = $$s.settings); }"],
    // Paths rooted at a variable: copy-on-write helpers.
    ["settings.size = 3", '(...$params) => { const $param = $params[0]; $$r.setIn($$s, "settings", ["size"], 3); }'],
    [
      "settings.size *= 2",
      '(...$params) => { const $param = $params[0]; $$r.setIn($$s, "settings", ["size"], $$s.settings?.["size"] * 2); }',
    ],
    [
      "settings.title ||= 'untitled'",
      '(...$params) => { const $param = $params[0]; ($$s.settings?.["title"] || $$r.setIn($$s, "settings", ["title"], \'untitled\')); }',
    ],
    ["settings.tags[0] = 't'", '(...$params) => { const $param = $params[0]; $$r.setIn($$s, "settings", ["tags", 0], \'t\'); }'],
    // A computed key is evaluated once, and checked.
    [
      "settings.byId[name] += 1",
      '(...$params) => { const $param = $params[0]; (($$k0) => $$r.setIn($$s, "settings", ["byId", $$k0], $$s.settings?.["byId"]?.[$$k0] + 1))($$r.key($$s.name)); }',
    ],
    ["settings.count++", '(...$params) => { const $param = $params[0]; $$r.updateIn($$s, "settings", ["count"], 1, false); }'],
    ["--settings.count", '(...$params) => { const $param = $params[0]; $$r.updateIn($$s, "settings", ["count"], -1, true); }'],
    ["delete settings.old", '(...$params) => { const $param = $params[0]; $$r.deleteIn($$s, "settings", ["old"]); }'],
    // Array mutators on a variable path.
    ["items.push(1, ...[2])", '(...$params) => { const $param = $params[0]; $$r.mutate($$s, "items", [], "push", [1, ...[2]]); }'],
    ["settings.tags.splice(0, 1)", '(...$params) => { const $param = $params[0]; $$r.mutate($$s, "settings", ["tags"], "splice", [0, 1]); }'],
    // Non-mutating methods and locals are ordinary code.
    ["count = items.map(x => x * 2).length", "(...$params) => { const $param = $params[0]; $$s.count = $$s.items?.map?.((x) => x * 2)?.length; }"],
    ["const copy = [...items]; copy.push(1); items = copy", "(...$params) => { const $param = $params[0]; const copy = [...$$s.items]; copy?.push?.(1); $$s.items = copy; }"],
    // Writes inside callbacks of a handler are handler writes too.
    ["[1, 2].forEach(n => count += n)", "(...$params) => { const $param = $params[0]; [1, 2]?.forEach?.((n) => $$s.count += n); }"],
  ]);
});

describe("diagnostics", () => {
  test.each<[source: string, expected: [code: string, text: string][]]>([
    ["save = null", [["C012", "save"]]],
    ["api.url = 'x'", [["C012", "api.url = 'x'"]]],
    ["missing = 1", [["C001", "missing"]]],
    ["Math.PI = 3", [["C010", "Math.PI = 3"]]],
    ["[settings.a] = [1]", [["C013", "settings.a"]]],
    ["for (settings.x of [1]) {}", [["C013", "for (settings.x of [1]) {}"]]],
    ["settings.constructor = 1", [["C003", "constructor"]]],
    ["var x = 1", [["C007", "var x = 1"]]],
  ])("%s", (source, expected) => {
    const { diagnostics } = compile(source);
    expect(diagnostics.map((d) => [d.code, source.slice(d.start, d.end)])).toEqual(expected);
  });
});
