import { gfui } from "@gluefuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // A test fixture: its E2E spec checks the browser itself; no console forwarding.
  server: { forwardConsole: false },
  // React, ReactDOM and Mantine: one ~500 kB chunk, known (.ai/docs/mantine.md § Size).
  build: { chunkSizeWarningLimit: 1000 },
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  // Step 23: Lucide (every app), and the Markdown chunk's parser (found only on its dynamic import: a mid-test reload otherwise).
  optimizeDeps: { include: ["@mantine/core", "@mantine/notifications", "react", "react-dom/client", "react/jsx-runtime", "intl-messageformat", "lucide-react", "@tanstack/react-virtual", "@headless-tree/core", "uqr", "react-dropzone", "papaparse", "mdast-util-from-markdown", "mdast-util-gfm", "micromark-extension-gfm", "mdast-util-to-string"] },
  plugins: [gfui({ prerender: true }), react()],
});
