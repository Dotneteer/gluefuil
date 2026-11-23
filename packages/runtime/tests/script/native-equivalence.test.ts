// Cross-check against the JavaScript engine: for every pair of operators, in
// every grouping, the compiled binding must give the same value as native
// JavaScript. This proves the emitter's precedence and parenthesization.
// (Optional chaining doesn't matter here: no operand is null.)
import { expect, test } from "vitest";
import { evaluate } from "./helpers";

const BINARY = ["+", "-", "*", "/", "%", "**", "<<", ">>", ">>>", "&", "|", "^", "<", "<=", "==", "!==", "&&", "||", "??"];
const UNARY = ["-", "+", "!", "~", "typeof "];
const VALUE_SETS = [
  { a: 3, b: 5, c: 2 },
  { a: -7, b: 0, c: 1 },
  { a: 0, b: 2.5, c: -3 },
];

function native(source: string, values: Record<string, unknown>): unknown {
  return new Function(...Object.keys(values), `"use strict"; return (${source});`)(...Object.values(values));
}

function sources(): string[] {
  const out: string[] = [];
  for (const x of BINARY) {
    for (const y of BINARY) {
      out.push(`a ${x} b ${y} c`, `(a ${x} b) ${y} c`, `a ${x} (b ${y} c)`);
    }
    for (const u of UNARY) out.push(`${u}a ${x} b`, `${u}(a ${x} b)`, `a ${x} ${u}b`);
    out.push(`a ${x} b ? b : c`, `a ? b ${x} c : a`, `(x => x ${x} a)(b)`, `[a ${x} b, c][0]`);
  }
  return out;
}

test("compiled bindings agree with native JavaScript on every operator combination", () => {
  const mismatches: string[] = [];
  let compared = 0;
  for (const source of sources()) {
    for (const values of VALUE_SETS) {
      let expected: unknown;
      try {
        expected = native(source, values);
      } catch {
        // Not valid JavaScript (`??` mixed with `||` or `&&`, unary before `**`).
        continue;
      }
      compared++;
      const actual = evaluate(source, values);
      if (!Object.is(actual, expected)) mismatches.push(`${source} with ${JSON.stringify(values)}: ${String(actual)} ≠ ${String(expected)}`);
    }
  }
  expect(mismatches).toEqual([]);
  expect(compared).toBeGreaterThan(3000);
});
