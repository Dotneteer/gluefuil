import { compileModule, formatDiagnostic, LineMap } from "@patchfuil/compiler";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Minimal build-time integration (step 5): compiles .pfui files to ES modules.
 * Compile errors fail the transform with file:line:column messages. The real
 * plugin (caching, source maps, HMR) is step 12.
 */
function pfui(): Plugin {
  return {
    name: "pfui",
    transform(source, id) {
      if (!id.endsWith(".pfui")) return undefined;
      const { code, diagnostics } = compileModule(source);
      const errors = diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        const lineMap = new LineMap(source);
        this.error(errors.map((d) => formatDiagnostic(d, lineMap, id)).join("\n"));
      }
      return { code, map: null };
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [pfui(), react()],
});
