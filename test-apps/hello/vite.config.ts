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
  // Step 23: Lucide (every app), and the Markdown chunk's parser (found only on its dynamic import: a mid-test reload otherwise).
  optimizeDeps: { include: ["@mantine/core", "@mantine/notifications", "react", "react-dom/client", "react/jsx-runtime", "lucide-react", "@tanstack/react-virtual", "mdast-util-from-markdown", "mdast-util-gfm", "micromark-extension-gfm", "mdast-util-to-string"] },
  // prerender: a build renders Main.gui into index.html (step 13).
  plugins: [gfui({ prerender: true }), react()],
  // React, ReactDOM, Mantine and every built-in: one ~820 kB chunk, known (.ai/docs/inputs.md § Size).
  build: { chunkSizeWarningLimit: 900 },
  // `vite preview` serves the built app under a strict CSP: build-time
  // compilation must need no eval (step 12). The dev server is unaffected.
  preview: {
    headers: { "Content-Security-Policy": "script-src 'self'" },
  },
});
