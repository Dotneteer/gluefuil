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
