import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// One Vitest project per package. The compiler runs in plain Node (it must
// not depend on a DOM); the React-side packages run in jsdom.
export default defineConfig({
  test: {
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
        },
      },
      {
        plugins: [react()],
        test: {
          name: "components",
          root: "packages/components",
          environment: "jsdom",
          include: ["tests/**/*.test.{ts,tsx}"],
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
