// The trace's entry kinds (step 35; design: .ai/plan/poc-35-observability.md
// § The entries): one interface per kind, a discriminated union. Every field is
// JSON data (previews, strings, numbers), so an entry can be exported and sent
// over a BroadcastChannel as it is. `TRACE_KINDS` lists the kinds; a test checks
// that each has an emitter and a row in docs/observability.md.
import type { SourceLocation } from "./location";
import type { Preview } from "./preview";

export const TRACE_KINDS = ["handler", "state", "fetch", "navigate", "error", "diagnostic", "log", "render"] as const;
export type TraceKind = (typeof TRACE_KINDS)[number];

/** A trace (a user action, or what started on its own) and the span of one unit of work in it. */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
}

/** What caused an entry: the trace of a write (and the `seq` of its entry, when there is one). */
export interface Cause {
  readonly traceId: string;
  readonly spanId: string;
  readonly entry?: number;
}

export interface EntryBase {
  /** Increasing from 1 for the page's life. */
  seq: number;
  /** Wall-clock milliseconds (`performance.timeOrigin + performance.now()`). */
  time: number;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  /** The markup position of the element or variable. */
  at?: SourceLocation;
}

export type HandlerOutcome = "ok" | "error" | "cancelled" | "dropped";

export interface HandlerEntry extends EntryBase {
  kind: "handler";
  /** The event (`click`, `didChange`, `mount`). */
  event: string;
  /** The element's id, when it has one. */
  id?: string;
  policy?: string;
  outcome: HandlerOutcome;
  /** For "cancelled": `user`, `supersede`, `timeout`, `unmount`. */
  reason?: string;
  /** When the call started (same clock as `time`, which is when it ended). */
  start: number;
  durationMs: number;
  args?: Preview[];
  error?: string;
}

export interface StateEntry extends EntryBase {
  kind: "state";
  variable: string;
  before: Preview;
  after: Preview;
}

export type FetchOutcome = "ok" | "http" | "network" | "timeout" | "parse" | "cancelled" | "circuit-open" | "error";

export interface FetchEntry extends EntryBase {
  kind: "fetch";
  phase: "start" | "end";
  method: string;
  url: string;
  /** `DataSource`, `APICall`, `FileUpload`, `Actions`, …; `id` when it has one. */
  owner?: { component: string; id?: string };
  attempt?: number;
  status?: number;
  durationMs?: number;
  outcome?: FetchOutcome;
  correlationId?: string;
  causes?: Cause[];
}

export interface NavigateEntry extends EntryBase {
  kind: "navigate";
  from: string;
  to: string;
  outcome: "done" | "cancelled" | "error";
  durationMs: number;
}

export interface ErrorEntry extends EntryBase {
  kind: "error";
  /** Where it came from (ErrorSource), or `action` for an element's own onError. */
  source: string;
  code: string;
  category: string;
  message: string;
  status?: number;
  /**
   * `onError`: the element's own handler; `fallback`: the nearest Fallback; `app`: the App's sink
   * (App onError, the default report); `console`: no App.
   */
  handledBy: "onError" | "fallback" | "app" | "console";
}

export interface DiagnosticEntry extends EntryBase {
  kind: "diagnostic";
  message: string;
  /** `i18n`, `data`, `component`, `hydration`, `general`. */
  category: string;
}

export interface LogEntry extends EntryBase {
  kind: "log";
  level: "debug" | "info" | "log" | "warn" | "error";
  args: Preview[];
}

export interface RenderEntry extends EntryBase {
  kind: "render";
  /** The bindings whose values changed. */
  changed: string[];
  causes: Cause[];
  /** Renders of one store flush share a group. */
  group: number;
}

export type TraceEntry = HandlerEntry | StateEntry | FetchEntry | NavigateEntry | ErrorEntry | DiagnosticEntry | LogEntry | RenderEntry;

/** An entry before `emit` stamps it. */
export type NewEntry = TraceEntry extends infer E ? (E extends TraceEntry ? Omit<E, "seq" | "time"> : never) : never;
