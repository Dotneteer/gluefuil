// The trace stream (step 35; design: .ai/plan/poc-35-observability.md § The
// trace core).
//
//   tracing        one boolean: every emitting site is `if (tracing) …`, so with
//                  tracing off no entry is built (decision 1)
//   emit(entry)    stamps seq and time; into a fixed ring (O(1), oldest first out)
//   subscribe(fn)  receives new entries in batches (a timer, not a frame: a
//                  hidden tab's frames stop, and the Inspector is in another tab)
//
// A leaf module (types only): the store, the error pipeline and every emitter
// import it.
import type { NewEntry, TraceContext, TraceEntry } from "./entries";
import type { SourceLocation } from "./location";

/** True while the trace records. Read it at each site before building an entry. */
export let tracing = false;
/** True while render entries are recorded too (`enable({ render: true })`). */
export let renderTracing = false;

export const DEFAULT_TRACE_SIZE = 5000;
/** How long new entries wait before subscribers get them, in one batch. */
export const NOTIFY_DELAY_MS = 50;

export interface TraceOptions {
  /** The ring's size (default 5,000 entries). */
  size?: number;
  /** Record a `render` entry for each element re-render (default false). */
  render?: boolean;
  /** The Inspector page's URL (`inspect()` opens it). */
  inspector?: string;
}

let ring: (TraceEntry | undefined)[] = [];
let head = 0;
let count = 0;
let seq = 0;
let dropped = 0;
let inspectorUrl = "/__gfui/inspector/";
const subscribers = new Set<(entries: readonly TraceEntry[]) => void>();
let pending: TraceEntry[] = [];
// Platform functions, typed here: the runtime is also type-checked without DOM types.
const platform = globalThis as unknown as {
  performance?: { now(): number; timeOrigin?: number };
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  crypto: { getRandomValues(values: Uint8Array): Uint8Array };
};
let timer: unknown;

const clock = platform;
const origin = clock.performance?.timeOrigin ?? Date.now() - (clock.performance?.now() ?? 0);

/** The trace clock: wall-clock milliseconds with sub-millisecond precision. */
export function traceNow(): number {
  return origin + (clock.performance?.now() ?? 0);
}

/** Turns tracing on (or changes its options). Entries recorded before are kept unless the size changes. */
export function enableTrace(options: TraceOptions = {}): void {
  const size = Math.max(1, Math.floor(options.size ?? (ring.length || DEFAULT_TRACE_SIZE)));
  if (size !== ring.length) {
    const kept = entries().slice(-size);
    ring = new Array(size);
    for (let i = 0; i < kept.length; i++) ring[i] = kept[i];
    count = kept.length;
    head = kept.length % size;
  }
  if (options.render !== undefined) renderTracing = options.render;
  if (options.inspector !== undefined) inspectorUrl = options.inspector;
  tracing = true;
}

/** Turns tracing off. The recorded entries stay readable. */
export function disableTrace(): void {
  tracing = false;
  renderTracing = false;
  active = undefined;
}

/** Records an entry; returns its `seq`. Call only while `tracing`. */
export function emit(entry: NewEntry): number {
  const stamped = entry as TraceEntry;
  stamped.seq = ++seq;
  stamped.time = traceNow();
  if (ring.length === 0) ring = new Array(DEFAULT_TRACE_SIZE);
  if (count === ring.length) dropped++;
  else count++;
  ring[head] = stamped;
  head = (head + 1) % ring.length;
  if (subscribers.size > 0) {
    pending.push(stamped);
    timer ??= platform.setTimeout(flushTrace, NOTIFY_DELAY_MS);
  }
  return stamped.seq;
}

/** The recorded entries, oldest first. */
export function entries(): TraceEntry[] {
  const result: TraceEntry[] = [];
  const start = count < ring.length ? 0 : head;
  for (let i = 0; i < count; i++) result.push(ring[(start + i) % ring.length]!);
  return result;
}

/** How many entries the ring has dropped (the oldest go first). */
export function droppedEntries(): number {
  return dropped;
}

