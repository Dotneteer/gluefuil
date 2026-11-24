// The mock backend in a Vite app (step 20; design: .ai/plan/poc-20-data.md § 1).
// A plugin of its own (Vite allows one HTML transform per plugin; this one
// must run before Vite's, the prerender after).
//
//   host "worker"      the page's entry script is replaced by a bootstrap that
//                      starts MSW's service worker with the backend, then
//                      imports the entry: the app itself is unchanged
//   host "middleware"  the dev server answers the backend's paths over HTTP;
//                      nothing changes in the page
//
// A build contains mock code only with `build: true` (worker host).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { backendMiddleware } from "@patchfuil/mock-backend/middleware";

export interface MockBackendOptions {
  /** The module (relative to the Vite root) whose default export is the backend (`defineBackend`). */
  module: string;
  /** "worker" (default): a service worker in the page. "middleware": the dev server. */
  host?: "worker" | "middleware";
  /** Keep the worker host in production builds (a demo site, a preview). Default false. */
  build?: boolean;
}

/** The bootstrap's URL in the page (a virtual module). */
export const BOOTSTRAP_PATH = "/@pfui/mock-boot.js";
const BOOTSTRAP_ID = "\0pfui-mock-boot";
export const WORKER_SCRIPT = "mockServiceWorker.js";

/** The first module entry script of a page, `<script type="module" src="…">`. */
const ENTRY = /<script\s+type=["']module["']\s+src=["']([^"']+)["']\s*>\s*<\/script>/;

/** Replaces the page's entry script with the bootstrap (which imports the entry after the worker is ready). */
export function replaceEntry(html: string): { html: string; entry: string | undefined } {
  const match = ENTRY.exec(html);
  if (!match) return { html, entry: undefined };
  return { html: html.replace(match[0], `<script type="module" src="${BOOTSTRAP_PATH}?entry=${encodeURIComponent(match[1]!)}"></script>`), entry: match[1] };
}

/** The module the bootstrap (in the page, not this plugin) imports the worker host from. */
const WORKER_HOST = "@patchfuil/mock-backend/worker";

/** The bootstrap's code: start the worker, then run the app's entry (imported only after). */
export function bootstrapCode(backendModule: string, workerUrl: string, entry: string): string {
  return [
    `import { startWorker } from ${JSON.stringify(WORKER_HOST)};`,
    `import backend from ${JSON.stringify(backendModule)};`,
    `await startWorker(backend, { url: ${JSON.stringify(workerUrl)} });`,
    `await import(${JSON.stringify(entry)});`,
  ].join("\n");
}

/** MSW's worker script, from the mock backend's own dependency. */
function workerScript(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@patchfuil/mock-backend/package.json");
  return readFileSync(createRequire(packageJson).resolve(`msw/${WORKER_SCRIPT}`), "utf8");
}

export function pfuiMockBackend(options: MockBackendOptions): Plugin {
  const host = options.host ?? "worker";
  let config: ResolvedConfig | undefined;
  const active = () => host === "worker" && config !== undefined && (config.command === "serve" || options.build === true);
  const backendModule = () => resolve(config?.root ?? process.cwd(), options.module);
  return {
    name: "pfui-mock-backend",
    // MSW is the mock backend's dependency, not the app's: pre-bundled through it (`a > b`), so
    // the first page load doesn't discover it and reload every open page. (Listed plainly in the
    // app's own optimizeDeps.include, it can't be resolved from the app, and Vite drops the list.)
    config: () => (host === "worker" ? { optimizeDeps: { include: ["@patchfuil/mock-backend > msw", "@patchfuil/mock-backend > msw/browser"] } } : {}),
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: {
      // Before Vite's own HTML processing, which turns the entry script into the build's input.
      order: "pre",
      handler(html) {
        if (!active()) return html;
        return replaceEntry(html).html;
      },
    },
    // One bootstrap module per entry: `/@pfui/mock-boot.js?entry=/src/main.tsx`.
    resolveId(id) {
      if (!id.startsWith(`${BOOTSTRAP_PATH}?`)) return undefined;
      const entry = new URLSearchParams(id.slice(BOOTSTRAP_PATH.length + 1)).get("entry");
      return entry ? `${BOOTSTRAP_ID}:${entry}` : undefined;
    },
    load(id) {
      if (!id.startsWith(`${BOOTSTRAP_ID}:`)) return undefined;
      const base = config?.base ?? "/";
      return bootstrapCode(backendModule(), `${base}${WORKER_SCRIPT}`, id.slice(BOOTSTRAP_ID.length + 1));
    },
    configureServer(server) {
      if (host === "middleware") {
        // Loaded once: the backend's state lives in this instance for the session.
        const backend = server.ssrLoadModule(backendModule()).then((module) => (module as { default: never }).default);
        server.middlewares.use(backendMiddleware(backend));
        return;
      }
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== `${config?.base ?? "/"}${WORKER_SCRIPT}`) return next();
        response.setHeader("content-type", "text/javascript");
        response.end(workerScript());
      });
    },
    generateBundle() {
      if (active()) this.emitFile({ type: "asset", fileName: WORKER_SCRIPT, source: workerScript() });
    },
  };
}
