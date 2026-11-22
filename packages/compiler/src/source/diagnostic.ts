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
