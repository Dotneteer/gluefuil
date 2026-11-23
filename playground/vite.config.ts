import { pfui } from "@patchfuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Pre-bundled at startup, so the first page load is not interrupted by a reload.
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime"] },
  // prerender: `npm run playground:build` renders the dashboard into index.html.
  plugins: [pfui({ prerender: true }), react()],
  // React, ReactDOM and Mantine make one ~500 kB chunk; known, not a problem here.
  build: { chunkSizeWarningLimit: 700 },
});
