import { pfui } from "@patchfuil/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Pre-bundled at startup, so the first page load is not interrupted by a reload.
  optimizeDeps: { include: ["@mantine/core", "react", "react-dom/client", "react/jsx-runtime"] },
  // prerender: `npm run playground:build` renders the dashboard into index.html.
  plugins: [
    pfui({
      prerender: true,
      // The playground's own React component, usable from markup.
      extensions: {
        LiveMarkup: {
          module: "src/react/LiveMarkup.tsx",
          metadata: {
            description: "Compiles markup in the browser: diagnostics, generated code, the rendered result.",
            props: {
              initialMarkup: { description: "The markup to start with.", valueType: "string" },
              title: { description: "A caption above the editor.", valueType: "string" },
            },
          },
        },
        LayoutPreview: {
          module: "src/react/LayoutPreview.tsx",
          metadata: {
            description: "Shows the demos of a group (src/layouts/*.pfui) in a frame, at desktop or phone width, with their source.",
            props: {
              group: { description: "shell (default): the App shell layouts; spacing: the automatic spacing demo.", valueType: "string", availableValues: ["shell", "spacing"] },
            },
          },
        },
        SpacingInspector: {
          module: "src/react/SpacingInspector.tsx",
          metadata: {
            description: "A toggle that outlines every stack and labels it with its level and computed gap.",
            props: {},
          },
        },
        ScenarioSource: {
          module: "src/react/ScenarioSource.tsx",
          metadata: {
            description: "Shows a scenario's source (components/<file>.pfui and its code-behind) as code.",
            props: { file: { description: "The component file's name, without .pfui: CounterScenario.", valueType: "string", isRequired: true } },
          },
        },
      },
    }),
    react(),
  ],
  // Its own ports: 5173 belongs to the E2E smoke app (Playwright reuses a running server).
  // Under the E2E suite (PFUI_E2E), no forwarding of browser errors to the terminal:
  // the tests check them, and the source-map test throws on purpose.
  server: { port: 5190, ...(process.env.PFUI_E2E ? { forwardConsole: false } : {}) },
  preview: { port: 5191 },
  // React, ReactDOM, Mantine and (for the live compiler) the compiler: one ~670 kB chunk; fine here.
  // Two pages: the playground, and the layout demos (layouts.html?layout=…, not prerendered).
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: { input: { main: "index.html", layouts: "layouts.html" } },
  },
});
