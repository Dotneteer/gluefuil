// The standalone entry: built into dist/pfui.js, exposed as the global `pfui`.
// The script reads its options from its own <script> tag and starts on
// DOMContentLoaded (data-autostart="false" to start manually with pfui.start()).

import * as React from "react";
import { start, StandaloneApp, type StartOptions } from "./loader";

export { CompileCache, type CacheEntry, type StorageLike } from "./cache";
export { hashText } from "./hash";
export { start, StandaloneApp, type LoadStatus, type StartOptions } from "./loader";

/** The engine's React: extensions must use this one, never bundle their own. */
export { React };

export const version = "0.0.0";

let app: StandaloneApp | undefined;

/** The running app (when started automatically or with `startApp`). */
export function current(): StandaloneApp | undefined {
  return app;
}

/** Starts the app (once); `pfui.start()` for manual start. */
export async function startApp(options: StartOptions = {}): Promise<StandaloneApp> {
  app?.stop();
  app = await start(options);
  return app;
}

/** Options from `data-*` attributes of the <script> tag that loaded pfui.js. */
export function optionsFromScript(script: HTMLOrSVGScriptElement | null): StartOptions & { autostart: boolean } {
  const data = script instanceof HTMLScriptElement ? script.dataset : {};
  const flag = (value: string | undefined) => (value === undefined ? undefined : value !== "false");
  const options: StartOptions & { autostart: boolean } = { autostart: flag(data.autostart) ?? true };
  if (data.main) options.main = data.main;
  if (data.root) options.root = data.root;
  const cache = flag(data.cache);
  if (cache !== undefined) options.cache = cache;
  const watch = flag(data.watch);
  if (watch !== undefined) options.watch = watch;
  if (data.watchInterval) options.watchInterval = Number(data.watchInterval);
  const strictContracts = flag(data.strictContracts);
  if (strictContracts !== undefined) options.strictContracts = strictContracts;
  return options;
}

// Autostart: only in a browser, when loaded by a <script> tag.
if (typeof document !== "undefined" && document.currentScript) {
  const { autostart, ...options } = optionsFromScript(document.currentScript);
  if (autostart) {
    const run = () => void startApp(options);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }
}
