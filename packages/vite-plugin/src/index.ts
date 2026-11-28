// Build-time compilation: compiles .gui files to ES modules during a Vite
// build or dev session. The shipped app imports only the runtime and the
// components; the compiler stays in the build.
import {
  codeFrame,
  compileModule,
  formatDiagnostic,
  LineMap,
  type Diagnostic,
  type UserComponentInfo,
} from "@gluefuil/compiler";
import { componentMetadata, type ComponentMetadata } from "@gluefuil/components/metadata";
import { inspectorComponents } from "@gluefuil/inspector/metadata";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type { Plugin, ResolvedConfig, UserConfig } from "vite";
import { AppGlobals, ComponentFolder, GLOBALS_FILE, importSpecifier, readCodeBehind } from "./components";
import { appLocaleOf, localeFileErrors, localeFiles, localeRegistrationCode } from "./locales";
import { addRootAttributes, basenameOf, clientRenderedSections, injectDocumentAttributes, injectPrerendered, injectTitle, previewRewrite, renderEntry, resolvePrerender, routeFileName, type PrerenderOptions } from "./prerender";

export { basenameOf, injectPrerendered, type BreakpointName, type PrerenderOptions } from "./prerender";
export { gfuiMockBackend, type MockBackendOptions } from "./mock";

export interface GfuiPluginOptions {
  /**
   * The app's root file, relative to the Vite root. Default "src/Main.gui".
   * Its root's `global.*` and the `Globals.xs` beside it are the globals every
   * other file sees (step 21B); the prerender renders it.
   */
  entry?: string;
  /** The components markup may use. Default: the built-in components. */
  components?: Readonly<Record<string, ComponentMetadata>>;
  /**
   * Source maps back to the .gui files. `"auto"` (default): always while
   * serving; in a build, only when `build.sourcemap` is set. Without a map the
   * compiler skips its position markers, which is faster.
   */
  sourceMap?: boolean | "auto";
  /**
   * Static generation: in a build, render the app to HTML and put it into
   * index.html, where `mountApp` takes it over. `true` uses the defaults
   * (entry `src/Main.gui`, root id `root`, breakpoint `xs`). Off by default.
   */
  prerender?: boolean | PrerenderOptions;
  /**
   * The folder of user-defined component files (`<Name>.gui`, each defining
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
   * `wrapComponent` from @gluefuil/runtime in that module.
   */
  extensions?: Readonly<Record<string, { module: string; metadata: ComponentMetadata }>>;
  /**
   * Step 35: the Inspector page at `<base>__gfui/inspector/`, and tracing on by
   * default. Default: on while serving, off in a build.
   */
  inspector?: boolean;
}

/** Step 35: where the Inspector is served, under Vite's base. */
export const INSPECTOR_PATH = "__gfui/inspector/";

/** Step 35: the Inspector's sources (@gluefuil/inspector's src folder). */
const inspectorDir = dirname(createRequire(import.meta.url).resolve("@gluefuil/inspector/metadata"));

/** Step 35: whether a file is one of the Inspector's own. */
export function isInspectorFile(file: string): boolean {
  return file.startsWith(inspectorDir + sep);
}

/** Step 35: the Inspector's entry module, as a page's script src resolves it (the plugin maps it). */
export const INSPECTOR_ENTRY = "/@gfui/inspector-entry.tsx";

/** Step 35: the Inspector page in a build (`inspector: true`): an input of its own, served at <base>__gfui/inspector/. */
export const INSPECTOR_HTML = `${INSPECTOR_PATH}index.html`;

/**
 * Step 35: the Inspector page: its entry module, and (on the dev server) the
 * project root, for opening files in the editor.
 */
