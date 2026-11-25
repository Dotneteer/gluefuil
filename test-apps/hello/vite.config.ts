import { gfui } from "@gluefuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // A test fixture: its E2E specs check browser errors themselves (some throw on
  // purpose), so the dev server does not also print them.
  server: { forwardConsole: false },
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime"] },
  // prerender: a build renders Main.gui into index.html (step 13).
  plugins: [gfui({ prerender: true }), react()],
  // React, ReactDOM and Mantine: one ~500 kB chunk, known (.ai/docs/mantine.md § Size).
  build: { chunkSizeWarningLimit: 700 },
  // `vite preview` serves the built app under a strict CSP: build-time
  // compilation must need no eval (step 12). The dev server is unaffected.
  preview: {
    headers: { "Content-Security-Policy": "script-src 'self'" },
  },
});
