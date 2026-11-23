import type { LineMap } from "./line-map";

export type Severity = "error" | "warning";

/** A problem found in source text, located by UTF-16 offsets. */
export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  start: number;
  end: number;
}

/**
 * Formats a diagnostic for humans: `file:line:column: severity code: message`.
 * Lines and columns are 1-based, as editors and terminals display them.
 */
export function formatDiagnostic(
  diagnostic: Diagnostic,
  lineMap: LineMap,
  fileName = "<input>",
): string {
  const { line, column } = lineMap.positionAt(diagnostic.start);
  return `${fileName}:${line + 1}:${column + 1}: ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
}

/**
 * The source line containing `offset`, with a caret under the offset's column:
 * `  <line>\n  <spaces>^`. Shared by the build plugin and the standalone overlay.
 */
export function codeFrame(source: string, lineMap: LineMap, offset: number): string {
  const { line, column } = lineMap.positionAt(offset);
  const start = lineMap.offsetAt({ line, column: 0 });
  const end = lineMap.offsetAt({ line: line + 1, column: 0 });
  const text = line + 1 < lineMap.lineCount ? source.slice(start, end).replace(/\r?\n$|\r$/, "") : source.slice(start);
  return `  ${text}\n  ${" ".repeat(column)}^`;
}
