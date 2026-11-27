import { gfui, gfuiMockBackend } from "@gluefuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The same app with two mock hosts: GFUI_MOCK_HOST=worker (a service worker in
// the page, the default) or middleware (the dev server answers over HTTP). The
// E2E data specs run against both: the app can't tell them apart.
const host = process.env.GFUI_MOCK_HOST === "middleware" ? "middleware" : "worker";
// A production build keeps the mock only when asked (tools/data-build.test.ts checks both).
const buildMock = process.env.GFUI_MOCK_BUILD === "1";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { forwardConsole: false },
  build: { chunkSizeWarningLimit: 1000, rolldownOptions: { input: { main: "index.html", probe: "probe.html" } } },
  // Step 23: Lucide (every app), and the Markdown chunk's parser (found only on its dynamic import: a mid-test reload otherwise).
  optimizeDeps: { include: ["@mantine/core", "@mantine/notifications", "react", "react-dom/client", "react/jsx-runtime", "@tanstack/query-core", "lucide-react", "@tanstack/react-virtual", "@headless-tree/core", "uqr", "mdast-util-from-markdown", "mdast-util-gfm", "micromark-extension-gfm", "mdast-util-to-string"] },
  plugins: [gfui(), gfuiMockBackend({ module: "src/backend.ts", host, build: buildMock }), react()],
});