export function inspectorHtml(base: string, projectRoot: string | undefined): string {
  const entry = projectRoot === undefined ? INSPECTOR_ENTRY : `${base}@fs${resolve(inspectorDir, "main.tsx").split(sep).join("/")}`;
  const root = projectRoot === undefined ? "" : ` data-gfui-project-root="${projectRoot.split(sep).join("/").replace(/"/g, "&quot;")}"`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>gfui Inspector</title>
  </head>
  <body>
    <div id="root"${root}></div>
    <script type="module" src="${entry}"></script>
  </body>
</html>
`;
}

/** Query parameters that make Vite load a file as something other than a module (`?raw`). */
const NON_MODULE_QUERY = /[?&](raw|url|inline|worker|sharedworker)\b/;

const EXTENSION = ".gui";

/** The container attribute mountApp reads the basename from (runtime `BASE_ATTRIBUTE`). */
const BASE_ATTRIBUTE = "data-gfui-base";

/** The file path of a module id: without a `?query` or `#hash`. */
export function gfuiFilePath(id: string): string | undefined {
  // `Main.gui?raw` is the file's text (import.meta.glob of sources), not a module to compile.
  if (NON_MODULE_QUERY.test(id)) return undefined;
  const path = id.replace(/[?#].*$/, "");
  return path.endsWith(EXTENSION) ? path : undefined;
}

/** All errors as `file:line:col: error CODE: message`, each with its code frame. */
export function formatErrors(errors: readonly Diagnostic[], source: string, file: string): string {
  const lineMap = new LineMap(source);
  return errors.map((d) => `${formatDiagnostic(d, lineMap, file)}\n${codeFrame(source, lineMap, d.start)}`).join("\n");
}

export function gfui(options: GfuiPluginOptions = {}): Plugin {
  const sourceMapOption = options.sourceMap ?? "auto";
  const prerender = resolvePrerender(options.prerender, options.entry);
  let sourceMap = true;
  let config: ResolvedConfig | undefined;
  let folder: ComponentFolder | undefined;
  // Prerendered routes other than "/" (step 21), emitted next to index.html.
  let routePages: { fileName: string; source: string }[] = [];
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
  // Step 35: the Inspector: on while serving unless turned off; in a build only when asked for.
  const inspectorOn = () => options.inspector ?? config?.command === "serve";
  const componentsFolder = () => (folder ??= new ComponentFolder(resolve(config?.root ?? process.cwd(), options.componentsDir ?? "src/components")));
  let appGlobals: AppGlobals | undefined;
  const globalsOf = () => (appGlobals ??= new AppGlobals(resolve(config?.root ?? process.cwd(), options.entry ?? "src/Main.gui")));
  /** Step 35: the build's Inspector page, as an absolute id under the root. */
  const inspectorPage = () => resolve(config?.root ?? process.cwd(), INSPECTOR_HTML);
  return {
    name: "gfui",
    // Before other transforms (React's), which expect JavaScript.
    enforce: "pre",
    config(user: UserConfig, env: { command: string }) {
      // Step 35: a build with `inspector: true` gets the Inspector page as another input.
      if (env.command !== "build" || options.inspector !== true || user.build?.ssr) return undefined;
      const root = resolve(user.root ?? process.cwd());
      const page = resolve(root, INSPECTOR_HTML);
      const input = user.build?.rollupOptions?.input;
      const inputs: Record<string, string> =
        input === undefined ? { index: resolve(root, "index.html") } : typeof input === "string" ? { index: input } : Array.isArray(input) ? Object.fromEntries(input.map((file, i) => [`input${i}`, file])) : { ...input };
      return { build: { rollupOptions: { input: { ...inputs, gfuiInspector: page } } } };
    },
    resolveId(id: string) {
      // Step 35: the build's Inspector page (virtual) and its entry.
      if (id === INSPECTOR_ENTRY) return resolve(inspectorDir, "main.tsx");
      if (options.inspector === true && config?.command === "build" && resolve(id) === inspectorPage()) return inspectorPage();
      return undefined;
    },
    load(id: string) {
      if (options.inspector === true && config?.command === "build" && id === inspectorPage()) return inspectorHtml(config.base, undefined);
      return undefined;
    },
    configResolved(resolved: ResolvedConfig) {
      config = resolved;
      sourceMap = sourceMapOption === "auto" ? resolved.command === "serve" || !!resolved.build.sourcemap : sourceMapOption;
    },
    transformIndexHtml: {
      // After other plugins: the page is final except for the app's HTML.
      order: "post",
      async handler(html, context) {
        if (!config || config.build.ssr) return html;
        // Only index.html: other pages of a multi-page build have their own entries.
        if (context?.path !== undefined && context.path !== "/index.html") return html;
        // The router's basename (step 21, part 2): Vite's base, on the container for mountApp.
        const basename = basenameOf(config.base ?? "/");
        // Step 35: while serving, tracing is on and the Inspector is at <base>__gfui/inspector/.
        const traceAttributes: Record<string, string> = inspectorOn() ? { "data-gfui-inspector": `${config.base ?? "/"}${INSPECTOR_PATH}` } : {};
        if (config.command === "serve" && inspectorOn()) traceAttributes["data-gfui-trace"] = "on";
        if (!prerender || config.command !== "build") {
          const attributes = { ...(basename === "" ? {} : { [BASE_ATTRIBUTE]: basename }), ...traceAttributes };
          return Object.keys(attributes).length === 0 ? html : addRootAttributes(html, prerender?.rootId ?? "root", attributes);
        }
        // The render's own server uses only the compile step (no prerender, no maps).
        const transform = gfui({
          sourceMap: false,
          ...(options.entry ? { entry: options.entry } : {}),
          ...(options.components ? { components: options.components } : {}),
          ...(options.extensions ? { extensions: options.extensions } : {}),
          ...(options.strictContracts !== undefined ? { strictContracts: options.strictContracts } : {}),
          ...(options.componentsDir ? { componentsDir: options.componentsDir } : {}),
        });
        // renderStatic writes the basename into each route's container attributes.
        const rendered = await renderEntry(config.root, prerender, transform, basename);
        if (rendered.size > 1 && !config.base.startsWith("/") && !/^[a-z]+:\/\//i.test(config.base)) {
          throw new Error(
            `gfui prerender: base "${config.base}" is relative, so the asset URLs in ${routeFileName([...rendered.keys()][1]!)} would not resolve; use an absolute base (for example "/") to prerender routes other than "/"`,
          );
        }
        routePages = [];
        let index = html;
        for (const [path, { html: inner, attributes, title, document }] of rendered) {
          const failed = clientRenderedSections(inner);
          if (failed > 0) {
            config.logger.warn(
              `gfui prerender: ${path}: ${failed} section${failed === 1 ? "" : "s"} failed to render on the server (a Fallback caught a render error); the browser renders ${failed === 1 ? "it" : "them"}`,
            );
          }
          const titled = title === undefined ? html : injectTitle(html, title);
          const page = injectPrerendered(document === undefined ? titled : injectDocumentAttributes(titled, document), prerender.rootId, inner, { ...attributes, ...traceAttributes });
          if (path === "/") index = page;
          else routePages.push({ fileName: routeFileName(path), source: page });
        }
        return index;
      },
    },
    generateBundle: {
      // After Vite's HTML plugin, whose generateBundle runs transformIndexHtml.
      order: "post",
      handler() {
        for (const page of routePages) this.emitFile({ type: "asset", fileName: page.fileName, source: page.source });
        routePages = [];
      },
    },
    configurePreviewServer(server) {
      // Prerendered routes (step 21): `/about` serves about/index.html, as static hosts do.
      if (!prerender) return;
      const outDir = resolve(server.config.root, server.config.build.outDir);
      const basename = basenameOf(server.config.base);
      server.middlewares.use((request, _response, next) => {
        const rewritten = request.url !== undefined ? previewRewrite(request.url, outDir, basename) : undefined;
        if (rewritten !== undefined) request.url = rewritten;
        next();
      });
    },
    configureServer(server) {
      // Step 35: the Inspector page.
      if (inspectorOn()) {
        const path = `${server.config.base}${INSPECTOR_PATH}`;
        server.middlewares.use(async (request, response, next) => {
          const url = request.url?.replace(/[?#].*$/, "");
          if (url !== path && url !== path.slice(0, -1)) return next();
          try {
            const html = await server.transformIndexHtml(path, inspectorHtml(server.config.base, server.config.root));
            response.setHeader("Content-Type", "text/html");
            response.end(html);
          } catch (error) {
            next(error);
          }
        });
      }
      // A component file (or code-behind) appearing or disappearing changes what
      // other files compile to: recompile every .gui module and reload.
      const changed = (path: string) => {
        // Step 34: a locale file appearing or disappearing too (the entry registers them).
        const isLocaleFile = path.endsWith(".json") && basename(dirname(path)) === "locales";
        if (!path.endsWith(".gui") && !path.endsWith(".gui.xs") && basename(path) !== GLOBALS_FILE && !isLocaleFile) return;
        for (const [id, module] of server.moduleGraph.idToModuleMap) {
          if (gfuiFilePath(id)) server.moduleGraph.invalidateModule(module);
        }
        server.hot.send({ type: "full-reload" });
      };
      server.watcher.on("add", changed);
      server.watcher.on("unlink", changed);
    },
    transform(source, id) {
      const file = gfuiFilePath(id);
      if (!file) return undefined;
      // Step 35: the Inspector's own markup, with its feed component (none of the app's components or globals).
      if (isInspectorFile(file)) {
        const result = compileModule(source, {
          format: "esm",
          fileName: basename(file),
          sourceMap,
          components: { ...componentMetadata, ...inspectorComponents },
          componentModules: { TraceFeed: "./feed" },
        });
        const failed = result.diagnostics.filter((d) => d.severity === "error");
        if (failed.length > 0) this.error({ message: formatErrors(failed, source, file), id: file });
        return { code: result.code, map: result.map ?? { mappings: "" } };
      }
      // The other component files' interfaces; a change to one recompiles this file.
      const userComponents: Record<string, UserComponentInfo> = {};
      for (const [name, found] of componentsFolder().scan()) {
        this.addWatchFile(found.file);
        if (found.file === file) continue;
        userComponents[name] = { ...found.info, module: importSpecifier(dirname(file), found.file) };
      }
      const codeBehind = readCodeBehind(file);
      if (codeBehind !== undefined) this.addWatchFile(`${file}.xs`);
      // Globals (step 21B): the entry compiles Globals.xs; every other file gets the global names.
      const app = globalsOf();
      const isEntry = file === app.entry;
      const globalsCode = isEntry ? app.readGlobalsCode() : undefined;
      if (globalsCode !== undefined) this.addWatchFile(app.globalsFile);
      if (!isEntry) {
        this.addWatchFile(app.entry);
        if (existsSync(app.globalsFile)) this.addWatchFile(app.globalsFile);
      }
      const { code, map, diagnostics, codeBehindDiagnostics, globalsDiagnostics } = compileModule(source, {
        format: "esm",
        // The map's source resolves relative to the module's URL.
        fileName: basename(file),
        // Step 35: trace entries name the file from the project root (the Inspector opens it there).
        locationFile: relative(config?.root ?? process.cwd(), file).split(sep).join("/"),
        sourceMap,
        userComponents,
        ...(codeBehind !== undefined ? { codeBehind } : {}),
        ...(globalsCode !== undefined ? { globalsCode } : {}),
        ...(isEntry ? {} : { globals: app.names() }),
        ...extensionOptions(file),
        ...(options.strictContracts !== undefined ? { strictContracts: options.strictContracts } : {}),
      });
      // Problems of a side file (the code-behind, Globals.xs), at its own positions.
      const reportSide = (sideSource: string, path: string, sideDiagnostics: readonly Diagnostic[]) => {
        const sideLines = new LineMap(sideSource);
        for (const warning of sideDiagnostics.filter((d) => d.severity === "warning")) {
          const { line, column } = sideLines.positionAt(warning.start);
          this.warn({ message: formatDiagnostic(warning, sideLines, path), loc: { file: path, line: line + 1, column } });
        }
        const sideErrors = sideDiagnostics.filter((d) => d.severity === "error");
        if (sideErrors.length === 0) return;
        const { line, column } = sideLines.positionAt(sideErrors[0]!.start);
        this.error({
          message: `${sideErrors.length} error${sideErrors.length === 1 ? "" : "s"} in ${basename(path)}:\n${formatErrors(sideErrors, sideSource, path)}`,
          id: path,
          loc: { file: path, line: line + 1, column },
          frame: codeFrame(sideSource, sideLines, sideErrors[0]!.start),
        });
      };
      if (codeBehind !== undefined) reportSide(codeBehind, `${file}.xs`, codeBehindDiagnostics ?? []);
      if (globalsCode !== undefined) reportSide(globalsCode, app.globalsFile, globalsDiagnostics ?? []);
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
      // Step 34: the entry registers the locale files (src/locales/*.json), checked as ICU MessageFormat.
      let locales = "";
      if (isEntry) {
        const files = localeFiles(file);
        for (const { file: localeFile } of files) this.addWatchFile(localeFile);
        const problems = localeFileErrors(files);
        if (problems.length > 0) {
          this.error({ message: problems.map((p) => p.message).join("\n"), id: problems[0]!.file });
        }
        locales = localeRegistrationCode(files, appLocaleOf(source), (localeFile) => importSpecifier(dirname(file), localeFile));
      }
      return { code: code + locales, map: map ?? { mappings: "" } };
    },
  };
}

export default gfui;
