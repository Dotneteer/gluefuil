// Conformance table: statement lists (handlers, <event>, <script>, code-behind).
import { describe, expect, test } from "vitest";
import { parseStatements } from "../../src/script/parse";
import { print } from "./print";

function check(cases: [source: string, expected: string][]) {
  test.each(cases)("%s", (source, expected) => {
    const { program, diagnostics } = parseStatements(source);
    expect(diagnostics).toEqual([]);
    expect(print(program)).toBe(expected);
  });
}

describe("statements", () => {
  check([
    ["", ""],
    [";", "(empty)"],
    ["count++", "(++post count)"],
    ["{ a; b; }", "(block a b)"],
    ["var x = 1;", "(var (= x 1))"],
    ["let x, y = 2;", "(let x (= y 2))"],
    ["const { a, b: [c] } = obj;", "(const (= (objpat (prop a) (prop b (arrpat c))) obj))"],
    ["let [x = 1, ...rest] = arr", "(let (= (arrpat (default x 1) (... rest)) arr))"],
    ["function add(a, b = 1) { return a + b; }", "(function add (params a (default b 1)) (block (return (+ a b))))"],
    ["function f({ a }, ...rest) {}", "(function f (params (objpat (prop a)) (... rest)) (block))"],
    ["if (a) b();", "(if a (call b))"],
    ["if (a) b(); else c();", "(if a (call b) (call c))"],
    ["if (a) { b } else if (c) { d } else { e }", "(if a (block b) (if c (block d) (block e)))"],
    ["while (i < 10) i++;", "(while (< i 10) (++post i))"],
    ["do { i++ } while (i < 10)", "(do (block (++post i)) (< i 10))"],
    ["do i++; while (i < 10); x", "(do (++post i) (< i 10)) x"],
    ["for (let i = 0; i < n; i++) sum += i;", "(for (let (= i 0)) (< i n) (++post i) (+= sum i))"],
    ["for (;;) {}", "(for _ _ _ (block))"],
    ["for (i = 0, j = 1; ; ) {}", "(for (, (= i 0) (= j 1)) _ _ (block))"],
    ["for (const item of items) total += item.price;", "(for-of (const item) items (+= total (. item price)))"],
    ["for (const [k, v] of Object.entries(o)) {}", "(for-of (const (arrpat k v)) (call (. Object entries) o) (block))"],
    ["for (const key in obj) {}", "(for-in (const key) obj (block))"],
    ["for (x of xs) {}", "(for-of x xs (block))"],
    ["for (let i = 0, n = a.length; i < n; i++) {}", "(for (let (= i 0) (= n (. a length))) (< i n) (++post i) (block))"],
    ["for (let i = ('x' in o) ? 1 : 0; i < 2; i++) {}", "(for (let (= i (? (in 'x' o) 1 0))) (< i 2) (++post i) (block))"],
    ["while (true) { if (x) break; else continue; }", "(while true (block (if x (break) (continue))))"],
    ["return;", "(return)"],
    ["return a + b;", "(return (+ a b))"],
    ["throw new Error('bad');", "(throw (new Error 'bad'))"],
    ["try { a() } catch (e) { b(e) }", "(try (block (call a)) (catch e (block (call b e))) _)"],
    ["try { a() } catch { b() }", "(try (block (call a)) (catch _ (block (call b))) _)"],
    ["try { a() } finally { c() }", "(try (block (call a)) _ (block (call c)))"],
    ["try { a() } catch ({ message }) { } finally { }", "(try (block (call a)) (catch (objpat (prop message)) (block)) (block))"],
    [
      "switch (x) { case 1: a(); break; case 2: case 3: b(); default: c(); }",
      "(switch x (case 1 (call a) (break)) (case 2) (case 3 (call b)) (default (call c)))",
    ],
    ['import { a, b as c } from "./helpers.xs";', '(import a (as b c) "./helpers.xs")'],
    ["import { } from './x'", "(import './x')"],
    ["export function pageTitle(title) { return `Title: ${title}`; }", '(export (function pageTitle (params title) (block (return (template "Title: " title)))))'],
  ]);
});

describe("automatic semicolon insertion", () => {
  check([
    ["a\nb", "a b"],
    ["count++\ntoast('done')", "(++post count) (call toast 'done')"],
    ["a = 1\nb = 2", "(= a 1) (= b 2)"],
    ["{ a } b", "(block a) b"],
    ["let x = 1\nlet y = 2", "(let (= x 1)) (let (= y 2))"],
    // A line break does NOT end a statement when the next line continues it:
    ["a\n.b", "(. a b)"],
    ["a\n+ b", "(+ a b)"],
    ["a\n(b)", "(call a b)"],
    // Restricted productions:
    ["return\na", "(return) a"],
    ["a\n++b", "a (++ b)"],
    ["while (x) { break\n}", "(while x (block (break)))"],
    ["function f() { return }", "(function f (params) (block (return)))"],
  ]);
});

describe("handler-shaped statement lists (from real XMLUI apps)", () => {
  check([
    ["count++; emitEvent('incremented', count)", "(++post count) (call emitEvent 'incremented' count)"],
    ["() => { preview.setValue(JSON.stringify($data)) }", "(=> (params) (block (call (. preview setValue) (call (. JSON stringify) $data))))"],
    ["{ count++ }", "(block (++post count))"],
    ["save", "save"],
    ["deleteItem.execute($item.id); toast('Deleted');", "(call (. deleteItem execute) (. $item id)) (call toast 'Deleted')"],
    [
      "var parsedCsv = null;\n\nfunction isDuplicate(name) {\n  return existingProducts.value.some(p => p.name === name);\n}",
      "(var (= parsedCsv null)) (function isDuplicate (params name) (block (return (call (. (. existingProducts value) some) (=> (params p) (=== (. p name) name))))))",
    ],
    ["(clickCount) => text += ' ' + clickCount", "(=> (params clickCount) (+= text (+ ' ' clickCount)))"],
  ]);
});
