// The source of a scenario (its .pfui file, and its code-behind if it has one),
// shown in a monospace block that keeps line breaks and indentation. An app's
// own React component, used from markup: see `extensions` in vite.config.ts.
import type { CSSProperties } from "react";

// The files' text at build time (Vite; `?raw` is not compiled by the pfui plugin).
const sources = import.meta.glob(["../components/*.pfui", "../components/*.pfui.xs"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const block: CSSProperties = {
  margin: 0,
  padding: "12px 16px",
  overflowX: "auto",
  whiteSpace: "pre",
  tabSize: 2,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "13px",
  lineHeight: 1.5,
  backgroundColor: "var(--pfui-backgroundColor-Text-code)",
  color: "var(--pfui-textColor)",
  border: "1px solid var(--pfui-borderColor)",
  borderRadius: "var(--pfui-borderRadius)",
};

const caption: CSSProperties = { fontSize: "0.85em", color: "var(--pfui-textColor-secondary)", margin: "8px 0 4px" };

function Source({ title, text }: { title: string; text: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={caption}>{title}</figcaption>
      <pre style={block}>
        <code>{text.replace(/\s+$/, "")}</code>
      </pre>
    </figure>
  );
}

/** `<ScenarioSource file="CounterScenario"/>`: components/CounterScenario.pfui (and .pfui.xs). */
export function ScenarioSource({ file }: { file?: unknown }) {
  const name = String(file ?? "");
  const markup = sources[`../components/${name}.pfui`];
  const codeBehind = sources[`../components/${name}.pfui.xs`];
  if (markup === undefined) return <Source title={`components/${name}.pfui`} text="(no such file)" />;
  return (
    <section className="playground-ScenarioSource">
      <Source title={`components/${name}.pfui`} text={markup} />
      {codeBehind !== undefined ? <Source title={`components/${name}.pfui.xs (code-behind)`} text={codeBehind} /> : null}
    </section>
  );
}
