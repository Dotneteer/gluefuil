// The trace's public API (step 35): `import { trace } from "@gluefuil/runtime"`,
// `gfui.trace` in standalone mode. See .ai/docs/observability.md.
import { startBridge, stopBridge } from "./bridge";
import {
  clearTrace,
  disableTrace,
  droppedEntries,
  enableTrace,
  entries,
  exportTrace,
  flushTrace,
  inspectorLocation,
  setInspectorLocation,
  subscribeTrace,
  tracing,
  renderTracing,
  type TraceOptions,
} from "./core";

export * from "./core";
export * from "./entries";
export * from "./location";
export * from "./preview";
export { TRACE_CHANNEL, startBridge, stopBridge, type BridgeMessage, type SourceInfo } from "./bridge";
export { traceDiagnostic, traceError, traceLog, traceState, uniqueCauses, currentOrNewTrace, type DiagnosticDetails } from "./emitters";

/** Where the switch is remembered (decision 1). */
export const TRACE_STORAGE_KEY = "gfui.trace";
/** The URL parameter that turns tracing on for the tab (`?gfui-trace`; `?gfui-trace=0` turns it off). */
export const TRACE_PARAM = "gfui-trace";

interface Platform {
  location?: { search: string };
  localStorage?: { getItem(key: string): string | null };
  sessionStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
  open?: (url: string, target: string, features: string) => unknown;
}

/** The container attribute the Vite plugin's dev server sets: trace by default ("on"). */
export const TRACE_ATTRIBUTE = "data-gfui-trace";
/** The container attribute naming the Inspector page (the dev server's, or a build's with `inspector: true`). */
export const INSPECTOR_ATTRIBUTE = "data-gfui-inspector";

const platform = globalThis as unknown as Platform;

function enable(options?: TraceOptions): void {
  enableTrace(options);
  startBridge();
}

function disable(): void {
  disableTrace();
  stopBridge();
}

/**
 * Turns tracing on when something asked for it (mountApp and standalone call
 * this before the first render): `?gfui-trace` (remembered for the tab),
 * `localStorage["gfui.trace"]`, or the dev server's default (the container's
 * `data-gfui-trace="on"`). `?gfui-trace=0` turns it off for the tab. The
 * container's `data-gfui-inspector` names the Inspector page. Returns whether
 * tracing is on.
 */
export function autoEnableTrace(container?: { getAttribute(name: string): string | null }): boolean {
  const inspector = container?.getAttribute(INSPECTOR_ATTRIBUTE);
  if (inspector) setInspectorLocation(inspector);
  if (tracing) return true;
  let wanted: boolean | undefined;
  try {
    const params = new URLSearchParams(platform.location?.search ?? "");
    const param = params.get(TRACE_PARAM);
    if (param !== null) {
      wanted = param !== "0" && param !== "false" && param !== "off";
      if (wanted) platform.sessionStorage?.setItem(TRACE_STORAGE_KEY, "1");
      else platform.sessionStorage?.setItem(TRACE_STORAGE_KEY, "0");
    }
    wanted ??= ((): boolean | undefined => {
      const session = platform.sessionStorage?.getItem(TRACE_STORAGE_KEY);
      if (session === "1") return true;
      if (session === "0") return false;
      const stored = platform.localStorage?.getItem(TRACE_STORAGE_KEY);
      if (stored !== null && stored !== undefined) return stored !== "0" && stored !== "false";
      return undefined;
    })();
  } catch {
    // Storage blocked: only the dev server's default decides.
  }
  if (wanted ?? container?.getAttribute(TRACE_ATTRIBUTE) === "on") enable();
  return tracing;
}

/** Opens the Inspector in a new tab (noopener: its own thread). */
function inspect(): void {
  platform.open?.(inspectorLocation(), "_blank", "noopener");
}

/** The trace API. */
export const trace = Object.freeze({
  enable,
  disable,
  get enabled(): boolean {
    return tracing;
  },
  get render(): boolean {
    return renderTracing;
  },
  entries,
  get dropped(): number {
    return droppedEntries();
  },
  subscribe: subscribeTrace,
  clear: clearTrace,
  export: exportTrace,
  flush: flushTrace,
  inspect,
});
