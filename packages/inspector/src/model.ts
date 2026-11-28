// The Inspector's model (step 35, decision 4): what the channel brings, per app
// tab ("source"), as rows for its tables. React-free and DOM-free, so it is
// unit-tested directly (tests/model.test.ts).
//
// A source keeps its entries in order, without duplicates: an entry is new when
// its `seq` is above the last one seen; a tab that reloads starts again at 1 (its
// snapshot says `reloaded`), and a marker row shows where.
import type { BridgeMessage, Cause, SourceInfo, SourceLocation, TraceEntry, TraceExport } from "@gluefuil/runtime";

/** Entries kept per source (the oldest go first). */
export const SOURCE_LIMIT = 20_000;

/** One table row. `id` is unique across the feed (a reload restarts `seq`). */
export interface Row {
  id: number;
  seq: number;
  /** `12:04:31.210`. */
  time: string;
  kind: string;
  /** The element, id and event (`Button#save click`), the variable, the owner of a request. */
  what: string;
  /** `Main.gui:14:5`. */
  where: string;
  summary: string;
  /** The duration, when the entry has one (`38 ms`). */
  ms: string;
  /** The first 8 hex digits of the trace. */
  trace: string;
  traceId: string;
  /** Lowercased what + where + summary + kind, for the text filter. */
  search: string;
  /** In a trace's tree: how deep (spans inside spans). */
  depth: number;
}

interface Source {
  info: SourceInfo;
  entries: TraceEntry[];
  /** Rows by entry (built once). */
  rows: Row[];
  lastSeq: number;
  dropped: number;
}

let rowIds = 0;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** `12:04:31.210`, local time. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function locationText(at: SourceLocation | undefined): string {
  return at ? `${at.file}:${at.line}:${at.column}` : "";
}

/** A preview as short text (`"Ada"`, `[3 items]`). */
export function compact(value: unknown, max = 60): string {
  let text: string;
  try {
    text = typeof value === "string" ? JSON.stringify(value) : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The path and query of a URL on this origin; others as they are. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin === (globalThis as { location?: { origin?: string } }).location?.origin ? `${parsed.pathname}${parsed.search}` : url;
  } catch {
    return url;
  }
}

function causesText(causes: readonly Cause[] | undefined): string {
  const entries = (causes ?? []).map((c) => c.entry).filter((n): n is number => n !== undefined);
  return entries.length > 0 ? ` (caused by ${entries.map((n) => `#${n}`).join(", ")})` : "";
}

/** What a row says about an entry. */
export function describe(entry: TraceEntry): Pick<Row, "what" | "summary" | "ms"> {
  const element = entry.at?.element ?? "";
  const ms = (n: number | undefined) => (n === undefined ? "" : `${n < 10 ? n.toFixed(1) : Math.round(n)} ms`);
  switch (entry.kind) {
    case "handler":
      return {
        what: `${element}${entry.id !== undefined ? `#${entry.id}` : ""} ${entry.event}`.trim(),
        summary: `${entry.outcome}${entry.reason ? ` (${entry.reason})` : ""}${entry.error ? `: ${entry.error}` : ""}${entry.args ? ` ${compact(entry.args, 50)}` : ""}`,
        ms: ms(entry.durationMs),
      };
    case "state":
      return { what: entry.variable, summary: `${compact(entry.before, 40)} → ${compact(entry.after, 60)}`, ms: "" };
    case "fetch": {
      const owner = entry.owner ? `${entry.owner.component}${entry.owner.id !== undefined ? `#${entry.owner.id}` : ""}` : "";
      const attempt = entry.attempt !== undefined && entry.attempt > 1 ? ` (attempt ${entry.attempt})` : "";
      const result = entry.phase === "start" ? "…" : `→ ${entry.status ?? ""} ${entry.outcome ?? ""}`.replace(/\s+/g, " ").trim();
      return { what: owner, summary: `${entry.method} ${shortUrl(entry.url)} ${result}${attempt}${causesText(entry.causes)}`, ms: ms(entry.durationMs) };
    }
    case "navigate":
      return { what: "navigate", summary: `${entry.from} → ${entry.to} ${entry.outcome}`, ms: ms(entry.durationMs) };
    case "error":
      return { what: entry.source, summary: `${entry.code}: ${entry.message} (${entry.handledBy})`, ms: "" };
    case "diagnostic":
      return { what: entry.category, summary: entry.message, ms: "" };
    case "log":
      return { what: `console.${entry.level}`, summary: entry.args.map((a) => (typeof a === "string" ? a : compact(a, 80))).join(" "), ms: "" };
    case "render":
      return { what: element, summary: `${entry.changed.join(", ")}${causesText(entry.causes)}`, ms: "" };
  }
}

function rowOf(entry: TraceEntry): Row {
  const described = describe(entry);
  const where = locationText(entry.at);
  return {
    id: ++rowIds,
    seq: entry.seq,
    time: clockTime(entry.kind === "handler" ? entry.start : entry.time),
    kind: entry.kind === "fetch" ? `fetch ${entry.phase}` : entry.kind,
    ...described,
    where,
    trace: entry.traceId?.slice(0, 8) ?? "",
    traceId: entry.traceId ?? "",
    search: `${entry.kind} ${described.what} ${where} ${described.summary}`.toLowerCase(),
    depth: 0,
  };
}

/** A marker: the tab reloaded here. */
function reloadRow(info: SourceInfo): Row {
  const now = Date.now();
  return { id: ++rowIds, seq: 0, time: clockTime(now), kind: "page", what: "reload", where: "", summary: info.url, ms: "", trace: "", traceId: "", search: "page reload", depth: 0 };
}

