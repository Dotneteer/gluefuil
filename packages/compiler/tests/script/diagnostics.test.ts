// Conformance table: invalid script -> diagnostics (code + the source text it points at).
import { describe, expect, test } from "vitest";
import { parseExpression, parseStatements } from "../../src/script/parse";

type Expected = [code: string, at: string];

function diagnosticsOf(kind: "expr" | "stmts", source: string): Expected[] {
  const { diagnostics } = kind === "expr" ? parseExpression(source) : parseStatements(source);
  for (const d of diagnostics) {
    expect(d.severity).toBe("error");
    expect(d.message).not.toBe("");
  }
  return diagnostics.map((d) => [d.code, source.slice(d.start, d.end)]);
}

const expressionCases: [description: string, source: string, expected: Expected[]][] = [
  ["S001 invalid character (the parser then sees `a b`)", "a @ b", [["S001", "@"], ["S011", "b"]]],
  ["S002 unterminated string", "'abc", [["S002", "'"]]],
  ["S002 string broken by a line break", '"ab\ncd"', [["S002", '"'], ["S011", "cd"]]],
  ["S003 unterminated template", "`abc", [["S003", "`"]]],
  ["S004 unterminated regex", "x = /abc", [["S004", "/"]]],
  ["S005 unterminated comment", "a /* b", [["S005", "/*"]]],
  ["S006 number runs into a name", "3in", [["S006", "3in"]]],
  ["S006 legacy octal", "012", [["S006", "012"]]],
  ["S006 bad separator", "1__0", [["S006", "1__0"]]],
  ["S006 empty hex", "0x", [["S006", "0x"]]],
  ["S007 invalid regex", "/(/", [["S007", "/(/"]]],
  ["S007 invalid regex flag", "/a/qq", [["S007", "/a/qq"]]],
  ["S008 invalid escape", "'\\x4'", [["S008", "\\x"]]],
  ["S010 nothing after an operator", "a +", [["S010", ""]]],
  ["S010 empty input", "", [["S010", ""]]],
  ["S011 extra token", "a b", [["S011", "b"]]],
  ["S011 unary before **", "-a ** b", [["S011", "**"]]],
  ["S011 shorthand initializer outside a pattern", "({ a = 1 })", [["S011", "="]]],
  ["S011 shorthand initializer in a call", "f({ a = 1 })", [["S011", "="]]],
  ["S012 missing ')'", "f(a", [["S012", ""]]],
  ["S012 missing ':'", "a ? b", [["S012", ""]]],
  ["S012 empty parentheses", "()", [["S012", ""]]],
  ["S011 `a.1` is `a` then the number `.1` (as in JavaScript)", "a.1", [["S011", ".1"]]],
  ["S014 assignment to a call", "f() = 1", [["S014", "f()"]]],
  ["S014 assignment to a literal", "1 = a", [["S014", "1"]]],
  ["S014 increment of a call", "f()++", [["S014", "f()"]]],
  ["S014 assignment to an optional chain", "a?.b = 1", [["S014", "a?.b"]]],
  ["S015 parenthesized pattern", "[(a)] = b", []],
  ["S016 rest not last in arrow params", "(...a, b) => a", [["S016", "..."]]],
  ["S021 getter with a parameter", "({ get x(a) { return a } })", [["S021", "get"]]],
  ["S021 setter without a parameter", "({ set x() {} })", [["S021", "set"]]],
  ["S030 this", "this.x", [["S030", "this"]]],
  ["S030 void", "void 0", [["S030", "void"]]],
  ["S030 await (reported, still parsed)", "await f()", [["S030", "await"]]],
  ["S030 async arrow (reported, still parsed)", "async x => x", [["S030", "async"]]],
  ["S030 async arrow with parentheses", "async (x) => x", [["S030", "async"]]],
  ["S030 async function expression", "async function () {}", [["S030", "async"]]],
  ["S030 tagged template", "tag`x`", [["S030", "`x`"]]],
  ["S030 private name", "a.#secret", [["S030", "#secret"]]],
  ["S030 dynamic import", "import('x')", [["S030", "import"]]],
  ["S030 new.target", "new.target", [["S030", "."]]],
  ["S030 class expression", "class {}", [["S030", "class"]]],
];

