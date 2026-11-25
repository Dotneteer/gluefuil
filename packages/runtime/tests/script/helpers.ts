// Compile-and-run helpers: the runtime's tests use the real compiler output.
// (Tests may import the compiler; only the runtime's src/ must not.)
import { compileExpression, compileInterpolation, parseExpression, parseInterpolation, type Diagnostic } from "@gluefuil/compiler";
import { loadBinding } from "../../src/script/load";

export interface Compiled {
  diagnostics: Diagnostic[];
  run: () => unknown;
}

/** Parses and compiles `source` with the scope's keys as scope names. */
export function compileWith(source: string, scope: Record<string, unknown> = {}): Compiled {
  const { expression, diagnostics } = parseExpression(source);
  if (!expression) return { diagnostics, run: () => { throw new Error("not compiled"); } };
  const result = compileExpression(expression, { scope: new Set(Object.keys(scope)) });
  const all = [...diagnostics, ...result.diagnostics];
  return {
    diagnostics: all,
    run: () => {
      if (all.length > 0) throw new Error(`not compiled: ${all.map((d) => d.code).join(", ")}`);
      return loadBinding(result.code)(scope);
    },
  };
}

/** Evaluates a binding expression; compile errors fail the test. */
export function evaluate(source: string, scope: Record<string, unknown> = {}): unknown {
  const compiled = compileWith(source, scope);
  if (compiled.diagnostics.length > 0) {
    throw new Error(`${source}: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`);
  }
  return compiled.run();
}

/** Evaluates an interpolated value (attribute or text). */
export function evaluateText(text: string, scope: Record<string, unknown> = {}): unknown {
  const parsed = parseInterpolation(text);
  const result = compileInterpolation(parsed.segments, { scope: new Set(Object.keys(scope)) });
  const all = [...parsed.diagnostics, ...result.diagnostics];
  if (all.length > 0) throw new Error(`${text}: ${all.map((d) => d.message).join("; ")}`);
  return loadBinding(result.code)(scope);
}
