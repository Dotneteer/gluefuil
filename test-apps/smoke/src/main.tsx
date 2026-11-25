import { parseMarkup } from "@gluefuil/compiler";
import { componentMetadata } from "@gluefuil/components";
import { signal } from "@gluefuil/runtime";
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
        <li>@gluefuil/compiler</li>
        {typeof signal === "function" && <li>@gluefuil/runtime</li>}
        {"Text" in componentMetadata && <li>@gluefuil/components</li>}
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