/** Forgets the recorded entries (`seq` keeps counting). */
export function clearTrace(): void {
  ring = new Array(ring.length || DEFAULT_TRACE_SIZE);
  head = 0;
  count = 0;
  dropped = 0;
}

/** Calls `listener` with each batch of new entries; returns the function that stops it. */
export function subscribeTrace(listener: (entries: readonly TraceEntry[]) => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/** Delivers the pending entries now (tests, and before a page unloads). */
export function flushTrace(): void {
  if (timer !== undefined) platform.clearTimeout(timer);
  timer = undefined;
  if (pending.length === 0) return;
  const batch = Object.freeze(pending);
  pending = [];
  for (const listener of [...subscribers]) {
    try {
      listener(batch);
    } catch {
      // A failing subscriber must not break the app or the others.
    }
  }
}

/** The format of `exportTrace()`: version 1. */
export interface TraceExport {
  format: "gfui-trace";
  version: 1;
  exportedAt: string;
  dropped: number;
  entries: TraceEntry[];
}

/** The recorded entries as a versioned JSON document. */
export function exportTrace(): TraceExport {
  return { format: "gfui-trace", version: 1, exportedAt: new Date().toISOString(), dropped, entries: entries() };
}

/** The Inspector page's URL. */
export function inspectorLocation(): string {
  return inspectorUrl;
}

/** Sets the Inspector page's URL (the dev server's, under Vite's base). */
export function setInspectorLocation(url: string): void {
  inspectorUrl = url;
}

// --- IDs (W3C Trace Context shapes: 32 and 16 hex digits; made only while tracing) ---

const HEX = "0123456789abcdef";

// Random bytes are drawn from a pool, refilled 4 KiB at a time: one
// getRandomValues call per ~170 traces instead of two per handler call.
const pool = new Uint8Array(4096);
let poolAt = pool.length;

function randomHex(bytes: number): string {
  if (poolAt + bytes > pool.length) {
    platform.crypto.getRandomValues(pool);
    poolAt = 0;
  }
  let out = "";
  for (let i = poolAt; i < poolAt + bytes; i++) out += HEX[pool[i]! >> 4]! + HEX[pool[i]! & 15]!;
  poolAt += bytes;
  return out;
}

/** A new trace (a user action, or work that started on its own). */
export function newTrace(): TraceContext {
  return { traceId: randomHex(16), spanId: randomHex(8) };
}

/** A span inside `parent`'s trace; a new trace without a parent. */
export function childSpan(parent: TraceContext | undefined): TraceContext {
  return parent ? { traceId: parent.traceId, spanId: randomHex(8), parentSpanId: parent.spanId } : newTrace();
}

/** The fields an entry takes from its trace context. */
export function traceFields(context: TraceContext | undefined): { traceId?: string; spanId?: string; parentSpanId?: string } {
  if (!context) return {};
  return context.parentSpanId === undefined
    ? { traceId: context.traceId, spanId: context.spanId }
    : { traceId: context.traceId, spanId: context.spanId, parentSpanId: context.parentSpanId };
}

/** The work running synchronously now, as the trace sees it (a handler's segment). */
export interface ActiveTrace {
  readonly context: TraceContext;
  /** The element whose handler runs. */
  readonly at?: SourceLocation;
  /** The element holds a secret (a password input): its values are masked. */
  readonly sensitive?: boolean;
}

let active: ActiveTrace | undefined;

/** The handler segment running now (set by the handler runtime with its invocation). */
export function activeTrace(): ActiveTrace | undefined {
  return active;
}

/** Sets the running segment's trace; returns the previous one. */
export function setActiveTrace(next: ActiveTrace | undefined): ActiveTrace | undefined {
  const previous = active;
  active = next;
  return previous;
}

/** Back to the initial state: off, empty, no subscribers (tests). */
export function resetTrace(): void {
  disableTrace();
  ring = [];
  head = 0;
  count = 0;
  seq = 0;
  dropped = 0;
  pending = [];
  if (timer !== undefined) platform.clearTimeout(timer);
  timer = undefined;
  subscribers.clear();
  inspectorUrl = "/__gfui/inspector/";
  active = undefined;
}
