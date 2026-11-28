// The app's side of the Inspector channel (step 35, decision 4). While tracing,
// new entries go out on a BroadcastChannel in batches; an Inspector (another tab,
// opened with noopener: its own thread) says "hello" and gets a snapshot of the
// ring. Same origin only, as BroadcastChannel is.
//
// Messages (all plain data):
//   app → inspector  { type: "entries", source, entries }
//                    { type: "snapshot", source, title, url, dropped, entries }   (on hello, and at start)
//   inspector → app  { type: "hello" }
import { droppedEntries, entries, subscribeTrace } from "./core";
import type { TraceEntry } from "./entries";

export const TRACE_CHANNEL = "gfui-trace";

export interface SourceInfo {
  /** This tab's id: kept across reloads (sessionStorage), so the Inspector can follow one tab. */
  id: string;
  title: string;
  url: string;
}

export type BridgeMessage =
  | { type: "hello" }
  | { type: "entries"; source: SourceInfo; entries: readonly TraceEntry[] }
  | { type: "snapshot"; source: SourceInfo; dropped: number; entries: readonly TraceEntry[]; reloaded: boolean };

interface Platform {
  BroadcastChannel?: new (name: string) => { postMessage(message: unknown): void; close(): void; onmessage: ((event: { data: unknown }) => void) | null };
  sessionStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  document?: { title: string };
  location?: { href: string };
}

const platform = globalThis as unknown as Platform;
let stop: (() => void) | undefined;

function sourceId(): string {
  try {
    const stored = platform.sessionStorage?.getItem("gfui.trace.tab");
    if (stored) return stored;
    const id = Math.random().toString(36).slice(2, 10);
    platform.sessionStorage?.setItem("gfui.trace.tab", id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/** Starts posting the trace to the Inspector channel (once). Does nothing where BroadcastChannel doesn't exist. */
export function startBridge(): void {
  if (stop || !platform.BroadcastChannel) return;
  const channel = new platform.BroadcastChannel(TRACE_CHANNEL);
  const id = sourceId();
  const source = (): SourceInfo => ({ id, title: platform.document?.title ?? "", url: platform.location?.href ?? "" });
  const post = (message: BridgeMessage) => {
    try {
      channel.postMessage(message);
    } catch {
      // A value a channel can't clone: previews are plain data, so this is a bug; never break the app.
    }
  };
  channel.onmessage = (event) => {
    if ((event.data as { type?: unknown } | null)?.type === "hello") post({ type: "snapshot", source: source(), dropped: droppedEntries(), entries: entries(), reloaded: false });
  };
  const unsubscribe = subscribeTrace((batch) => post({ type: "entries", source: source(), entries: batch }));
  // An Inspector already open learns that this tab (re)started.
  post({ type: "snapshot", source: source(), dropped: droppedEntries(), entries: entries(), reloaded: true });
  stop = () => {
    unsubscribe();
    channel.close();
    stop = undefined;
  };
}

/** Stops the bridge (tests, `disable()`). */
export function stopBridge(): void {
  stop?.();
}
