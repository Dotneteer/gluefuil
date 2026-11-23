// Build-time compilation: compiles .pfui files to ES modules during a Vite
// build or dev session. The shipped app imports only the runtime and the
// components; the compiler stays in the build.
import {
  codeFrame,
  compileModule,
  formatDiagnostic,
  LineMap,
  type Diagnostic,
  type UserComponentInfo,
} from "@patchfuil/compiler";
import { componentMetadata, type ComponentMetadata } from "@patchfuil/components/metadata";
import { basename, dirname, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { ComponentFolder, importSpecifier, readCodeBehind } from "./components";
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
  /**
   * The folder of user-defined component files (`<Name>.pfui`, each defining
   * `<Component name="Name">`), relative to the Vite root. Default "src/components".
   */
  componentsDir?: string;
  /**
   * Component contract violations are errors (default true) or warnings
   * (false, for migrating XMLUI markup). See compileModule `strictContracts`.
   */
  strictContracts?: boolean;
  /**
   * The app's own React components, usable from markup: name → the module
   * (relative to the Vite root) that exports a component of that name, and its
   * metadata (checked like a built-in's). Wrap a third-party component with
   * `wrapComponent` from @patchfuil/runtime in that module.
   */
  extensions?: Readonly<Record<string, { module: string; metadata: ComponentMetadata }>>;
}

/** Query parameters that make Vite load a file as something other than a module (`?raw`). */
const NON_MODULE_QUERY = /[?&](raw|url|inline|worker|sharedworker)\b/;

const EXTENSION = ".pfui";

/** The file path of a module id: without a `?query` or `#hash`. */
export function pfuiFilePath(id: string): string | undefined {
  // `Main.pfui?raw` is the file's text (import.meta.glob of sources), not a module to compile.
  if (NON_MODULE_QUERY.test(id)) return undefined;
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
  let folder: ComponentFolder | undefined;
  // Extensions: their metadata joins the built-ins'; each file imports them by a path relative to itself.
  const extensionOptions = (file: string) => {
    if (!options.extensions) return options.components ? { components: options.components } : {};
    const components: Record<string, ComponentMetadata> = { ...(options.components ?? componentMetadata) };
    const componentModules: Record<string, string> = {};
    for (const [name, extension] of Object.entries(options.extensions)) {
      components[name] = extension.metadata;
      componentModules[name] = importSpecifier(dirname(file), resolve(config?.root ?? process.cwd(), extension.module));
    }
    return { components, componentModules };
  };
  const componentsFolder = () => (folder ??= new ComponentFolder(resolve(config?.root ?? process.cwd(), options.componentsDir ?? "src/components")));
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
        const transform = pfui({
          sourceMap: false,
          ...(options.components ? { components: options.components } : {}),
          ...(options.extensions ? { extensions: options.extensions } : {}),
          ...(options.strictContracts !== undefined ? { strictContracts: options.strictContracts } : {}),
          ...(options.componentsDir ? { componentsDir: options.componentsDir } : {}),
        });
        const { html: inner, attributes } = await renderEntry(config.root, prerender, transform);
        return injectPrerendered(html, prerender.rootId, inner, attributes);
      },
    },
    configureServer(server) {
      // A component file (or code-behind) appearing or disappearing changes what
      // other files compile to: recompile every .pfui module and reload.
      const changed = (path: string) => {
        if (!path.endsWith(".pfui") && !path.endsWith(".pfui.xs")) return;
        for (const [id, module] of server.moduleGraph.idToModuleMap) {
          if (pfuiFilePath(id)) server.moduleGraph.invalidateModule(module);
        }
        server.hot.send({ type: "full-reload" });
      };
      server.watcher.on("add", changed);
      server.watcher.on("unlink", changed);
    },
    transform(source, id) {
      const file = pfuiFilePath(id);
      if (!file) return undefined;
      // The other component files' interfaces; a change to one recompiles this file.
      const userComponents: Record<string, UserComponentInfo> = {};
      for (const [name, found] of componentsFolder().scan()) {
        this.addWatchFile(found.file);
        if (found.file === file) continue;
        userComponents[name] = { ...found.info, module: importSpecifier(dirname(file), found.file) };
      }
      const codeBehind = readCodeBehind(file);
      if (codeBehind !== undefined) this.addWatchFile(`${file}.xs`);
      const { code, map, diagnostics, codeBehindDiagnostics } = compileModule(source, {
        format: "esm",
        // The map's source resolves relative to the module's URL.
        fileName: basename(file),
        sourceMap,
        userComponents,
        ...(codeBehind !== undefined ? { codeBehind } : {}),
        ...extensionOptions(file),
        ...(options.strictContracts !== undefined ? { strictContracts: options.strictContracts } : {}),
      });
      if (codeBehind !== undefined) {
        const xsLines = new LineMap(codeBehind);
        for (const warning of (codeBehindDiagnostics ?? []).filter((d) => d.severity === "warning")) {
          const { line, column } = xsLines.positionAt(warning.start);
          this.warn({ message: formatDiagnostic(warning, xsLines, `${file}.xs`), loc: { file: `${file}.xs`, line: line + 1, column } });
        }
      }
      const codeBehindErrors = (codeBehindDiagnostics ?? []).filter((d) => d.severity === "error");
      if (codeBehind !== undefined && codeBehindErrors.length > 0) {
        const xs = `${file}.xs`;
        const xsLines = new LineMap(codeBehind);
        const { line, column } = xsLines.positionAt(codeBehindErrors[0]!.start);
        this.error({
          message: `${codeBehindErrors.length} error${codeBehindErrors.length === 1 ? "" : "s"} in ${basename(xs)}:\n${formatErrors(codeBehindErrors, codeBehind, xs)}`,
          id: xs,
          loc: { file: xs, line: line + 1, column },
          frame: codeFrame(codeBehind, xsLines, codeBehindErrors[0]!.start),
        });
      }
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
