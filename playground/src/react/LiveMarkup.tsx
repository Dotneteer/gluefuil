// A live compiler for the playground: edit markup, see the diagnostics, the
// generated JavaScript and the rendered result. The compiler runs in the
// browser here (as in standalone mode); the rest of the playground is compiled
// at build time. An app's own React component (vite.config.ts `extensions`).
import { codeFrame, compileModule, formatDiagnostic, LineMap } from "@patchfuil/compiler";
import * as builtIns from "@patchfuil/components";
import { loadModule } from "@patchfuil/runtime";
import { Component, useMemo, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";

const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "13px",
  lineHeight: 1.5,
  tabSize: 2,
};
const box: CSSProperties = {
  ...mono,
  margin: 0,
  padding: "8px 12px",
  whiteSpace: "pre",
  overflowX: "auto",
  border: "1px solid var(--pfui-borderColor)",
  borderRadius: "var(--pfui-borderRadius)",
  backgroundColor: "var(--pfui-backgroundColor-Text-code)",
  color: "var(--pfui-textColor)",
};

/** Keeps a render error inside the preview. */
class Preview extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(_error: Error, _info: ErrorInfo) {}
  override render() {
    return this.state.error ? <pre style={{ ...box, color: "var(--pfui-color-danger-600)" }}>Render error: {this.state.error.message}</pre> : this.props.children;
  }
}

export function LiveMarkup({ initialMarkup, title }: { initialMarkup?: unknown; title?: unknown }) {
  const [markup, setMarkup] = useState(String(initialMarkup ?? "<Text>Hello</Text>"));
  const [showCode, setShowCode] = useState(false);
  const result = useMemo(() => {
    const compiled = compileModule(markup, { format: "function", fileName: "Live.pfui", sourceMap: false });
    const lineMap = new LineMap(markup);
    const messages = compiled.diagnostics.map((d) => `${formatDiagnostic(d, lineMap, "Live.pfui")}\n${codeFrame(markup, lineMap, d.start)}`);
    const hasErrors = compiled.diagnostics.some((d) => d.severity === "error");
    let Rendered: (() => ReactNode) | undefined;
    if (!hasErrors) {
      try {
        Rendered = loadModule(compiled.code, { components: builtIns }) as () => ReactNode;
      } catch (error) {
        messages.push(`Load error: ${(error as Error).message}`);
      }
    }
    return { code: compiled.code, messages, Rendered };
  }, [markup]);
  const rows = Math.min(14, Math.max(3, markup.split("\n").length + 1));
  return (
    <section className="playground-LiveMarkup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title ? <strong>{String(title)}</strong> : null}
      <textarea
        aria-label={`Markup${title ? `: ${String(title)}` : ""}`}
        value={markup}
        spellCheck={false}
        rows={rows}
        onChange={(event) => setMarkup(event.target.value)}
        style={{ ...box, resize: "vertical", whiteSpace: "pre" }}
      />
      {result.messages.length > 0 ? (
        <pre role="status" style={{ ...box, borderColor: "var(--pfui-color-danger-500)" }}>
          {result.messages.join("\n")}
        </pre>
      ) : (
        <div style={{ ...mono, color: "var(--pfui-color-success-700)" }}>No diagnostics.</div>
      )}
      {result.Rendered ? (
        <div style={{ padding: 12, border: "1px dashed var(--pfui-borderColor)", borderRadius: "var(--pfui-borderRadius)" }}>
          <Preview key={markup}>
            <result.Rendered />
          </Preview>
        </div>
      ) : null}
      <label style={{ ...mono, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={showCode} onChange={(event) => setShowCode(event.target.checked)} />
        Show the generated JavaScript
      </label>
      {showCode ? <pre style={box}>{result.code}</pre> : null}
    </section>
  );
}
