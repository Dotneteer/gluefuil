// Interpolated values: attribute values and text content split into literal
// text and `{expression}` segments. Follows XMLUI's AttributeValueParser:
//   - `\{` is a literal `{` (one backslash is dropped); any other `\x` is kept as is;
//   - after `{`, one expression is parsed and must be followed by `}`, so
//     `{{ a: 1 }}` is an object literal;
//   - a `{` at the very end of the text is literal.

import type { Diagnostic } from "../source/diagnostic";
import type { Expression } from "./ast";
import { ScriptDiagnostics } from "./diagnostics";
import { ScriptParser, type ScriptSourceOptions } from "./parser";

export type InterpolationSegment = LiteralSegment | ExpressionSegment;

export interface LiteralSegment {
  kind: "literal";
  /** The literal text, with escapes applied. */
  value: string;
  start: number;
  end: number;
}

export interface ExpressionSegment {
  kind: "expression";
  /** `null` when the expression has a syntax error. */
  expression: Expression | null;
  /** The span includes the braces. */
  start: number;
  end: number;
}

export interface ParseInterpolationResult {
  segments: InterpolationSegment[];
  diagnostics: Diagnostic[];
}

export function parseInterpolation(text: string, options: ScriptSourceOptions = {}): ParseInterpolationResult {
  const at = (index: number) => (options.offsets ? options.offsets[index]! : (options.offset ?? 0) + index);
  const segments: InterpolationSegment[] = [];
  const diagnostics: Diagnostic[] = [];

  let literal = "";
  let literalStart = 0;
  const flushLiteral = (end: number) => {
    if (literal !== "") segments.push({ kind: "literal", value: literal, start: at(literalStart), end: at(end) });
    literal = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;

    if (ch === "\\") {
      let j = i;
      while (text[j] === "\\") j++;
      const backslashes = "\\".repeat(j - i);
      if (text[j] === "{") {
        literal += backslashes.slice(1) + "{";
        i = j + 1;
      } else if (j >= text.length) {
        literal += backslashes;
        i = j;
      } else {
        literal += backslashes + text[j];
        i = j + 1;
      }
      continue;
    }

    if (ch === "{" && i < text.length - 1) {
      flushLiteral(i);
      const parser = new ScriptParser(text, i + 1, text.length, options);
      const expression = parser.parseExpressionPrefix();
      diagnostics.push(...parser.diagnostics);
      const next = parser.current;

      const closed = expression !== null && next.kind === "punct" && next.value === "}";
      let end: number;
      if (closed) {
        end = next.end;
      } else {
        if (expression) {
          diagnostics.push({ code: "S040", severity: "error", message: ScriptDiagnostics.S040(), start: at(i), end: at(i + 1) });
        }
        // Recover: resume after the next '}', or give up on the rest of the text.
        const close = text.indexOf("}", Math.max(next.start, i + 1));
        end = close < 0 ? text.length : close + 1;
      }
      segments.push({ kind: "expression", expression: closed ? expression : null, start: at(i), end: at(end) });
      i = end;
      literalStart = i;
      continue;
    }

    literal += ch;
    i++;
  }
  flushLiteral(text.length);
  return { segments, diagnostics };
}
