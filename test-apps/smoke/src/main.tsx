import { parseMarkup } from "@patchfuil/compiler";
import { componentsInfo } from "@patchfuil/components";
import { runtimeInfo } from "@patchfuil/runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The compiler must run in the browser (standalone mode compiles there).
const SAMPLE_MARKUP = `<App var.count="{0}">
  <Button label="Increment" onClick="count++" />
  <Text>Count: {count}</Text>
</App>`;

function describeParse(markup: string): string {
  const { document, diagnostics } = parseMarkup(markup);
  const root = document.children.find((node) => node.kind === "element");
  const childCount = root?.kind === "element" ? root.children.filter((n) => n.kind === "element").length : 0;
  return `root <${root?.kind === "element" ? root.name.full : "?"}> with ${childCount} child elements, ${diagnostics.length} diagnostics`;
}

function SmokeApp() {
  return (
    <main>
      <h1>Smoke test app</h1>
      <ul aria-label="Loaded packages">
        <li>@patchfuil/compiler</li>
        <li>{runtimeInfo.name}</li>
        <li>{componentsInfo.name}</li>
      </ul>
      <p aria-label="Parser output">{describeParse(SAMPLE_MARKUP)}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SmokeApp />
  </StrictMode>,
);
