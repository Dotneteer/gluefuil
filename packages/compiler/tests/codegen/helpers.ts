import { compileExpression, type CompileResult } from "../../src/codegen/compile";
import type { ScopeNames } from "../../src/codegen/emitter";
import { parseExpression } from "../../src/script/parse";

/** The scope most tables use. */
export const SCOPE: ReadonlySet<string> = new Set(["a", "b", "c", "count", "items", "user", "minPrice", "f", "toast", "$item", "top"]);

/** Parses and compiles; a syntax error fails the test (these tables test code generation). */
export function compile(source: string, scope: ScopeNames = SCOPE): CompileResult {
  const { expression, diagnostics } = parseExpression(source);
  if (!expression) throw new Error(`syntax error in test source ${JSON.stringify(source)}: ${diagnostics[0]?.message}`);
  return compileExpression(expression, { scope });
}
