// Minimal built-in components for the first running app (step 5). Plain React
// components: compiled code passes them resolved prop values. They are
// replaced by Mantine-based ones with theme variables later (steps 16-17).
import type { ReactNode } from "react";

export function App({ children }: { children?: ReactNode }) {
  return <div className="pfui-App">{children}</div>;
}

export function Text({ value, children }: { value?: unknown; children?: ReactNode }) {
  return <span className="pfui-Text">{value !== undefined && value !== null ? String(value) : children}</span>;
}

export function Button({
  label,
  onClick,
  children,
}: {
  label?: unknown;
  onClick?: () => void;
  children?: ReactNode;
}) {
  // The handler gets no DOM event: script must not reach raw platform objects.
  return (
    <button type="button" className="pfui-Button" onClick={onClick ? () => onClick() : undefined}>
      {label !== undefined && label !== null ? String(label) : children}
    </button>
  );
}

export function Stack({
  orientation,
  gap,
  children,
}: {
  orientation?: unknown;
  gap?: unknown;
  children?: ReactNode;
}) {
  return (
    <div
      className="pfui-Stack"
      style={{
        display: "flex",
        flexDirection: orientation === "horizontal" ? "row" : "column",
        gap: typeof gap === "string" || typeof gap === "number" ? gap : undefined,
      }}
    >
      {children}
    </div>
  );
}
