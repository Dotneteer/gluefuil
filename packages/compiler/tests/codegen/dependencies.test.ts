// Dependencies: the scope names a binding reads (sorted). Locals and globals are not dependencies.
import { expect, test } from "vitest";
import { compile } from "./helpers";

test.each<[source: string, dependencies: string[]]>([
  ["1 + 2", []],
  ["a + b", ["a", "b"]],
  ["a + a * a", ["a"]],
  ["b + a", ["a", "b"]],
  ["user.address.city", ["user"]],
  ["$item.name", ["$item"]],
  ["Math.max(a, NaN)", ["a"]],
  ["f(a)", ["a", "f"]],
  ["`${a} and ${b}`", ["a", "b"]],
  ["{ a, b: c }", ["a", "c"]],
  ["items[a]", ["a", "items"]],
  // Reads inside callbacks count: the callback runs while the binding is evaluated.
  ["items.filter(i => i.price > minPrice)", ["items", "minPrice"]],
  ["items.map(function (i) { return i * c })", ["c", "items"]],
  // Locals shadow scope names...
  ["((a) => a)(b)", ["b"]],
  ["items.map(items => items)", ["items"]],
  ["(() => { let a = 1; return a })()", []],
  ["(() => { try { } catch (a) { return a } })()", []],
  ["(({ x = c }) => x)({})", ["c"]],
  // ...only inside their own block.
  ["(() => { { let a = 1 } return a })()", ["a"]],
  ["(() => { for (let a of items) {} return a })()", ["a", "items"]],
])("%s", (source, dependencies) => {
  const result = compile(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.dependencies).toEqual(dependencies);
});
