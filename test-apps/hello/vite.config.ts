import { pfui } from "@patchfuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Pre-bundled at startup: otherwise the first page load discovers them,
  // and Vite reloads the page mid-test (a cold cache).
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime"] },
  // prerender: a build renders Main.pfui into index.html (step 13).
  plugins: [pfui({ prerender: true }), react()],
  // `vite preview` serves the built app under a strict CSP: build-time
  // compilation must need no eval (step 12). The dev server is unaffected.
  preview: {
    headers: { "Content-Security-Policy": "script-src 'self'" },
  },
});
