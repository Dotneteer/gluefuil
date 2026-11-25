import { gfui, gfuiMockBackend } from "@gluefuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // A test fixture: its E2E spec checks the browser itself; no console forwarding.
  server: { forwardConsole: false },
  // React, ReactDOM and Mantine: one ~500 kB chunk, known (.ai/docs/mantine.md § Size).
  build: { chunkSizeWarningLimit: 900 },
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  // Step 23: Lucide (every app), and the Markdown chunk's parser (found only on its dynamic import: a mid-test reload otherwise).
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime", "@tanstack/query-core", "lucide-react", "mdast-util-from-markdown", "mdast-util-gfm", "micromark-extension-gfm", "mdast-util-to-string"] },
  // The mock backend (step 22B) in a service worker, in the prerendered build too.
  plugins: [gfui({ prerender: true }), gfuiMockBackend({ module: "src/backend.ts", build: true }), react()],
});
