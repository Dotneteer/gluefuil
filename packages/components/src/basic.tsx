// Stack (step 5): a plain React component; compiled code passes it resolved
// prop values. App and Theme are in theme.tsx, Text and Heading in text.tsx,
// the Mantine-based components in mantine.tsx.
import type { ReactNode } from "react";

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
