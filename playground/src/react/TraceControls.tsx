// The playground's trace controls (step 35): whether tracing is on, the number
// of entries, render entries on or off, and a button that opens the Inspector.
// Playground-only: script can read nothing of the trace (decision: no read API
// for apps), so this is an app's own React component, used from markup (see
// `extensions` in vite.config.ts).
import { trace } from "@gluefuil/runtime";
import { useEffect, useState, type CSSProperties } from "react";

const BUTTON: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "var(--gfui-borderRadius)",
  border: "1px solid var(--gfui-borderColor)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
};

export function TraceControls() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  useEffect(() => trace.subscribe(refresh), []);
  const count = trace.entries().length;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="trace-controls">
      <span data-testid="trace-status">
        Tracing is {trace.enabled ? "on" : "off"}; {count} entries{trace.dropped > 0 ? ` (${trace.dropped} dropped)` : ""}
        {trace.render ? "; with render entries" : ""}
      </span>
      <button
        type="button"
        style={BUTTON}
        onClick={() => {
          if (trace.enabled) trace.disable();
          else trace.enable();
          refresh();
        }}>
        {trace.enabled ? "Turn tracing off" : "Turn tracing on"}
      </button>
      <button
        type="button"
        style={BUTTON}
        disabled={!trace.enabled}
        onClick={() => {
          trace.enable({ render: !trace.render });
          refresh();
        }}>
        {trace.render ? "Render entries off" : "Render entries on"}
      </button>
      <button type="button" style={BUTTON} onClick={() => trace.inspect()}>
        Open the Inspector
      </button>
    </div>
  );
}
