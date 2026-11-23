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
  server: { port: 5190 },
  preview: { port: 5191 },
  // React, ReactDOM, Mantine and (for the live compiler) the compiler: one ~670 kB chunk; fine here.
  build: { chunkSizeWarningLimit: 900 },
});
