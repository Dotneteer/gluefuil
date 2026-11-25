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
  build: { chunkSizeWarningLimit: 700 },
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime"] },
  plugins: [gfui({ prerender: { routes: ["/users/1"] } }), react()],
});
