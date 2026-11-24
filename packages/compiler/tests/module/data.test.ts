// Step 20 in the compiler: DataSource's `when` as a prop, APICall's deferred
// props ($param at call time), `transformResult` as code, a URL with an
// unresolved part, handlers that return results. See .ai/plan/poc-20-data.md.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

const compile = (markup: string) => compileModule(markup, { sourceMap: false });
function ok(markup: string): string {
  const { code, diagnostics } = compile(markup);
  expect(diagnostics).toEqual([]);
  return code;
}
const codes = (markup: string) => compile(markup).diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);

describe("DataSource", () => {
  test("`when` is a prop (the loader stays mounted), not a visibility wrapper", () => {
    const code = ok('<App var.id="{0}"><DataSource id="user" url="/api/users/{id}" when="{id > 0}"/></App>');
    expect(code).not.toContain("$$h($$When");
    expect(code).toMatch(/"when": \(\$\$s\) =>/);
  });

  test("responsive when-* on a DataSource is not supported (E002)", () => {
    expect(codes('<App><DataSource url="/a" when-md="false"/></App>')).toEqual([["E002", "when-md"]]);
  });

  test("a URL with an interpolated part is undefined while a part is null or undefined", () => {
    const code = ok('<App var.id="{null}"><DataSource url="/api/users/{id}/posts"/></App>');
    expect(code).toContain('== null ? undefined : "/api/users/" + $$r.str(');
  });

  test("transformResult: a literal is compiled as code (XMLUI's form); braces work too", () => {
    const literal = ok('<App><DataSource url="/a" transformResult="(data) => data.items"/></App>');
    expect(literal).toMatch(/"transformResult": \(\$\$s\) => \(?\(?data\)? => /);
    ok('<App><DataSource url="/a" transformResult="{(data) => data.items}"/></App>');
    // A syntax error in it is reported where it is.
    expect(codes('<App><DataSource url="/a" transformResult="(data) => "/></App>').map(([code]) => code)).toEqual(["S010"]);
  });
});

describe("APICall", () => {
  test("url and body with $param are deferred: functions of the context, not bindings", () => {
    const code = ok('<App><APICall id="save" method="put" url="/api/users/{$param.id}" body="{$param}"/></App>');
    expect(code).toMatch(/"url": \$\$deferred\(\$\$\w+, \$\$d\d+\)/);
    expect(code).toMatch(/"body": \$\$deferred\(/);
    expect(code).toMatch(/const \$\$d\d+ = \(\$\$s\) => "\/api\/users\/" \+ \$\$r\.str\(/);
    // A literal method stays a plain prop.
    expect(code).toContain('"method": "put"');
  });

  test("$param is known only where it is deferred", () => {
    expect(codes('<App><APICall url="/a" retries="{$param}"/></App>')).toEqual([["C014", "$param"]]);
  });

  test("its handlers return their results to the component", () => {
    const code = ok('<App><APICall id="save" url="/a" onBeforeRequest="(x) => x > 0" onSuccess="() => false"/></App>');
    expect(code).toContain("results: true");
  });

  test("other components' handlers don't", () => {
    expect(ok('<App><Button label="x" onClick="() => 1"/></App>')).not.toContain("results: true");
  });
});
