import { compileModule, formatDiagnostic, LineMap } from "@patchfuil/compiler";
import react from "@vitejs/plugin-react";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Minimal build-time integration (step 5): compiles .pfui files to ES modules.
 * Compile errors fail the transform with file:line:column messages; the source
 * map goes to Vite. The real plugin (caching, HMR) is step 12.
 */
function pfui(): Plugin {
  return {
    name: "pfui",
    transform(source, id) {
      if (!id.endsWith(".pfui")) return undefined;
      // The map's source is the file's name, resolved by the browser relative to the module URL.
      const { code, map, diagnostics } = compileModule(source, { fileName: basename(id.split("?")[0]!) });
      const errors = diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        const lineMap = new LineMap(source);
        this.error(errors.map((d) => formatDiagnostic(d, lineMap, id)).join("\n"));
      }
      return { code, map: map ?? null };
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [pfui(), react()],
});
