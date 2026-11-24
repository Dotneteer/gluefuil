import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// One Vitest project per package. The compiler runs in plain Node (it must
// not depend on a DOM); the React-side packages run in jsdom.
export default defineConfig({
  test: {
    // Isolation is chosen explicitly (which also silences Vitest's "faster with
    // isolate: false" hint). Measured in step 5: 1.19-1.22 s isolated vs
    // 1.16-1.21 s with --no-isolate, i.e. no wall-clock gain, because files
    // already run in parallel. Isolation keeps module state (the signal store's
    // batch queue, React's act-environment flag) and the jsdom DOM from leaking
    // between test files.
    isolate: true,
    projects: [
      {
        test: {
          name: "compiler",
          root: "packages/compiler",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          benchmark: {
            // Benchmarks run only via `npm run bench` (vitest bench).
            include: ["bench/**/*.bench.ts"],
            // Vitest's dev module runner wraps cross-module exports in getters;
            // bundled production code has none. Measured on step 1: the getters
            // make the parser benchmark ~15-20% slower, so the reported numbers
            // are slightly pessimistic. Suppressed to keep the output readable.
            suppressExportGetterWarnings: true,
          },
        },
      },
      {
        plugins: [react()],
        test: {
          name: "runtime",
          root: "packages/runtime",
          environment: "jsdom",
          include: ["tests/**/*.test.{ts,tsx}"],
          benchmark: {
            include: ["bench/**/*.bench.{ts,tsx}"],
            suppressExportGetterWarnings: true,
          },
        },
      },
      {
        plugins: [react()],
        test: {
          name: "components",
          root: "packages/components",
          environment: "jsdom",
          setupFiles: ["tests/jsdom-setup.ts"],
          include: ["tests/**/*.test.{ts,tsx}"],
          benchmark: {
            include: ["bench/**/*.bench.{ts,tsx}"],
            suppressExportGetterWarnings: true,
          },
        },
      },
      {
        plugins: [react()],
        test: {
          name: "standalone",
          root: "packages/standalone",
          environment: "jsdom",
          setupFiles: ["../components/tests/jsdom-setup.ts"],
          include: ["tests/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "vite-plugin",
          root: "packages/vite-plugin",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "tools",
          root: "tools",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
    ],
  },
});
