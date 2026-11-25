// The error overlay: compile errors (or a failed fetch) shown in place of the app.
import { codeFrame, formatDiagnostic, LineMap, type Diagnostic } from "@gluefuil/compiler";
import type { CSSProperties } from "react";

export interface LoadError {
  file: string;
  /** Compile diagnostics, with the source they point into. */
  diagnostics?: Diagnostic[];
  source?: string;
  /** Anything else (network, runtime). */
  error?: unknown;
}

const box: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "13px",
  margin: "16px",
  padding: "16px",
  border: "1px solid #d33",
  borderRadius: "6px",
  background: "#fff5f5",
  color: "#300",
  whiteSpace: "pre-wrap",
};

export function ErrorOverlay({ error }: { error: LoadError }) {
  const lines: string[] = [];
  if (error.diagnostics && error.source !== undefined) {
    const lineMap = new LineMap(error.source);
    for (const diagnostic of error.diagnostics) {
      lines.push(formatDiagnostic(diagnostic, lineMap, error.file), codeFrame(error.source, lineMap, diagnostic.start));
    }
  } else {
    lines.push(`${error.file}: ${error.error instanceof Error ? error.error.message : String(error.error)}`);
  }
  return (
    <div role="alert" className="gfui-error-overlay" style={box}>
      <strong>gfui: the app could not be loaded</strong>
      {"\n\n"}
      {lines.join("\n")}
    </div>
  );
}
