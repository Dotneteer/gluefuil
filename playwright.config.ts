import { defineConfig, devices } from "@playwright/test";

const chrome = devices["Desktop Chrome"];

// The hello app's specs: they run against the dev server and the production build.
const HELLO_SPECS = /(first-app|variables|async-handlers|ids|conditionals-templates|user-components|theming|behaviors|mantine|globals)\.spec\.ts/;

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
    // Routing (step 19): the same spec on the dev server and the prerendered build.
    { name: "routing-dev", testMatch: /routing\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5177" } },
    { name: "routing-build", testMatch: /routing\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5178" } },
    // Forms (step 22): the same spec on the dev server and the prerendered build.
    { name: "forms-dev", testMatch: /forms\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5186" } },
    { name: "forms-build", testMatch: /forms\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5187" } },
    // Browser routing (step 21): every static route prerendered, served by a static server.
    { name: "routing-browser-build", testMatch: /routing-browser\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5184" } },
    // The same app built under base /app/ (step 21, part 2): the router's basename.
    { name: "routing-base-build", testMatch: /routing-base\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5185" } },
    // The manual-testing playground: every scenario still opens (smoke); the App shell and layout demos.
    { name: "playground", testMatch: /(playground(-scenarios)?|app-shell|layout)\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5180" } },
    // Data binding (step 20): the same app and specs against the mock backend in two hosts.
    { name: "data-worker", testMatch: /data\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5182" } },
    // One backend in the dev server for all tests: they run one after another (each resets it).
    { name: "data-server", testMatch: /data\.spec\.ts/, fullyParallel: false, workers: 1, use: { ...chrome, baseURL: "http://localhost:5183" } },
    // The App shell prerendered (steps 19A–19C): the playground's production build.
    { name: "playground-build", testMatch: /app-shell-prerender\.spec\.ts/, use: { ...chrome, baseURL: "http://localhost:5181" } },
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
    {
      command: "npx vite --config test-apps/routing/vite.config.ts --configLoader runner --port 5177 --strictPort",
      url: "http://localhost:5177",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npx vite build --config test-apps/routing/vite.config.ts --configLoader runner --outDir ../../.tmp/routing-dist --emptyOutDir && npx vite preview --config test-apps/routing/vite.config.ts --configLoader runner --outDir ../../.tmp/routing-dist --port 5178 --strictPort",
      url: "http://localhost:5178",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --config test-apps/forms/vite.config.ts --configLoader runner --port 5186 --strictPort",
      url: "http://localhost:5186",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npx vite build --config test-apps/forms/vite.config.ts --configLoader runner --outDir ../../.tmp/forms-dist --emptyOutDir && npx vite preview --config test-apps/forms/vite.config.ts --configLoader runner --outDir ../../.tmp/forms-dist --port 5187 --strictPort",
      url: "http://localhost:5187",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npx vite build --config test-apps/routing-browser/vite.config.ts --configLoader runner --outDir ../../.tmp/routing-browser-dist --emptyOutDir && npx vite preview --config test-apps/routing-browser/vite.config.ts --configLoader runner --outDir ../../.tmp/routing-browser-dist --port 5184 --strictPort",
      url: "http://localhost:5184",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npx vite build --config test-apps/routing-browser/vite.config.ts --configLoader runner --base /app/ --outDir ../../.tmp/routing-base-dist --emptyOutDir && npx vite preview --config test-apps/routing-browser/vite.config.ts --configLoader runner --base /app/ --outDir ../../.tmp/routing-base-dist --port 5185 --strictPort",
      url: "http://localhost:5185/app/",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --config test-apps/data/vite.config.ts --configLoader runner --port 5182 --strictPort",
      env: { PFUI_MOCK_HOST: "worker" },
      url: "http://localhost:5182",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --config test-apps/data/vite.config.ts --configLoader runner --port 5183 --strictPort",
      env: { PFUI_MOCK_HOST: "middleware" },
      url: "http://localhost:5183",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --config playground/vite.config.ts --configLoader runner --port 5180 --strictPort",
      env: { PFUI_E2E: "1" },
      url: "http://localhost:5180",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "npx vite build --config playground/vite.config.ts --configLoader runner --outDir ../.tmp/playground-dist --emptyOutDir && npx vite preview --config playground/vite.config.ts --configLoader runner --outDir ../.tmp/playground-dist --port 5181 --strictPort",
      url: "http://localhost:5181",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
