// Static generation: render the app to HTML during the build and put it into
// index.html, where `mountApp` (runtime) takes it over with hydration.

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
}

export type ResolvedPrerender = Required<PrerenderOptions>;

export function resolvePrerender(option: boolean | PrerenderOptions | undefined): ResolvedPrerender | undefined {
  if (!option) return undefined;
  const given = option === true ? {} : option;
  return { entry: given.entry ?? "src/Main.pfui", rootId: given.rootId ?? "root", breakpoint: given.breakpoint ?? "xs" };
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

interface RenderModule {
  renderStatic(app: unknown, options: { breakpoint: BreakpointName }): { html: string; attributes: Record<string, string> };
}

/**
 * Renders the entry component to HTML in a temporary Vite server (SSR), with
 * `transform` (the plugin's compile step) as its only plugin. The entry and
 * `@patchfuil/runtime/server` load into the same module graph, so they share
 * one runtime and one React.
 */
export async function renderEntry(root: string, options: ResolvedPrerender, transform: Plugin) {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [transform],
  });
  try {
    const entry = (await server.ssrLoadModule(resolve(root, options.entry))) as { default?: unknown };
    if (typeof entry.default !== "function") {
      throw new Error(`pfui prerender: ${options.entry} has no default export (a .pfui file's root component)`);
    }
    const runtime = (await server.ssrLoadModule("@patchfuil/runtime/server")) as RenderModule;
    return runtime.renderStatic(entry.default, { breakpoint: options.breakpoint });
  } finally {
    await server.close();
  }
}
