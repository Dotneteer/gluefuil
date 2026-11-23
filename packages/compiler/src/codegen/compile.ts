// Public entry points for compiling bindings. See .ai/plan/poc-03-codegen.md.

import type { Expression, FunctionDeclaration, Program } from "../script/ast";
import type { InterpolationSegment } from "../script/interpolation";
import type { Diagnostic } from "../source/diagnostic";
import { Emitter, type MemberLookup, type ScopeNames } from "./emitter";
import { bare, jsString } from "./markers";

/** Emit at assignment level: a top-level sequence expression gets parentheses. */
const ASSIGNMENT_PRECEDENCE = 2;

export interface CompileOptions {
  /**
   * Names the binding can read besides its locals and the allowed globals:
   * component variables, ids, context variables (`$item`), app globals.
   */
  scope: ScopeNames;
  /**
   * Keep source markers in `code` (internal: compileModule turns them into a
   * source map; see ./markers.ts). Default false: clean code.
   */
  markers?: boolean;
  /** Component contracts: the API members of scope names that are component IDs (C015). */
  members?: MemberLookup;
  /** The severity of contract diagnostics (C015). Default "error". */
  contractSeverity?: "error" | "warning";
}

export interface CompileResult {
  /**
   * JavaScript source of one arrow function, `($$s) => …`. Its free names are
   * `$$g` (sandbox globals) and `$$r` (runtime helpers); the runtime binds them.
   */
  code: string;
  /** The scope names the binding reads, sorted. */
  dependencies: string[];
  /** True when the value contains no expression; `value` holds it. */
  constant: boolean;
  value?: string;
  diagnostics: Diagnostic[];
}

/** Compiles one expression (an attribute value that is exactly `{expr}`). */
export function compileExpression(expression: Expression, options: CompileOptions): CompileResult {
  const emitter = new Emitter(options.scope, { markers: options.markers, members: options.members, contractSeverity: options.contractSeverity });
  const body = emitter.expression(expression, ASSIGNMENT_PRECEDENCE);
  const code = `($$s) => ${bare(body).startsWith("{") ? `(${body})` : body}`;
  return {
    code,
    dependencies: [...emitter.dependencies].sort(),
    constant: false,
    diagnostics: emitter.diagnostics,
  };
}

/**
 * Compiles an interpolated value (from `parseInterpolation`) with XMLUI's rules
 * (`extractParam.ts`):
 *   - a whitespace-only literal at either end is dropped;
 *   - a lone expression yields its raw value;
 *   - otherwise the parts are joined into a string, where `null`, `undefined`
 *     and values without `toString` contribute "".
 * A segment with a syntax error (`expression: null`) compiles to `undefined`;
 * its diagnostic comes from the parser.
 */
export function compileInterpolation(segments: InterpolationSegment[], options: CompileOptions): CompileResult {
  let parts = segments;
  if (parts[0]?.kind === "literal" && parts[0].value.trim() === "") parts = parts.slice(1);
  const last = parts[parts.length - 1];
  if (last?.kind === "literal" && last.value.trim() === "") parts = parts.slice(0, -1);

  if (parts.every((p) => p.kind === "literal")) {
    // No expression: the text itself (a whitespace-only value is kept as is).
    const value = (parts.length === 0 ? segments : parts).map((p) => (p.kind === "literal" ? p.value : "")).join("");
    return { code: `($$s) => ${jsString(value)}`, dependencies: [], constant: true, value, diagnostics: [] };
  }

  const emitter = new Emitter(options.scope, { markers: options.markers, members: options.members, contractSeverity: options.contractSeverity });
  const emit = (expression: Expression | null) => (expression ? emitter.expression(expression, ASSIGNMENT_PRECEDENCE) : "undefined");
  let body: string;
  if (parts.length === 1 && parts[0]!.kind === "expression") {
    body = emit(parts[0]!.expression);
    if (bare(body).startsWith("{")) body = `(${body})`;
  } else {
    // `$$r.str()` returns a string, so the sum is always a string.
    body = parts.map((p) => (p.kind === "literal" ? jsString(p.value) : `$$r.str(${emit(p.expression)})`)).join(" + ");
  }
  const code = `($$s) => ${body}`;
  return {
    code,
    dependencies: [...emitter.dependencies].sort(),
    constant: false,
    diagnostics: emitter.diagnostics,
  };
}

export interface CompileHandlerOptions extends CompileOptions {
  /** The scope names a handler may write (variables). */
  variables: ReadonlySet<string>;
}

/**
 * Compiles an event handler (`onClick="…"`, `<event>` content) from
 * `parseStatements` output. The code is `($$s) => handlerFunction`; see
 * Emitter.handlerFunction for the shapes.
 */
export function compileHandler(program: Program, options: CompileHandlerOptions): CompileResult {
  const emitter = new Emitter(options.scope, { mode: "handler", variables: options.variables, markers: options.markers, members: options.members, contractSeverity: options.contractSeverity });
  const fn = emitter.handlerFunction(program);
  const code = `($$s) => ${fn}`;
  return { code, dependencies: [], constant: false, diagnostics: emitter.diagnostics };
}

/**
 * Compiles a code-behind function declaration (step 14) to `($$s) => function f(…) {…}`.
 * It is compiled like a function nested in a handler: it may write variables,
 * and it is synchronous unless it contains `await`.
 */
export function compileFunction(node: FunctionDeclaration, options: CompileHandlerOptions): CompileResult {
  const emitter = new Emitter(options.scope, { mode: "handler", variables: options.variables, markers: options.markers, members: options.members, contractSeverity: options.contractSeverity });
  const fn = emitter.functionValue(node);
  return { code: `($$s) => ${fn}`, dependencies: [], constant: false, diagnostics: emitter.diagnostics };
}
