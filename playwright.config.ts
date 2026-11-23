import { defineConfig, devices } from "@playwright/test";

const chrome = devices["Desktop Chrome"];

// The hello app's specs: they run against the dev server and the production build.
const HELLO_SPECS = /(first-app|variables|async-handlers|ids|conditionals-templates|user-components|theming)\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5173" } },
    {
      // Dev server: on-the-fly compilation, with source maps.
      name: "hello-dev",
      testMatch: [HELLO_SPECS, /source-maps\.spec\.ts/],
      use: { ...chrome, baseURL: "http://localhost:5174" },
    },
    {
      // Production build served under a strict CSP (step 12): no compiler, no eval.
      // Prerendered (step 13): every hello spec here runs after a takeover.
      name: "hello-build",
      testMatch: [HELLO_SPECS, /build\.spec\.ts/, /ssg\.spec\.ts/],
      use: { ...chrome, baseURL: "http://localhost:5176" },
    },
    { name: "standalone", testMatch: /standalone\.spec\.ts/, use: chrome },
  ],
  webServer: [
    {
      command: "npx vite --config test-apps/smoke/vite.config.ts --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --config test-apps/hello/vite.config.ts --configLoader runner --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Standalone mode: build dist/pfui.js, then serve a temp copy of the fixture site.
      command:
        "npm run build:standalone && node tools/static-server.mjs --port 5175 --site e2e/fixtures/standalone-site --work .tmp/standalone-site --bundle packages/standalone/dist",
      url: "http://localhost:5175",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Build-time compilation: build the hello app, then serve it with `vite preview`
      // (its config sets `Content-Security-Policy: script-src 'self'`).
      command:
        "npx vite build --config test-apps/hello/vite.config.ts --configLoader runner --outDir ../../.tmp/hello-dist --emptyOutDir && npx vite preview --config test-apps/hello/vite.config.ts --configLoader runner --outDir ../../.tmp/hello-dist --port 5176 --strictPort",
      url: "http://localhost:5176",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