/** The feed: sources and their entries. Mutable; the component wraps it in a signal. */
export class FeedModel {
  private readonly sources = new Map<string, Source>();
  private readonly byRow = new Map<number, TraceEntry>();
  /** The source shown; the last one that sent something, until the user picks one. */
  selected: string | undefined;
  private picked = false;

  /** Applies a channel message. Returns whether anything changed. */
  receive(message: BridgeMessage): boolean {
    if (message.type === "hello") return false;
    const source = this.sourceOf(message.source);
    if (message.type === "snapshot") {
      if (message.reloaded && source.entries.length > 0) {
        source.lastSeq = 0;
        source.rows.push(reloadRow(message.source));
      }
      source.dropped = message.dropped;
    }
    const added = this.add(source, message.entries);
    if (!this.picked) this.selected = message.source.id;
    return added || message.type === "snapshot";
  }

  /** An exported trace file as a source of its own. */
  importExport(name: string, data: TraceExport): void {
    if (data?.format !== "gfui-trace" || !Array.isArray(data.entries)) throw new Error("Not a gfui trace export (format gfui-trace)");
    const id = `import:${name}:${++rowIds}`;
    const source = this.sourceOf({ id, title: `${name} (imported)`, url: "" });
    source.dropped = data.dropped ?? 0;
    this.add(source, data.entries);
    this.select(id);
  }

  private sourceOf(info: SourceInfo): Source {
    let source = this.sources.get(info.id);
    if (!source) {
      source = { info, entries: [], rows: [], lastSeq: 0, dropped: 0 };
      this.sources.set(info.id, source);
    } else source.info = info;
    return source;
  }

  private add(source: Source, entries: readonly TraceEntry[]): boolean {
    let added = false;
    for (const entry of entries) {
      if (entry.seq <= source.lastSeq) continue;
      source.lastSeq = entry.seq;
      source.entries.push(entry);
      const row = rowOf(entry);
      source.rows.push(row);
      this.byRow.set(row.id, entry);
      added = true;
    }
    if (source.entries.length > SOURCE_LIMIT) {
      const extra = source.entries.length - SOURCE_LIMIT;
      source.entries.splice(0, extra);
      for (const row of source.rows.splice(0, source.rows.length - SOURCE_LIMIT)) this.byRow.delete(row.id);
      source.dropped += extra;
    }
    return added;
  }

  select(id: string | undefined): void {
    this.selected = id;
    this.picked = id !== undefined;
  }

  /** The sources, for a Select: `{ value, label }`. */
  sourceOptions(): { value: string; label: string }[] {
    const label = (info: SourceInfo) => (info.title && info.url ? `${info.title} (${info.url})` : info.title || info.url || info.id);
    return [...this.sources.values()].map((s) => ({ value: s.info.id, label: label(s.info) }));
  }

  private current(): Source | undefined {
    return this.selected === undefined ? undefined : this.sources.get(this.selected);
  }

  rows(): readonly Row[] {
    return this.current()?.rows ?? [];
  }

  /** Rows of one kind (or all, ""), containing `text` (case-insensitive). */
  filtered(kind: string, text: string): Row[] {
    const needle = text.trim().toLowerCase();
    return this.rows().filter((row) => (kind === "" || row.kind === kind || row.kind.startsWith(`${kind} `)) && (needle === "" || row.search.includes(needle)));
  }

  count(): number {
    return this.current()?.entries.length ?? 0;
  }

  dropped(): number {
    return this.current()?.dropped ?? 0;
  }

  entry(rowId: number): TraceEntry | undefined {
    return this.byRow.get(rowId);
  }

  /**
   * The rows of the trace `rowId` belongs to, in start order, each indented by
   * the depth of its span (a handler inside a handler, a request inside its handler).
   */
  traceRows(rowId: number): Row[] {
    const entry = this.byRow.get(rowId);
    if (!entry?.traceId) return [];
    const rows = this.rows().filter((r) => r.traceId === entry.traceId);
    const parents = new Map<string, string | undefined>();
    for (const row of rows) {
      const e = this.byRow.get(row.id);
      if (e?.spanId !== undefined && !parents.has(e.spanId)) parents.set(e.spanId, e.parentSpanId);
    }
    const depthOf = (span: string | undefined): number => {
      let depth = 0;
      for (let s = span; s !== undefined && parents.get(s) !== undefined && depth < 50; s = parents.get(s)) depth++;
      return depth;
    };
    const start = (r: Row) => {
      const e = this.byRow.get(r.id)!;
      return e.kind === "handler" ? e.start : e.time;
    };
    return rows
      .slice()
      .sort((a, b) => start(a) - start(b) || a.seq - b.seq)
      .map((row) => {
        const e = this.byRow.get(row.id)!;
        // A handler or a request opens its span; what happens inside it is one level deeper.
        const opens = e.kind === "handler" || (e.kind === "fetch" && e.phase === "start");
        const depth = depthOf(e.spanId) + (opens ? 0 : 1);
        // HTML collapses spaces: a visible marker per level.
        return { ...row, depth, what: `${"· ".repeat(depth)}${row.what}` };
      });
  }

  /** The entry as indented JSON. */
  detail(rowId: number): string {
    const entry = this.byRow.get(rowId);
    return entry === undefined ? "" : JSON.stringify(entry, null, 2);
  }

  /** The shown source as an export (the same format as `trace.export()`). */
  exportCurrent(): TraceExport {
    const source = this.current();
    return { format: "gfui-trace", version: 1, exportedAt: new Date().toISOString(), dropped: source?.dropped ?? 0, entries: [...(source?.entries ?? [])] };
  }

  clear(): void {
    const source = this.current();
    if (!source) return;
    for (const row of source.rows) this.byRow.delete(row.id);
    source.entries = [];
    source.rows = [];
    source.dropped = 0;
  }
}
