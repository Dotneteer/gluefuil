// The standalone loader: fetch Main.pfui and the component files it uses,
// compile them in the browser (or take them from the cache), mount the app,
// and watch the files for changes.
// Design: .ai/plan/poc-11-standalone.md, .ai/plan/poc-14-user-components.md

import { analyzeModule, compileModule, formatDiagnostic, LineMap, type Diagnostic, type UserComponentInfo } from "@patchfuil/compiler";
import * as builtIns from "@patchfuil/components";
import { componentMetadata } from "@patchfuil/components/metadata";
import { loadModule, setDefaultHandlerTimeout } from "@patchfuil/runtime";
import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CompileCache, defaultStorage, type CacheEntry, type StorageLike } from "./cache";
import { hashText } from "./hash";
import { ErrorOverlay, type LoadError } from "./overlay";

export interface StartOptions {
  /** The entry file, relative to the page. Default "Main.pfui". */
  main?: string;
  /** The mount element, or a CSS selector. Default: a new `<div id="pfui-root">` in the body. */
  root?: Element | string;
  /** Use the localStorage compile cache. Default true. */
  cache?: boolean;
  /** Poll the markup for changes. Default: true on localhost. */
  watch?: boolean;
  /** Polling interval in ms. Default 1000. */
  watchInterval?: number;
  /**
   * Component contract violations are errors (default true) or warnings
   * (false, for migrating XMLUI markup). Warnings go to the console.
   */
  strictContracts?: boolean;
  /** Replaceable for tests. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  storage?: StorageLike;
  buildId?: string;
}

export interface LoadStatus {
  file: string;
  /** "compiled": at least one file compiled now; "cache": all taken from the cache; "error": shown the overlay. */
  source: "compiled" | "cache" | "error";
  /** Time spent compiling, when something compiled. */
  compileMs?: number;
  /** The number of loads so far (1 for the first; more after changes while watching). */
  loads: number;
  /** The component files loaded besides the entry file. */
  components?: string[];
}

/** One fetched source: a .pfui file and its code-behind (undefined: none, a 404). */
interface Source {
  path: string;
  markup: string;
  codeBehind: string | undefined;
}

/** Everything one load fetched. `fingerprint` changes when any file (or a 404) changes. */
interface Fetched {
  main: Source;
  components: Map<string, Source>;
  fingerprint: string;
}

/** Replaced by the bundle build with a value unique to each build. */
declare const __PFUI_BUILD_ID__: string | undefined;
const BUILD_ID = typeof __PFUI_BUILD_ID__ === "string" ? __PFUI_BUILD_ID__ : "dev";

