// Static generation: render the app to HTML during the build and put it into
// index.html, where `mountApp` (runtime) takes it over with hydration.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, type Plugin } from "vite";

export type BreakpointName = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export interface PrerenderOptions {
  /** The root component's file, relative to the Vite root. Default "src/Main.pfui". */
  entry?: string;
  /** The id of the empty element in index.html to fill. Default "root". */
  rootId?: string;
  /** The viewport the HTML is rendered for. Default "xs" (mobile-first). */
  breakpoint?: BreakpointName;
  /**
   * More paths to render, besides the static routes (step 21): concrete paths
   * of routes with parameters (`/users/1`). Each must match a registered
   * route. Browser routing only (`App useHashBasedRouting="false"`).
   */
  routes?: string[];
}

export type ResolvedPrerender = Required<PrerenderOptions>;

export function resolvePrerender(option: boolean | PrerenderOptions | undefined): ResolvedPrerender | undefined {
  if (!option) return undefined;
  const given = option === true ? {} : option;
  return { entry: given.entry ?? "src/Main.pfui", rootId: given.rootId ?? "root", breakpoint: given.breakpoint ?? "xs", routes: given.routes ?? [] };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Puts `inner` into the element with `id="<rootId>"` and adds `attributes`.
 * The element must exist and be empty (whitespace allowed): prerendered
 * content never replaces something the page author wrote.
 */
export function injectPrerendered(html: string, rootId: string, inner: string, attributes: Record<string, string>): string {
  const open = new RegExp(`<([a-zA-Z][\\w-]*)(\\s[^>]*?)?\\sid=(["'])${escapeRegExp(rootId)}\\3([^>]*)>`);
  const match = open.exec(html);
  if (!match) throw new Error(`pfui prerender: index.html has no element with id="${rootId}"`);
  if (match[0].endsWith("/>")) throw new Error(`pfui prerender: the element with id="${rootId}" must not be self-closing`);
  const tag = match[1]!;
  const rest = html.slice(match.index + match[0].length);
  const close = new RegExp(`^(\\s*)</${tag}\\s*>`).exec(rest);
  if (!close) throw new Error(`pfui prerender: the element with id="${rootId}" in index.html must be empty`);
  const added = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  return `${html.slice(0, match.index)}${match[0].slice(0, -1)}${added}>${inner}${rest.slice(close[1]!.length)}`;
}

/**
 * Adds attributes to the element with `id="<rootId>"`, keeping its content;
 * the html is returned unchanged when there is no such element.
 */
export function addRootAttributes(html: string, rootId: string, attributes: Record<string, string>): string {
  const open = new RegExp(`<([a-zA-Z][\\w-]*)(\\s[^>]*?)?\\sid=(["'])${escapeRegExp(rootId)}\\3([^>]*?)(\\/?)>`);
  const match = open.exec(html);
  if (!match) return html;
  const added = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  const tagEnd = match[0].length - (match[5] ? 2 : 1);
  return `${html.slice(0, match.index)}${match[0].slice(0, tagEnd)}${added}${match[0].slice(tagEnd)}${html.slice(match.index + match[0].length)}`;
}

/**
 * The router's basename for a Vite `base` (step 21, part 2): `/app/` → `/app`.
 * A root, relative (`./`) or full-URL base (assets on a CDN) has none: the
 * routes stay at the page's root.
 */
export function basenameOf(base: string): string {
  if (!base.startsWith("/")) return "";
  return base.replace(/\/+$/, "");
}

export interface RenderedRoute {
  html: string;
  attributes: Record<string, string>;
}

interface RenderModule {
  renderStatic(app: unknown, options: { breakpoint: BreakpointName; path: string; basename: string }): RenderedRoute;
  resetServerState(): void;
  registeredRoutes(): readonly string[];
  routingMode(): "hash" | "browser";
  findRoute(pathname: string, patterns: readonly string[]): unknown;
}

/** A route pattern without parameters or a wildcard: one file of the prerender. */
export function isStaticRoute(pattern: string): boolean {
  return !/[:*]/.test(pattern);
}

/** The output file of a route: `/` is `index.html`, `/a/b` is `a/b/index.html` (as XMLUI's ssg). */
export function routeFileName(path: string): string {
  const trimmed = path.replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

/**
 * The paths to render after "/": in browser mode, the static routes and the
 * `routes` option; in hash mode none (the server never sees the route), and
 * `routes` is an error.
 */
export function routesToRender(mode: "hash" | "browser", registered: readonly string[], extra: readonly string[], matches: (path: string) => boolean): string[] {
  if (mode === "hash") {
    if (extra.length > 0) {
      throw new Error('pfui prerender: the "routes" option needs browser routing (App useHashBasedRouting="false"); with hash routing every route is served from index.html');
    }
    return [];
  }
  for (const path of extra) {
    if (!matches(path)) throw new Error(`pfui prerender: the route "${path}" (option "routes") matches no Page url`);
  }
  const paths = [...registered.filter(isStaticRoute), ...extra].map((path) => path.replace(/\/+$/, "") || "/");
  return [...new Set(paths)].filter((path) => path !== "/");
}

/**
 * Renders the entry component to HTML in a temporary Vite server (SSR), with
 * `transform` (the plugin's compile step) as its only plugin. The entry and
 * `@patchfuil/runtime/server` load into the same module graph, so they share
 * one runtime and one React. "/" is rendered first; with browser routing,
 * every static route (and `routes`) after it, each from a reset runtime state.
 * Returns the routes in render order, "/" first.
 */
export async function renderEntry(root: string, options: ResolvedPrerender, transform: Plugin, basename = ""): Promise<Map<string, RenderedRoute>> {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    // Its own cache, and no client pre-bundling: it only renders on the server. (Sharing the app's
    // node_modules/.vite rewrote a running dev server's pre-bundled dependencies under it: pages then
    // failed with 504 "Outdated Optimize Dep". Found in step 20.)
    cacheDir: resolve(root, "node_modules/.vite-pfui-prerender"),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [transform],
  });
  try {
    const entry = (await server.ssrLoadModule(resolve(root, options.entry))) as { default?: unknown };
    if (typeof entry.default !== "function") {
      throw new Error(`pfui prerender: ${options.entry} has no default export (a .pfui file's root component)`);
    }
    const runtime = (await server.ssrLoadModule("@patchfuil/runtime/server")) as RenderModule;
    const render = (path: string) => {
      runtime.resetServerState();
      return runtime.renderStatic(entry.default, { breakpoint: options.breakpoint, path, basename });
    };
    const rendered = new Map<string, RenderedRoute>([["/", render("/")]]);
    // Pages registered its routes while "/" rendered, and App set the mode.
    const registered = runtime.registeredRoutes();
    const paths = routesToRender(runtime.routingMode(), registered, options.routes, (path) => runtime.findRoute(path.replace(/[?#].*$/, ""), registered) !== undefined);
    for (const path of paths) rendered.set(path, render(path));
    runtime.resetServerState();
    return rendered;
  } finally {
    await server.close();
  }
}

/**
 * `vite preview` serves `about/index.html` only for `/about/`; static hosts
 * (Netlify, GitHub Pages, nginx with `try_files $uri $uri/`) also serve it, or
 * redirect to it, for `/about`. Returns the URL to serve instead: the
 * directory index of an extensionless path when the build has one.
 */
export function previewRewrite(url: string, outDir: string, basename = ""): string | undefined {
  const [path = "", query] = url.split("?", 2) as [string?, string?];
  if (path.endsWith("/") || /\.[^/]*$/.test(path)) return undefined;
  // Under a base (`/app/about`), the file is about/index.html in the output folder.
  if (basename !== "" && path !== basename && !path.startsWith(`${basename}/`)) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  if (decoded.includes("..")) return undefined;
  if (!existsSync(resolve(outDir, `.${decoded.slice(basename.length)}`, "index.html"))) return undefined;
  return `${path}/index.html${query !== undefined ? `?${query}` : ""}`;
}
