// Public entry points for parsing pfui script.

import type { Diagnostic } from "../source/diagnostic";
import type { Expression, Program } from "./ast";
import { ScriptParser, type ScriptSourceOptions } from "./parser";

export interface ParseExpressionResult {
  /** `null` when the source has a syntax error (see diagnostics). */
  expression: Expression | null;
  diagnostics: Diagnostic[];
}

export interface ParseStatementsResult {
  program: Program;
  diagnostics: Diagnostic[];
}

/** Parses exactly one expression (sequence expressions included). */
export function parseExpression(source: string, options: ScriptSourceOptions = {}): ParseExpressionResult {
  const parser = new ScriptParser(source, 0, source.length, options);
  const expression = parser.parseOnlyExpression();
  return { expression, diagnostics: parser.diagnostics };
}

/**
 * Parses a statement list: event handlers, `<event>` content, `<script>`
 * blocks and code-behind. Recovers after errors; never throws.
 */
export function parseStatements(source: string, options: ScriptSourceOptions = {}): ParseStatementsResult {
  const parser = new ScriptParser(source, 0, source.length, options);
  const program = parser.parseProgram();
  return { program, diagnostics: parser.diagnostics };
}
