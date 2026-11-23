// The standalone loader: fetch Main.pfui, compile it in the browser (or take it
// from the cache), mount it, and watch it for changes.
// Design: .ai/plan/poc-11-standalone.md

import { compileModule } from "@patchfuil/compiler";
import * as components from "@patchfuil/components";
import { loadModule, setDefaultHandlerTimeout } from "@patchfuil/runtime";
import { createElement } from "react";
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
  /** Replaceable for tests. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  storage?: StorageLike;
  buildId?: string;
}

export interface LoadStatus {
  file: string;
  /** "compiled": compiled now; "cache": taken from the cache; "error": shown the overlay. */
  source: "compiled" | "cache" | "error";
  /** Time spent compiling, when compiled. */
  compileMs?: number;
  /** The number of loads so far (1 for the first; more after changes while watching). */
  loads: number;
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
  private readonly cache: CompileCache;
  private readonly fetchText: (noStore: boolean) => Promise<string>;
  private root: Root | undefined;
  private container: Element | undefined;
  private currentHash: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private loads = 0;

  constructor(private readonly options: StartOptions = {}) {
    this.file = options.main ?? "Main.pfui";
    this.cache = new CompileCache(options.cache === false ? undefined : (options.storage ?? defaultStorage()), options.buildId ?? BUILD_ID);
    const fetchFn = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
    this.fetchText = async (noStore) => {
      const response = await fetchFn(this.file, { cache: noStore ? "no-store" : "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      return response.text();
    };
  }

  /** First load, mount, and (if enabled) start watching. */
  async start(): Promise<void> {
    this.container = this.resolveContainer();
    this.root = createRoot(this.container);
    try {
      this.load(await this.fetchText(false));
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

  /** Fetches the entry file again; reloads the app if it changed. Returns whether it changed. */
  async refresh(): Promise<boolean> {
    let text: string;
    try {
      text = await this.fetchText(true);
    } catch (error) {
      this.showError({ file: this.file, error });
      return false;
    }
    if (hashText(text) === this.currentHash) return false;
    this.load(text);
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

  /** Compiles (or takes from the cache) and renders `text`. */
  private load(text: string): void {
    const hash = hashText(text);
    this.currentHash = hash;
    this.loads++;
    let entry = this.cache.get(this.file, hash);
    let source: LoadStatus["source"] = "cache";
    let compileMs: number | undefined;
    if (!entry) {
      const started = performance.now();
      const result = compileModule(text, { format: "function", fileName: this.file });
      compileMs = performance.now() - started;
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        this.showError({ file: this.file, diagnostics: errors, source: text });
        return;
      }
      const map = result.map ? { ...result.map, sourcesContent: undefined } : undefined;
      if (map) delete map.sourcesContent;
      entry = { hash, code: result.code, ...(map ? { map: map as CacheEntry["map"] } : {}) };
      this.cache.set(this.file, entry);
      source = "compiled";
    }
    try {
      const Main = loadModule(entry.code, {
        components,
        ...(entry.map ? { map: { ...entry.map, sourcesContent: [text] } as never } : {}),
        sourceURL: `${this.file}.js`,
      });
      this.root?.render(createElement(Main));
      this.status = { file: this.file, source, loads: this.loads, ...(compileMs !== undefined ? { compileMs } : {}) };
    } catch (error) {
      this.showError({ file: this.file, error });
    }
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
