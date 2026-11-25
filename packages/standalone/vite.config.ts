import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// dist/gfui.js: one IIFE file with React, ReactDOM, the compiler, the runtime and
// the components, exposing the global `gfui`. Build: npm run build:standalone.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    // Unique per build: the compile cache never serves code compiled by another engine build.
    __GFUI_BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "gfui",
      formats: ["iife"],
      fileName: () => "gfui.js",
    },
    rolldownOptions: {
      onLog(level, log, handler) {
        // Mantine marks its modules "use client" (a React Server Components directive):
        // meaningless in this client-side bundle, and reported once per module (800+ lines).
        if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.message.includes('"use client"')) return;
        handler(level, log);
      },
    },
  },
});
