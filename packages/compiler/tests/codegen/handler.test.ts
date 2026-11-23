// compileHandler: handler shapes, implicit await, and how writes compile.
// Behavior (running handlers against real variables) is tested in the
// components package.
import { describe, expect, test } from "vitest";
import { compileHandler } from "../../src/codegen/compile";
import { parseStatements } from "../../src/script/parse";

const VARIABLES = new Set(["count", "name", "settings", "items", "a", "b"]);
const SCOPE = new Set([...VARIABLES, "save", "api", "toast", "delay"]);

function compile(source: string) {
  const { program, diagnostics } = parseStatements(source);
  expect(diagnostics).toEqual([]);
  return compileHandler(program, { scope: SCOPE, variables: VARIABLES });
}

const AWAIT_PREFIX = "($$r.th($$t = ";
const AWAIT_SUFFIX = ") ? ($$o && ($$o = false, $$x.close()), $$t = await $$t, $$x.open(), $$o = true, $$t) : $$t)";

/**
 * Makes generated handler code readable for the tables:
 *   - each conditional await becomes ⟪expression⟫;
 *   - the async body brackets `let $$t, $$o = false; try { … } finally { … }` are removed;
 *   - the prologue (`const $param…`, `const $cancel…`) and `($$x) => ` are removed.
 */
function simplify(code: string): string {
  let text = code;
  for (let at = text.lastIndexOf(AWAIT_PREFIX); at !== -1; at = text.lastIndexOf(AWAIT_PREFIX)) {
    const innerStart = at + AWAIT_PREFIX.length;
    let depth = 0;
    let end = innerStart;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) break;
        depth--;
      }
    }
    expect(text.startsWith(AWAIT_SUFFIX, end)).toBe(true);
    text = `${text.slice(0, at)}⟪${text.slice(innerStart, end)}⟫${text.slice(end + AWAIT_SUFFIX.length)}`;
  }
  return text
    .replaceAll("let $$t, $$o = false; try { ", "")
    .replaceAll("let $$t, $$o = false; try {", "")
    .replaceAll(" } finally { $$o && $$x.close(); }", "")
    .replaceAll("const $param = $params[0]; ", "")
    .replaceAll("const $cancel = $$x.cancel; ", "")
    .replace(/^\(\$\$s\) => \(\$\$x\) => /, "");
}

function check(cases: [source: string, expected: string][]) {
  test.each(cases)("%s", (source, expected) => {
    const result = compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(simplify(result.code)).toBe(expected);
    expect(() => new Function("$$g", "$$r", `"use strict"; return (${result.code});`)).not.toThrow();
  });
}

test("the full shape of a statement handler", () => {
  expect(compile("count++; save()").code).toBe(
    "($$s) => ($$x) => async (...$params) => { const $param = $params[0]; const $cancel = $$x.cancel; " +
      "let $$t, $$o = false; try { $$s.count++; " +
      `${AWAIT_PREFIX}(0, $$s.save)?.()${AWAIT_SUFFIX}; } finally { $$o && $$x.close(); } }`,
  );
});

describe("handler shapes", () => {
  check([
    ["", "async (...$params) => { }"],
    ["count++", "async (...$params) => { $$s.count++; }"],
    ["count++; toast('done')", "async (...$params) => { $$s.count++; ⟪(0, $$s.toast)?.('done')⟫; }"],
    // A lone arrow or function is the handler itself (made async: implicit await applies).
    ["(item) => items.push(item)", 'async (item) => { return $$r.mutate($$s, "items", [], "push", [item]); }'],
    ["(item) => save(item)", "async (item) => { return ⟪(0, $$s.save)?.(item)⟫; }"],
    ["(function (v) { count = v })", "async function(v) { $$s.count = v; }"],
    // A lone reference means "call it with the event arguments".
    ["save", "async (...$params) => { ⟪(0, $$s.save)?.(...$params)⟫; }"],
    ["api.save", "async (...$params) => { ⟪$$s.api?.save?.(...$params)⟫; }"],
    // $param, $params and $cancel are locals.
    ["count = $param ?? $params.length", "async (...$params) => { $$s.count = $param ?? $params?.length; }"],
    ["if ($cancel.aborted) return", "async (...$params) => { if ($cancel?.aborted) { return; } }"],
  ]);
});

