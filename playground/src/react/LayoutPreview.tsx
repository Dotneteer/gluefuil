// The layout scenarios' preview: each layout demo (src/layouts/*.pfui) runs
// as its own page (layouts.html?layout=…) in a frame, at desktop or phone
// width, with its source. An app's own React component, used from markup: see
// `extensions` in vite.config.ts.
import { useState, type CSSProperties } from "react";

const sources = import.meta.glob("../layouts/*.pfui", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** The App shell demos, in the order of the comparison table in .ai/plan/poc-19a-app-shell.md. */
export const LAYOUTS = [
  "condensed-sticky",
  "condensed",
  "horizontal-sticky",
  "horizontal",
  "vertical-full-header",
  "vertical-sticky",
  "vertical",
  "desktop",
  "condensed-content",
];

/** The demos of each group: the App shell's layouts, and the automatic spacing (steps 19D–19F). */
const GROUPS: Record<string, string[]> = { shell: LAYOUTS, spacing: ["spacing"] };

const WIDTHS = { Desktop: "100%", Phone: "390px" } as const;

const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" };
const choice = (selected: boolean): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: "var(--pfui-borderRadius)",
  border: "1px solid var(--pfui-borderColor)",
  background: selected ? "var(--pfui-color-primary-500)" : "transparent",
  color: selected ? "#fff" : "inherit",
  cursor: "pointer",
  font: "inherit",
});
const code: CSSProperties = {
  margin: 0,
  padding: "12px 16px",
  overflowX: "auto",
  whiteSpace: "pre",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "13px",
  backgroundColor: "var(--pfui-backgroundColor-Text-code)",
  border: "1px solid var(--pfui-borderColor)",
  borderRadius: "var(--pfui-borderRadius)",
};

export function LayoutPreview({ group }: { group?: unknown }) {
  const demos = GROUPS[typeof group === "string" ? group : "shell"] ?? LAYOUTS;
  const [layout, setLayout] = useState(demos[0]!);
  const [width, setWidth] = useState<keyof typeof WIDTHS>("Desktop");
  const source = sources[`../layouts/${layout}.pfui`] ?? "";
  return (
    <section className="playground-LayoutPreview" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {demos.length > 1 ? (
        <div style={row} role="group" aria-label="Layout">
          {demos.map((name) => (
            <button key={name} type="button" style={choice(name === layout)} aria-pressed={name === layout} onClick={() => setLayout(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}
      <div style={row} role="group" aria-label="Width">
        {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((name) => (
          <button key={name} type="button" style={choice(name === width)} aria-pressed={name === width} onClick={() => setWidth(name)}>
            {name}
          </button>
        ))}
        <a href={`layouts.html?layout=${layout}`} target="_blank" rel="noreferrer">Open in a new tab</a>
      </div>
      <iframe
        key={layout}
        title={`Layout: ${layout}`}
        src={`layouts.html?layout=${layout}`}
        style={{ width: WIDTHS[width], maxWidth: "100%", height: demos.length === 1 ? "720px" : "480px", border: "1px solid var(--pfui-borderColor)", borderRadius: "var(--pfui-borderRadius)" }}
      />
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: "0.85em", color: "var(--pfui-textColor-secondary)", margin: "0 0 4px" }}>layouts/{layout}.pfui</figcaption>
        <pre style={code}>
          <code>{source.replace(/\s+$/, "")}</code>
        </pre>
      </figure>
    </section>
  );
}
