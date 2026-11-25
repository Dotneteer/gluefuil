// Conformance table: expressions -> structure (S-expressions, see print.ts).
// This table is part of the written specification of gfui script.
import { describe, expect, test } from "vitest";
import { parseExpression } from "../../src/script/parse";
import { print } from "./print";

function check(cases: [source: string, expected: string][]) {
  test.each(cases)("%s", (source, expected) => {
    const { expression, diagnostics } = parseExpression(source);
    expect(diagnostics).toEqual([]);
    expect(print(expression)).toBe(expected);
  });
}

describe("literals", () => {
  check([
    ["42", "42"],
    ["3.14", "3.14"],
    [".5", ".5"],
    ["1e3", "1e3"],
    ["2.5E-2", "2.5E-2"],
    ["0xFF", "0xFF"],
    ["0b1010", "0b1010"],
    ["0o17", "0o17"],
    ["1_000_000", "1_000_000"],
    ["10n", "10n"],
    ['"double"', '"double"'],
    ["'single'", "'single'"],
    ["true", "true"],
    ["false", "false"],
    ["null", "null"],
    ["undefined", "undefined"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["/ab+c/gi", "/ab+c/gi"],
    ["/[/]/", "/[/]/"],
    ["/a\\/b/", "/a\\/b/"],
  ]);
});

describe("literal values", () => {
  test.each([
    ["42", 42],
    ["0xFF", 255],
    ["0b101", 5],
    ["0o17", 15],
    ["1_000", 1000],
    ["1e3", 1000],
    ['"a\\nb"', "a\nb"],
    ['"\\x41\\u0042\\u{43}"', "ABC"],
    ["'it\\'s'", "it's"],
    ['"tab\\there"', "tab\there"],
    ['"line\\\ncontinued"', "linecontinued"],
  ])("%s", (source, value) => {
    const { expression } = parseExpression(source);
    expect(expression).toMatchObject({ type: "Literal", value });
  });

  test("BigInt literal value", () => {
    expect(parseExpression("123n").expression).toMatchObject({ type: "Literal", value: 123n, bigint: "123" });
  });

  test("regex literal parts", () => {
    expect(parseExpression("/a[b/]c/gu").expression).toMatchObject({ regex: { pattern: "a[b/]c", flags: "gu" } });
  });
});

describe("template literals", () => {
  check([
    ["`plain`", '(template "plain")'],
    ["`a${x}b`", '(template "a" x "b")'],
    ["`${x}`", "(template x)"],
    ["`${a}${b}`", "(template a b)"],
    ["`sum: ${a + b}!`", '(template "sum: " (+ a b) "!")'],
    ["`outer ${`inner ${x}`}`", '(template "outer " (template "inner " x))'],
    ["`obj ${ {a: 1}.a }`", '(template "obj " (. (object (prop a 1)) a))'],
    ["`line1\nline2`", '(template "line1\\nline2")'],
    ["`esc \\` \\${x}`", '(template "esc ` ${x}")'],
  ]);
});

describe("operator precedence and associativity", () => {
  check([
    ["a + b * c", "(+ a (* b c))"],
    ["(a + b) * c", "(* (+ a b) c)"],
    ["a - b - c", "(- (- a b) c)"],
    ["a ** b ** c", "(** a (** b c))"],
    ["(-a) ** b", "(** (- a) b)"],
    ["2 ** -1", "(** 2 (- 1))"],
    ["a || b && c", "(|| a (&& b c))"],
    ["a ?? b", "(?? a b)"],
    ["a | b ^ c & d", "(| a (^ b (& c d)))"],
    ["a == b < c", "(== a (< b c))"],
    ["a === b !== c", "(!== (=== a b) c)"],
    ["a << 1 + b", "(<< a (+ 1 b))"],
    ["a >>> 2", "(>>> a 2)"],
    ["a in b", "(in a b)"],
    ["a instanceof B", "(instanceof a B)"],
    ["a < b > c", "(> (< a b) c)"],
    ["a % b / c", "(/ (% a b) c)"],
    ["a ? b : c", "(? a b c)"],
    ["a ? b : c ? d : e", "(? a b (? c d e))"],
    ["a ? b ? c : d : e", "(? a (? b c d) e)"],
    ["a || b ? c : d", "(? (|| a b) c d)"],
    ["a, b, c", "(, a b c)"],
  ]);
});

describe("unary and update", () => {
  check([
    ["!a", "(! a)"],
    ["!!a", "(! (! a))"],
    ["-a", "(- a)"],
    ["+a", "(+ a)"],
    ["~a", "(~ a)"],
    ["typeof a", "(typeof a)"],
    ["typeof a === 'string'", "(=== (typeof a) 'string')"],
    ["delete a.b", "(delete (. a b))"],
    ["++a", "(++ a)"],
    ["a++", "(++post a)"],
    ["a.b--", "(--post (. a b))"],
    ["-a++", "(- (++post a))"],
    ["a - -b", "(- a (- b))"],
  ]);
});

describe("assignment", () => {
  check([
    ["a = 1", "(= a 1)"],
    ["a = b = c", "(= a (= b c))"],
    ["a.b = 1", "(= (. a b) 1)"],
    ["a[i] = 1", "(= (.[] a i) 1)"],
    ["(a) = 1", "(= a 1)"],
    ["a += 1", "(+= a 1)"],
    ["a -= 1", "(-= a 1)"],
    ["a **= 2", "(**= a 2)"],
    ["a >>>= 1", "(>>>= a 1)"],
    ["a &&= b", "(&&= a b)"],
    ["a ||= b", "(||= a b)"],
    ["a ??= b", "(??= a b)"],
    ["[a, b] = [b, a]", "(= (arrpat a b) (array b a))"],
    ["[a, , b] = c", "(= (arrpat a _ b) c)"],
    ["[a, ...rest] = c", "(= (arrpat a (... rest)) c)"],
    ["[a = 1] = c", "(= (arrpat (default a 1)) c)"],
    ["({ a, b: c } = obj)", "(= (objpat (prop a) (prop b c)) obj)"],
    ["({ a = 1, b: { c } } = obj)", "(= (objpat (prop a (default a 1)) (prop b (objpat (prop c)))) obj)"],
    ["({ a, ...rest } = obj)", "(= (objpat (prop a) (... rest)) obj)"],
    ["[o.x, o[y]] = c", "(= (arrpat (. o x) (.[] o y)) c)"],
    ["[{ a = 1 }] = c", "(= (arrpat (objpat (prop a (default a 1)))) c)"],
  ]);
});

describe("member access, calls, new, optional chaining", () => {
  check([
    ["a.b.c", "(. (. a b) c)"],
    ["a[b][c]", "(.[] (.[] a b) c)"],
    ["a.default.new", "(. (. a default) new)"],
    ["f()", "(call f)"],
    ["f(a, b)", "(call f a b)"],
    ["f(...args, x)", "(call f (... args) x)"],
    ["f(a,)", "(call f a)"],
    ["a.b(c).d", "(. (call (. a b) c) d)"],
    ["f()()", "(call (call f))"],
    ["new Date()", "(new Date)"],
    ["new Date", "(new Date)"],
    ["new Date(2020, 1)", "(new Date 2020 1)"],
    ["new a.B()", "(new (. a B))"],
    ["new Date().getTime()", "(call (. (new Date) getTime))"],
    ["a?.b", "(chain (?. a b))"],
    ["a?.[b]", "(chain (?.[] a b))"],
    ["a?.()", "(chain (call?. a))"],
    ["a?.b.c", "(chain (. (?. a b) c))"],
    ["a?.b()", "(chain (call (?. a b)))"],
    ["(a?.b).c", "(. (chain (?. a b)) c)"],
    ["a ?.5 : 1", "(? a .5 1)"],
  ]);
});

describe("array and object literals", () => {
  check([
    ["[]", "(array)"],
    ["[1, 2, 3]", "(array 1 2 3)"],
    ["[1, , 3]", "(array 1 _ 3)"],
    ["[1, 2,]", "(array 1 2)"],
    ["[...a, ...b]", "(array (... a) (... b))"],
    ["{}", "(object)"],
    ["{ a: 1, 'b': 2, 3: 4 }", "(object (prop a 1) (prop 'b' 2) (prop 3 4))"],
    ["{ a, b }", "(object (prop a) (prop b))"],
    ["{ [k]: v }", "(object (prop [k] v))"],
    ["{ ...a, b: 1 }", "(object (... a) (prop b 1))"],
    ["{ if: 1, default: 2, new: 3 }", "(object (prop if 1) (prop default 2) (prop new 3))"],
    ["{ get: 1, set: 2, async: 3 }", "(object (prop get 1) (prop set 2) (prop async 3))"],
    ["{ get label() { return x; } }", "(object (get label (function _ (params) (block (return x)))))"],
    ["{ set selected(v) { x = v; } }", "(object (set selected (function _ (params v) (block (= x v)))))"],
    ["{ m(a) { return a; } }", "(object (method m (function _ (params a) (block (return a)))))"],
    ["{ a: 1, }", "(object (prop a 1))"],
    ["{ a: { b: [1, { c: 2 }] } }", "(object (prop a (object (prop b (array 1 (object (prop c 2)))))))"],
  ]);
});

describe("functions and arrows", () => {
  check([
    ["x => x + 1", "(=> (params x) (+ x 1))"],
    ["() => 1", "(=> (params) 1)"],
    ["(a, b) => a + b", "(=> (params a b) (+ a b))"],
    ["(a, b,) => a", "(=> (params a b) a)"],
    ["(a = 1, ...rest) => a", "(=> (params (default a 1) (... rest)) a)"],
    ["({ a, b }) => a", "(=> (params (objpat (prop a) (prop b))) a)"],
    ["({ a = 1 }) => a", "(=> (params (objpat (prop a (default a 1)))) a)"],
    ["([a, b]) => a", "(=> (params (arrpat a b)) a)"],
    ["() => ({ a: 1 })", "(=> (params) (object (prop a 1)))"],
    ["() => { return 1; }", "(=> (params) (block (return 1)))"],
    ["a => b => a + b", "(=> (params a) (=> (params b) (+ a b)))"],
    ["x => x ? 1 : 2", "(=> (params x) (? x 1 2))"],
    ["function () { return 1; }", "(function _ (params) (block (return 1)))"],
    ["function named(a, b) {}", "(function named (params a b) (block))"],
    ["items.map(item => item.name)", "(call (. items map) (=> (params item) (. item name)))"],
    ["items.filter((x, i) => i > 0)", "(call (. items filter) (=> (params x i) (> i 0)))"],
    ["async(1, 2)", "(call async 1 2)"],
    // Divergence from JavaScript (XMLUI-compatible): a line break before `=>` is allowed.
    ["files.reduce((widest, file)\n  => Math.max(widest, file.length), 0)", "(call (. files reduce) (=> (params widest file) (call (. Math max) widest (. file length))) 0)"],
  ]);
});

describe("XMLUI-style expressions (from real apps)", () => {
  check([
    ["$item.name", "(. $item name)"],
    ["$props.value ?? '[no value]'", "(?? (. $props value) '[no value]')"],
    ["users.value.length > 0", "(> (. (. users value) length) 0)"],
    ["{ station: 'Brixton', wifi: true }", "(object (prop station 'Brixton') (prop wifi true))"],
    ["(newTheme) => setTheme(newTheme)", "(=> (params newTheme) (call setTheme newTheme))"],
    ["mediaSize.sizeIndex > 2 ? 'wide' : 'narrow'", "(? (> (. mediaSize sizeIndex) 2) 'wide' 'narrow')"],
    ["count++", "(++post count)"],
    ["`${$item.firstName} ${$item.lastName}`", '(template (. $item firstName) " " (. $item lastName))'],
  ]);
});

describe("comments and whitespace", () => {
  check([
    ["a /* inline */ + b", "(+ a b)"],
    ["a // trailing\n + b", "(+ a b)"],
    ["\n  a\n  +\n  b\n", "(+ a b)"],
  ]);
});

describe("regex vs division", () => {
  check([
    ["a / b / c", "(/ (/ a b) c)"],
    ["a /= 2", "(/= a 2)"],
    ["x = /=/", "(= x /=/)"],
    ["f(/a/, 1)", "(call f /a/ 1)"],
    ["[/a/g]", "(array /a/g)"],
    ["a ? /x/ : /y/", "(? a /x/ /y/)"],
    ["s.replace(/\\s+/g, ' ')", "(call (. s replace) /\\s+/g ' ')"],
  ]);
});
