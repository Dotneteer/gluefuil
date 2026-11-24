import { pfui, pfuiMockBackend } from "@patchfuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The same app with two mock hosts: PFUI_MOCK_HOST=worker (a service worker in
// the page, the default) or middleware (the dev server answers over HTTP). The
// E2E data specs run against both: the app can't tell them apart.
const host = process.env.PFUI_MOCK_HOST === "middleware" ? "middleware" : "worker";
// A production build keeps the mock only when asked (tools/data-build.test.ts checks both).
const buildMock = process.env.PFUI_MOCK_BUILD === "1";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { forwardConsole: false },
  build: { chunkSizeWarningLimit: 700, rolldownOptions: { input: { main: "index.html", probe: "probe.html" } } },
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime", "@tanstack/query-core"] },
  plugins: [pfui(), pfuiMockBackend({ module: "src/backend.ts", host, build: buildMock }), react()],
});
