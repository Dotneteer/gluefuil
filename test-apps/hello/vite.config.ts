import { pfui } from "@patchfuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [pfui(), react()],
  // `vite preview` serves the built app under a strict CSP: build-time
  // compilation must need no eval (step 12). The dev server is unaffected.
  preview: {
    headers: { "Content-Security-Policy": "script-src 'self'" },
  },
});
