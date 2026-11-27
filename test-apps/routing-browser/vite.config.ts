import { gfui } from "@gluefuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Step 21: browser routing. The build writes one HTML file per static route
// (about/index.html, docs/intro/index.html) and, through `routes`, one for a
// route with a parameter (users/1/index.html).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // A test fixture: its E2E spec checks the browser itself; no console forwarding.
  server: { forwardConsole: false },
  // React, ReactDOM and Mantine: one ~500 kB chunk, known (.ai/docs/mantine.md § Size).
  build: { chunkSizeWarningLimit: 1000 },
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  // Step 23: Lucide (every app), and the Markdown chunk's parser (found only on its dynamic import: a mid-test reload otherwise).
  optimizeDeps: { include: ["@mantine/core", "@mantine/notifications", "react", "react-dom/client", "react/jsx-runtime", "lucide-react", "@tanstack/react-virtual", "@headless-tree/core", "uqr", "react-dropzone", "papaparse", "mdast-util-from-markdown", "mdast-util-gfm", "micromark-extension-gfm", "mdast-util-to-string"] },
  plugins: [gfui({ prerender: { routes: ["/users/1"] } }), react()],
});
