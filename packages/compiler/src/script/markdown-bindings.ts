// `@{expression}` in Markdown text (step 23; XMLUI: components/Markdown/parse-binding-expr.ts).
// The compiler splits a Markdown element's nested text into literal parts and
// expressions, so each expression is compiled and sandboxed like any binding;
// nothing is evaluated from a runtime string.
//   - code fences (``` or ~~~) and inline code spans keep `@{…}` as written;
//   - `\@{` is a literal `@{` (the backslash is dropped);
//   - an empty `@{}` (or whitespace only) is removed, as in XMLUI;
//   - an expression must be followed by `}`; otherwise it is a diagnostic and
//     the text is kept.

import type { Diagnostic } from "../source/diagnostic";
import type { Expression } from "./ast";
import { ScriptDiagnostics } from "./diagnostics";
import type { LiteralSegment } from "./interpolation";
import { ScriptParser, type ScriptSourceOptions } from "./parser";

export interface MarkdownExpressionPart {
  kind: "expression";
  /** `null` when the expression has a syntax error. */
  expression: Expression | null;
  /** The span includes `@{` and `}`. */
  start: number;
  end: number;
}

export type MarkdownPart = LiteralSegment | MarkdownExpressionPart;

export interface ParseMarkdownBindingsResult {
  parts: MarkdownPart[];
  diagnostics: Diagnostic[];
}

/** The fence that opens at `i` (the start of a line), if any: its marker character and length. */
function fenceAt(text: string, i: number): { char: string; length: number } | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(text.slice(i, i + 64));
  return match ? { char: match[1]![0]!, length: match[1]!.length } : undefined;
}

export function parseMarkdownBindings(text: string, options: ScriptSourceOptions = {}): ParseMarkdownBindingsResult {
  const at = (index: number) => (options.offsets ? options.offsets[Math.min(index, options.offsets.length - 1)]! : (options.offset ?? 0) + index);
  const parts: MarkdownPart[] = [];
  const diagnostics: Diagnostic[] = [];
  let literal = "";
  let literalStart = 0;
  const flush = (end: number) => {
    if (literal !== "") parts.push({ kind: "literal", value: literal, start: at(literalStart), end: at(end) });
    literal = "";
  };

  let i = 0;
  let fence: { char: string; length: number } | undefined;
  while (i < text.length) {
    const lineStart = i === 0 || text[i - 1] === "\n";
    if (lineStart) {
      const marker = fenceAt(text, i);
      // A fence opens, or the same kind (at least as long) closes it.
      if (marker && (!fence || (marker.char === fence.char && marker.length >= fence.length))) fence = fence ? undefined : marker;
    }
    if (fence) {
      // Inside a code fence: the rest of the line as written.
      const end = text.indexOf("\n", i);
      const next = end < 0 ? text.length : end + 1;
      literal += text.slice(i, next);
      i = next;
      continue;
    }
    const ch = text[i]!;
    if (ch === "`") {
      // An inline code span: a run of N backticks up to the next run of exactly N.
      let j = i;
      while (text[j] === "`") j++;
      const run = text.slice(i, j);
      const close = new RegExp(`(?<!\`)${run}(?!\`)`, "g");
      close.lastIndex = j;
      const found = close.exec(text);
      const next = found ? found.index + run.length : j;
      literal += text.slice(i, next);
      i = next;
      continue;
    }
    if (ch === "\\" && text.startsWith("@{", i + 1)) {
      literal += "@{";
      i += 3;
      continue;
    }
    if (ch === "@" && text[i + 1] === "{") {
      const empty = /^@\{\s*\}/.exec(text.slice(i));
      if (empty) {
        // XMLUI removes empty expressions.
        flush(i);
        i += empty[0].length;
        literalStart = i;
        continue;
      }
      flush(i);
      const parser = new ScriptParser(text, i + 2, text.length, options);
      const expression = parser.parseExpressionPrefix();
      diagnostics.push(...parser.diagnostics);
      const next = parser.current;
      const closed = expression !== null && next.kind === "punct" && next.value === "}";
      let end: number;
      if (closed) end = next.end;
      else {
        if (expression) diagnostics.push({ code: "S040", severity: "error", message: ScriptDiagnostics.S040(), start: at(i), end: at(i + 2) });
        const close = text.indexOf("}", Math.max(next.start, i + 2));
        end = close < 0 ? text.length : close + 1;
      }
      parts.push({ kind: "expression", expression: closed ? expression : null, start: at(i), end: at(end) });
      i = end;
      literalStart = i;
      continue;
    }
    literal += ch;
    i++;
  }
  flush(text.length);
  return { parts, diagnostics };
}