const statementCases: [description: string, source: string, expected: Expected[]][] = [
  ["S012 missing ';' between statements on one line", "a = 1 b = 2", [["S012", ""]]],
  ["S013 reserved word as a variable name", "let if = 1", [["S013", "if"]]],
  ["S017 const without initializer", "const x;", [["S017", "x"]]],
  ["S017 destructuring without initializer", "let { a };", [["S017", "{ a }"]]],
  ["S018 two default clauses", "switch (x) { default: a(); default: b(); }", [["S018", "default"]]],
  ["S019 try without catch or finally", "try { a() }", [["S019", ""]]],
  ["S020 line break after throw", "throw\nnew Error()", [["S020", "throw"]]],
  ["S030 labeled statement", "outer: for (;;) {}", [["S030", "outer"]]],
  ["S030 break with a label", "while (x) { break outer }", [["S030", "outer"]]],
  ["S030 class declaration", "class A {}", [["S030", "class"]]],
  ["S030 export of something other than a function", "export const x = 1", [["S030", "export"]]],
  ["S030 with", "with (o) {}", [["S030", "with"]]],
  ["S030 debugger", "debugger;", [["S030", "debugger"]]],
  ["S030 generator", "function* g() {}", [["S030", "*"]]],
  ["S030 async function declaration (reported, still parsed)", "async function f() {}", [["S030", "async"]]],
  ["S030 for await", "for await (const x of y) {}", [["S030", "await"]]],
  ["S030 default import", "import a from 'x'", [["S030", "a"]]],
  ["S030 namespace import", "import * as m from 'x'", [["S030", "*"]]],
  ["S030 side-effect import", "import 'x'", [["S030", "'x'"]]],
  ["S012 import path must be a string", "import { a } from b", [["S012", "b"]]],
];

describe("expression diagnostics", () => {
  test.each(expressionCases)("%s", (_, source, expected) => {
    expect(diagnosticsOf("expr", source)).toEqual(expected);
  });
});

describe("statement diagnostics", () => {
  test.each(statementCases)("%s", (_, source, expected) => {
    expect(diagnosticsOf("stmts", source)).toEqual(expected);
  });
});

describe("error recovery in statement lists", () => {
  test("parsing continues after a broken statement", () => {
    const { program, diagnostics } = parseStatements("a = ;\nb = 2\nc(");
    expect(diagnostics.map((d) => d.code)).toEqual(["S010", "S010"]);
    expect(program.body.map((s) => s.type)).toEqual(["ExpressionStatement"]);
  });

  test("an error inside a block does not lose the rest of the block", () => {
    const { program, diagnostics } = parseStatements("{ a = ; b(); }\nc()");
    expect(diagnostics).toHaveLength(1);
    expect(program.body).toHaveLength(2);
  });

  test("recovery skips over template literals, including their substitutions", () => {
    const { program, diagnostics } = parseStatements("class A { m() { return `a ${ {b: `c ${d}`} } e`; } }\nok()");
    expect(diagnostics.map((d) => d.code)).toEqual(["S030"]);
    expect(program.body).toHaveLength(1);
  });

  test("unsupported-but-parsed constructs still yield a tree", () => {
    const { program, diagnostics } = parseStatements("async function f() { await g() }");
    expect(diagnostics.map((d) => d.code)).toEqual(["S030", "S030"]);
    expect(program.body[0]).toMatchObject({ type: "FunctionDeclaration", async: true });
  });

  test("the parser never throws, whatever the input", () => {
    const nasty = ["(", ")", "{", "}", "[", "`${", "`${a", "/", "a => {", "({", "({a=", "for (", "switch (x) {", "try", "import {", "a?.", "new", "...", "=>", "'\\", "x = /[", "#", "@@@"];
    for (const source of nasty) {
      expect(() => parseStatements(source)).not.toThrow();
      expect(() => parseExpression(source)).not.toThrow();
    }
  });
});