function isLocalhost(): boolean {
  const host = (globalThis as { location?: { hostname?: string } }).location?.hostname ?? "";
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export class StandaloneApp {
  status: LoadStatus | undefined;
  private readonly file: string;
  /** The folder of the entry file, where `components/` is (`""` or `"app/"`). */
  private readonly base: string;
  private readonly cache: CompileCache;
  private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  private root: Root | undefined;
  private container: Element | undefined;
  private fingerprint: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private loads = 0;

  constructor(private readonly options: StartOptions = {}) {
    this.file = options.main ?? "Main.pfui";
    this.base = this.file.includes("/") ? this.file.slice(0, this.file.lastIndexOf("/") + 1) : "";
    this.cache = new CompileCache(options.cache === false ? undefined : (options.storage ?? defaultStorage()), options.buildId ?? BUILD_ID);
    this.fetchFn = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  }

  /** First load, mount, and (if enabled) start watching. */
  async start(): Promise<void> {
    this.container = this.resolveContainer();
    this.root = createRoot(this.container);
    try {
      this.load(await this.fetchAll(false));
    } catch (error) {
      this.showError({ file: this.file, error });
    }
    if (this.options.watch ?? isLocalhost()) this.scheduleWatch();
  }

  /** Stops watching and unmounts. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.root?.unmount();
    this.root = undefined;
  }

  /** Fetches the files again; reloads the app if any changed. Returns whether something changed. */
  async refresh(): Promise<boolean> {
    let fetched: Fetched;
    try {
      fetched = await this.fetchAll(true);
    } catch (error) {
      this.showError({ file: this.file, error });
      return false;
    }
    if (fetched.fingerprint === this.fingerprint) return false;
    this.load(fetched);
    return true;
  }

  private resolveContainer(): Element {
    const root = this.options.root;
    if (root instanceof Element) return root;
    if (typeof root === "string") {
      const found = document.querySelector(root);
      if (!found) throw new Error(`pfui: no element matches the root selector '${root}'`);
      return found;
    }
    const div = document.createElement("div");
    div.id = "pfui-root";
    document.body.appendChild(div);
    return div;
  }

  /** The text of `url`; undefined for a 404 when `optional`. Other failures throw. */
  private async fetchText(url: string, noStore: boolean, optional: boolean): Promise<string | undefined> {
    const response = await this.fetchFn(url, { cache: noStore ? "no-store" : "no-cache" });
    if (optional && response.status === 404) return undefined;
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    return response.text();
  }

  /**
   * Fetches the entry file, then each component it (transitively) uses that is
   * neither built in nor defined inline: `components/<Name>.pfui`, with
   * code-behind (`<file>.xs`). A missing component file is left to the compiler
   * (E001, unknown component).
   */
  private async fetchAll(noStore: boolean): Promise<Fetched> {
    const fetchSource = async (path: string, optional: boolean): Promise<Source | undefined> => {
      const [markup, codeBehind] = await Promise.all([this.fetchText(path, noStore, optional), this.fetchText(`${path}.xs`, noStore, true)]);
      return markup === undefined ? undefined : { path, markup, codeBehind };
    };
    const main = (await fetchSource(this.file, false))!;
    const components = new Map<string, Source>();
    const fingerprint: string[] = [];
    const seen = new Set<string>();
    const visit = async (source: Source) => {
      fingerprint.push(source.path, hashText(source.markup), source.codeBehind === undefined ? "-" : hashText(source.codeBehind));
      const analysis = analyzeModule(source.markup, source.codeBehind !== undefined ? { codeBehind: source.codeBehind } : {});
      for (const defined of analysis.components) seen.add(defined.name);
      const wanted = analysis.references.filter((name) => !Object.hasOwn(componentMetadata, name) && !seen.has(name));
      for (const name of wanted) seen.add(name);
      const found = await Promise.all(wanted.map((name) => fetchSource(`${this.base}components/${name}.pfui`, true)));
      for (const [index, name] of wanted.entries()) {
        const file = found[index];
        if (!file) {
          fingerprint.push(`${name}:404`);
          continue;
        }
        components.set(name, file);
      }
      for (const file of found) if (file) await visit(file);
    };
    await visit(main);
    return { main, components, fingerprint: fingerprint.join("|") };
  }

  /** Compiles (or takes from the cache) every file, then renders the entry component. */
  private load(fetched: Fetched): void {
    this.fingerprint = fetched.fingerprint;
    this.loads++;
    // The interfaces of the component files (a file must define its own name).
    const infos: Record<string, UserComponentInfo> = {};
    for (const [name, source] of fetched.components) {
      const info = analyzeModule(source.markup, source.codeBehind !== undefined ? { codeBehind: source.codeBehind } : {}).components.find((c) => c.name === name);
      if (info) infos[name] = info;
    }
    const components: Record<string, unknown> = { ...builtIns };
    let compiled = false;
    let compileMs = 0;
    const compile = (source: Source, own: string | undefined): ComponentType | undefined => {
      const userComponents = Object.fromEntries(Object.entries(infos).filter(([name]) => name !== own));
      // The code depends on the markup, the code-behind and the interfaces of the components it uses.
      const hash = hashText(`${source.markup}\u0000${source.codeBehind ?? ""}\u0000${JSON.stringify(userComponents)}`);
      let entry = this.cache.get(source.path, hash);
      if (!entry) {
        const started = performance.now();
        const result = compileModule(source.markup, {
          format: "function",
          fileName: source.path,
          userComponents,
          ...(source.codeBehind !== undefined ? { codeBehind: source.codeBehind } : {}),
          ...(this.options.strictContracts !== undefined ? { strictContracts: this.options.strictContracts } : {}),
        });
        this.logWarnings(source.path, source.markup, result.diagnostics);
        if (source.codeBehind !== undefined) this.logWarnings(`${source.path}.xs`, source.codeBehind, result.codeBehindDiagnostics ?? []);
        compileMs += performance.now() - started;
        if (this.showDiagnostics(source.path, source.markup, result.diagnostics)) return undefined;
        if (source.codeBehind !== undefined && this.showDiagnostics(`${source.path}.xs`, source.codeBehind, result.codeBehindDiagnostics ?? [])) return undefined;
        const map = result.map ? { ...result.map } : undefined;
        if (map) delete map.sourcesContent;
        entry = { hash, code: result.code, ...(map ? { map: map as CacheEntry["map"] } : {}) };
        this.cache.set(source.path, entry);
        compiled = true;
      }
      return loadModule(entry.code, {
        components,
        ...(entry.map ? { map: { ...entry.map, sourcesContent: [source.markup] } as never } : {}),
        sourceURL: `${source.path}.js`,
      });
    };
    try {
      for (const [name, source] of fetched.components) {
        const component = compile(source, name);
        if (!component) return;
        components[name] = component;
      }
      const Main = compile(fetched.main, undefined);
      if (!Main) return;
      this.root?.render(createElement(Main));
      this.status = {
        file: this.file,
        source: compiled ? "compiled" : "cache",
        loads: this.loads,
        ...(compiled ? { compileMs } : {}),
        ...(fetched.components.size > 0 ? { components: [...fetched.components.values()].map((s) => s.path) } : {}),
      };
    } catch (error) {
      this.showError({ file: this.file, error });
    }
  }

  /** Warnings (deprecations; contract violations when not strict) go to the console. */
  private logWarnings(file: string, source: string, diagnostics: Diagnostic[]): void {
    const warnings = diagnostics.filter((d) => d.severity === "warning");
    if (warnings.length === 0) return;
    const lineMap = new LineMap(source);
    for (const warning of warnings) console.warn(`pfui: ${formatDiagnostic(warning, lineMap, file)}`);
  }

  /** Shows the overlay when there are errors; returns whether it did. */
  private showDiagnostics(file: string, source: string, diagnostics: Diagnostic[]): boolean {
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length === 0) return false;
    this.showError({ file, diagnostics: errors, source });
    return true;
  }

  private showError(error: LoadError): void {
    this.root?.render(createElement(ErrorOverlay, { error }));
    this.status = { file: this.file, source: "error", loads: this.loads };
  }

  private scheduleWatch(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      await this.refresh();
      this.scheduleWatch();
    }, this.options.watchInterval ?? 1000);
  }
}

/** Starts a standalone app. */
export async function start(options: StartOptions = {}): Promise<StandaloneApp> {
  const app = new StandaloneApp(options);
  await app.start();
  return app;
}

export { setDefaultHandlerTimeout };
