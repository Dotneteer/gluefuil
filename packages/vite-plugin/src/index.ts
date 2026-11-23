// Build-time compilation: compiles .pfui files to ES modules during a Vite
// build or dev session. The shipped app imports only the runtime and the
// components; the compiler stays in the build.
import {
  codeFrame,
  compileModule,
  formatDiagnostic,
  LineMap,
  type Diagnostic,
} from "@patchfuil/compiler";
import type { ComponentMetadata } from "@patchfuil/components/metadata";
import { basename } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { injectPrerendered, renderEntry, resolvePrerender, type PrerenderOptions } from "./prerender";

export { injectPrerendered, type BreakpointName, type PrerenderOptions } from "./prerender";

export interface PfuiPluginOptions {
  /** The components markup may use. Default: the built-in components. */
  components?: Readonly<Record<string, ComponentMetadata>>;
  /**
   * Source maps back to the .pfui files. `"auto"` (default): always while
   * serving; in a build, only when `build.sourcemap` is set. Without a map the
   * compiler skips its position markers, which is faster.
   */
  sourceMap?: boolean | "auto";
  /**
   * Static generation: in a build, render the app to HTML and put it into
   * index.html, where `mountApp` takes it over. `true` uses the defaults
   * (entry `src/Main.pfui`, root id `root`, breakpoint `xs`). Off by default.
   */
  prerender?: boolean | PrerenderOptions;
}

const EXTENSION = ".pfui";

/** The file path of a module id: without a `?query` or `#hash`. */
export function pfuiFilePath(id: string): string | undefined {
  const path = id.replace(/[?#].*$/, "");
  return path.endsWith(EXTENSION) ? path : undefined;
}

/** All errors as `file:line:col: error CODE: message`, each with its code frame. */
export function formatErrors(errors: readonly Diagnostic[], source: string, file: string): string {
  const lineMap = new LineMap(source);
  return errors.map((d) => `${formatDiagnostic(d, lineMap, file)}\n${codeFrame(source, lineMap, d.start)}`).join("\n");
}

export function pfui(options: PfuiPluginOptions = {}): Plugin {
  const sourceMapOption = options.sourceMap ?? "auto";
  const prerender = resolvePrerender(options.prerender);
  let sourceMap = true;
  let config: ResolvedConfig | undefined;
  return {
    name: "pfui",
    // Before other transforms (React's), which expect JavaScript.
    enforce: "pre",
    configResolved(resolved: ResolvedConfig) {
      config = resolved;
      sourceMap = sourceMapOption === "auto" ? resolved.command === "serve" || !!resolved.build.sourcemap : sourceMapOption;
    },
    transformIndexHtml: {
      // After other plugins: the page is final except for the app's HTML.
      order: "post",
      async handler(html) {
        if (!prerender || !config || config.command !== "build" || config.build.ssr) return html;
        // The render's own server uses only the compile step (no prerender, no maps).
        const transform = pfui({ sourceMap: false, ...(options.components ? { components: options.components } : {}) });
        const { html: inner, attributes } = await renderEntry(config.root, prerender, transform);
        return injectPrerendered(html, prerender.rootId, inner, attributes);
      },
    },
    transform(source, id) {
      const file = pfuiFilePath(id);
      if (!file) return undefined;
      const { code, map, diagnostics } = compileModule(source, {
        format: "esm",
        // The map's source resolves relative to the module's URL.
        fileName: basename(file),
        sourceMap,
        ...(options.components ? { components: options.components } : {}),
      });
      const lineMap = new LineMap(source);
      for (const warning of diagnostics.filter((d) => d.severity === "warning")) {
        const { line, column } = lineMap.positionAt(warning.start);
        this.warn({ message: formatDiagnostic(warning, lineMap, file), loc: { file, line: line + 1, column } });
      }
      const errors = diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        const first = errors[0]!;
        const { line, column } = lineMap.positionAt(first.start);
        this.error({
          message: `${errors.length} error${errors.length === 1 ? "" : "s"} in ${basename(file)}:\n${formatErrors(errors, source, file)}`,
          id: file,
          loc: { file, line: line + 1, column },
          frame: codeFrame(source, lineMap, first.start),
        });
      }
      return { code, map: map ?? { mappings: "" } };
    },
  };
}

export default pfui;
