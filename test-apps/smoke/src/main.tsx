import { compilerInfo } from "@patchfuil/compiler";
import { componentsInfo } from "@patchfuil/components";
import { runtimeInfo } from "@patchfuil/runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function SmokeApp() {
  const packages = [compilerInfo.name, runtimeInfo.name, componentsInfo.name];
  return (
    <main>
      <h1>Smoke test app</h1>
      <ul aria-label="Loaded packages">
        {packages.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SmokeApp />
  </StrictMode>,
);
