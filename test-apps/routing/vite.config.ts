import { pfui } from "@patchfuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime"] },
  plugins: [pfui({ prerender: true }), react()],
});