describe("implicit and explicit await", () => {
  check([
    // Every call in the handler body is awaited if (and only if) it returns a thenable.
    ["const data = api.load(); count = data.length", "async (...$params) => { const data = ⟪$$s.api?.load?.()⟫; $$s.count = data?.length; }"],
    ["save(api.load(1))", "async (...$params) => { ⟪(0, $$s.save)?.(⟪$$s.api?.load?.(1)⟫)⟫; }"],
    // Explicit await: the same (an await of a call is just the call).
    ["await delay(10)", "async (...$params) => { ⟪(0, $$s.delay)?.(10)⟫; }"],
    ["count = await name", "async (...$params) => { $$s.count = ⟪$$s.name⟫; }"],
    // Nested functions are synchronous...
    ["count = items.filter(x => x > a).length", 'async (...$params) => { $$s.count = ⟪$$r.arr($$s.items, "filter", [(x) => x > $$s.a])⟫?.length; }'],
    // ...unless they use await: then they are async with their own segment brackets.
    ["items.forEach(async_ => { await save(async_) })".replace(/async_/g, "x"), 'async (...$params) => { ⟪$$r.arr($$s.items, "forEach", [async (x) => { ⟪(0, $$s.save)?.(x)⟫; }])⟫; }'],
    ["const f = (x) => await save(x); f(1)", "async (...$params) => { const f = async (x) => { return ⟪(0, $$s.save)?.(x)⟫; }; ⟪f?.(1)⟫; }"],
    ["function g() { return api.load() } g()", "async (...$params) => { function g() { return $$s.api?.load?.(); } ⟪g?.()⟫; }"],
    // Async-aware array methods: map, forEach, filter, every, some, find, findIndex, flatMap.
    ["items.map(x => save(x))", 'async (...$params) => { ⟪$$r.arr($$s.items, "map", [(x) => (0, $$s.save)?.(x)])⟫; }'],
    // Other methods are plain calls.
    ["items.slice(1).join(',')", "async (...$params) => { ⟪⟪$$s.items?.slice?.(1)⟫?.join?.(',')⟫; }"],
  ]);
});

describe("writing variables", () => {
  check([
    // Through the scope's setter: plain JavaScript semantics.
    ["count = 1", "async (...$params) => { $$s.count = 1; }"],
    ["count += 2", "async (...$params) => { $$s.count += 2; }"],
    ["name ??= 'x'", "async (...$params) => { $$s.name ??= 'x'; }"],
    ["[a, b] = [b, a]", "async (...$params) => { [$$s.a, $$s.b] = [$$s.b, $$s.a]; }"],
    ["({ a, b } = settings)", "async (...$params) => { ({ a: $$s.a, b: $$s.b } = $$s.settings); }"],
    // Paths rooted at a variable: copy-on-write helpers (not awaited: they are synchronous).
    ["settings.size = 3", 'async (...$params) => { $$r.setIn($$s, "settings", ["size"], 3); }'],
    ["settings.size *= 2", 'async (...$params) => { $$r.setIn($$s, "settings", ["size"], $$s.settings?.["size"] * 2); }'],
    [
      "settings.title ||= 'untitled'",
      'async (...$params) => { ($$s.settings?.["title"] || $$r.setIn($$s, "settings", ["title"], \'untitled\')); }',
    ],
    ["settings.tags[0] = 't'", 'async (...$params) => { $$r.setIn($$s, "settings", ["tags", 0], \'t\'); }'],
    // A computed key is evaluated once, and checked.
    [
      "settings.byId[name] += 1",
      'async (...$params) => { (($$k0) => $$r.setIn($$s, "settings", ["byId", $$k0], $$s.settings?.["byId"]?.[$$k0] + 1))($$r.key($$s.name)); }',
    ],
    ["settings.count++", 'async (...$params) => { $$r.updateIn($$s, "settings", ["count"], 1, false); }'],
    ["--settings.count", 'async (...$params) => { $$r.updateIn($$s, "settings", ["count"], -1, true); }'],
    ["delete settings.old", 'async (...$params) => { $$r.deleteIn($$s, "settings", ["old"]); }'],
    // Array mutators on a variable path.
    ["items.push(1, ...[2])", 'async (...$params) => { $$r.mutate($$s, "items", [], "push", [1, ...[2]]); }'],
    ["settings.tags.splice(0, 1)", 'async (...$params) => { $$r.mutate($$s, "settings", ["tags"], "splice", [0, 1]); }'],
    // An awaited value written to a variable.
    ["items = api.load()", "async (...$params) => { $$s.items = ⟪$$s.api?.load?.()⟫; }"],
    // Locals and callbacks.
    ["const copy = [...items]; copy.push(1); items = copy", "async (...$params) => { const copy = [...$$s.items]; ⟪copy?.push?.(1)⟫; $$s.items = copy; }"],
    ["[1, 2].forEach(n => count += n)", 'async (...$params) => { ⟪$$r.arr([1, 2], "forEach", [(n) => $$s.count += n])⟫; }'],
  ]);
});

describe("diagnostics", () => {
  test.each<[source: string, expected: [code: string, text: string][]]>([
    ["save = null", [["C012", "save"]]],
    ["delay = null", [["C012", "delay"]]],
    ["api.url = 'x'", [["C012", "api.url = 'x'"]]],
    ["missing = 1", [["C001", "missing"]]],
    ["Math.PI = 3", [["C010", "Math.PI = 3"]]],
    ["[settings.a] = [1]", [["C013", "settings.a"]]],
    ["for (settings.x of [1]) {}", [["C013", "for (settings.x of [1]) {}"]]],
    ["settings.constructor = 1", [["C003", "constructor"]]],
    ["var x = 1", [["C007", "var x = 1"]]],
    // A getter cannot be async.
    ["const o = { get v() { return await save() } }", [["C009", "await save()"]]],
  ])("%s", (source, expected) => {
    const { diagnostics } = compile(source);
    expect(diagnostics.map((d) => [d.code, source.slice(d.start, d.end)])).toEqual(expected);
  });
});
