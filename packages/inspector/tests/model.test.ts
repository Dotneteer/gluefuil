// Step 35: the Inspector's model: sources over the channel (no duplicates, a
// reload), what a row says per kind, filters, the trace tree, import and export.
import type { BridgeMessage, SourceInfo, TraceEntry } from "@gluefuil/runtime";
import { describe, expect, test } from "vitest";
import { describe as describeEntry, FeedModel, SOURCE_LIMIT } from "../src/model";

const tab: SourceInfo = { id: "t1", title: "Shop", url: "http://localhost/" };
const at = { file: "src/Main.gui", line: 14, column: 5, element: "Button" };
const T = "a".repeat(32);
const S1 = "1".repeat(16);
const S2 = "2".repeat(16);

let seq = 0;
const base = (extra: object) => ({ seq: ++seq, time: 1_700_000_000_000 + seq, ...extra }) as TraceEntry;
const handler = (extra: object = {}) => base({ kind: "handler", traceId: T, spanId: S1, at, event: "click", outcome: "ok", start: 1_700_000_000_000 + seq, durationMs: 3.25, ...extra });
const state = (extra: object = {}) => base({ kind: "state", traceId: T, spanId: S1, variable: "count", before: 1, after: 2, ...extra });
const fetchStart = (extra: object = {}) =>
  base({ kind: "fetch", phase: "start", traceId: T, spanId: S2, parentSpanId: S1, method: "GET", url: "http://elsewhere/api/users?q=a", owner: { component: "DataSource", id: "users" }, ...extra });

const entriesMsg = (entries: TraceEntry[], source = tab): BridgeMessage => ({ type: "entries", source, entries });
const snapshot = (entries: TraceEntry[], reloaded: boolean, source = tab): BridgeMessage => ({ type: "snapshot", source, entries, dropped: 0, reloaded });

describe("what a row says", () => {
  test.each<[label: string, entry: () => TraceEntry, what: string, summary: string]>([
    ["a handler", () => handler({ id: "save", args: ["x"] }), "Button#save click", 'ok ["x"]'],
    ["a cancelled handler", () => handler({ outcome: "cancelled", reason: "supersede" }), "Button click", "cancelled (supersede)"],
    ["a failed handler", () => handler({ outcome: "error", error: "TypeError: bad" }), "Button click", "error: TypeError: bad"],
    ["a state change", () => state(), "count", "1 → 2"],
    ["a request starting, with its cause", () => fetchStart({ causes: [{ traceId: T, spanId: S1, entry: 7 }] }), "DataSource#users", "GET http://elsewhere/api/users?q=a … (caused by #7)"],
    ["a request ending", () => fetchStart({ phase: "end", status: 404, outcome: "http", durationMs: 12 }), "DataSource#users", "GET http://elsewhere/api/users?q=a → 404 http"],
    ["a retry", () => fetchStart({ phase: "end", status: 200, outcome: "ok", attempt: 2 }), "DataSource#users", "GET http://elsewhere/api/users?q=a → 200 ok (attempt 2)"],
    ["a navigation", () => base({ kind: "navigate", from: "/", to: "/orders", outcome: "done", durationMs: 1 }), "navigate", "/ → /orders done"],
    ["an error", () => base({ kind: "error", source: "handler", code: "server", category: "server", message: "Boom", handledBy: "app" }), "handler", "server: Boom (app)"],
    ["a diagnostic", () => base({ kind: "diagnostic", message: "Duplicate ids", category: "component" }), "component", "Duplicate ids"],
    ["a console call", () => base({ kind: "log", level: "warn", args: ["low", { n: 1 }] }), "console.warn", 'low {"n":1}'],
    ["a render", () => base({ kind: "render", at, changed: ["label"], causes: [{ traceId: T, spanId: S1, entry: 3 }], group: 1 }), "Button", "label (caused by #3)"],
  ])("%s", (_, entry, what, summary) => {
    expect(describeEntry(entry())).toMatchObject({ what, summary });
  });

  test("durations under 10 ms keep a decimal", () => {
    expect(describeEntry(handler()).ms).toBe("3.3 ms");
    expect(describeEntry(handler({ durationMs: 38.6 })).ms).toBe("39 ms");
  });
});

describe("sources", () => {
  test("entries arrive once: a hello's snapshot repeats nothing already shown", () => {
    const model = new FeedModel();
    const [a, b, c] = [handler(), state(), fetchStart()];
    model.receive(entriesMsg([a!, b!]));
    model.receive(snapshot([a!, b!, c!], false));
    expect(model.rows().map((r) => r.seq)).toEqual([a!.seq, b!.seq, c!.seq]);
    expect(model.selected).toBe("t1");
    expect(model.sourceOptions()).toEqual([{ value: "t1", label: "Shop (http://localhost/)" }]);
  });

  test("a tab that reloads starts again at seq 1: a marker row, and the new entries", () => {
    const model = new FeedModel();
    model.receive(entriesMsg([handler({ seq: 1 }), state({ seq: 2 })]));
    model.receive(snapshot([handler({ seq: 1 })], true));
    expect(model.rows().map((r) => r.kind)).toEqual(["handler", "state", "page", "handler"]);
    expect(new Set(model.rows().map((r) => r.id)).size).toBe(4);
  });

  test("the feed follows the last tab that sent something, until one is picked", () => {
    const model = new FeedModel();
    const other = { ...tab, id: "t2" };
    model.receive(entriesMsg([handler()]));
    model.receive(entriesMsg([handler()], other));
    expect(model.selected).toBe("t2");
    model.select("t1");
    model.receive(entriesMsg([handler()], other));
    expect(model.selected).toBe("t1");
  });

  test(`a source keeps its newest ${SOURCE_LIMIT} entries`, () => {
    const model = new FeedModel();
    model.receive(entriesMsg(Array.from({ length: SOURCE_LIMIT + 5 }, () => state())));
    expect(model.count()).toBe(SOURCE_LIMIT);
    expect(model.dropped()).toBe(5);
  });
});

describe("filters, the trace tree, details", () => {
  const model = new FeedModel();
  const h = handler();
  const s = state();
  const f = fetchStart();
  const other = handler({ traceId: "b".repeat(32), at: { ...at, element: "Link" } });
  model.receive(entriesMsg([h, s, f, other]));

  test.each<[kind: string, text: string, expected: number[]]>([
    ["", "", [h.seq, s.seq, f.seq, other.seq]],
    ["handler", "", [h.seq, other.seq]],
    ["fetch", "", [f.seq]],
    ["", "LINK", [other.seq]],
    ["", "main.gui:14", [h.seq, other.seq]],
  ])("kind %j, text %j", (kind, text, expected) => {
    expect(model.filtered(kind, text).map((r) => r.seq)).toEqual(expected);
  });

  test("a trace as a tree: the handler, what happened in it one level deeper, a request's span inside it", () => {
    const rowId = model.rows()[1]!.id; // the state entry
    const rows = model.traceRows(rowId);
    expect(rows.map((r) => [r.kind, r.depth])).toEqual([
      ["handler", 0],
      ["state", 1],
      ["fetch start", 1],
    ]);
    expect(rows[1]!.what).toBe("· count");
  });

  test("an entry's details as JSON", () => {
    expect(JSON.parse(model.detail(model.rows()[0]!.id))).toMatchObject({ kind: "handler", event: "click" });
    expect(model.detail(-1)).toBe("");
  });
});

describe("import and export", () => {
  test("an export, imported, is a source of its own with the same entries", () => {
    const model = new FeedModel();
    model.receive(entriesMsg([handler(), state()]));
    const exported = model.exportCurrent();
    expect(exported).toMatchObject({ format: "gfui-trace", version: 1 });
    const other = new FeedModel();
    other.importExport("trace.json", JSON.parse(JSON.stringify(exported)));
    expect(other.rows().map((r) => r.kind)).toEqual(["handler", "state"]);
    expect(other.sourceOptions()[0]!.label).toBe("trace.json (imported)");
  });

  test("something else is refused", () => {
    expect(() => new FeedModel().importExport("x.json", { entries: [] } as never)).toThrow("Not a gfui trace export");
  });

  test("clear forgets the shown source's entries; later ones still arrive", () => {
    const model = new FeedModel();
    model.receive(entriesMsg([handler()]));
    model.clear();
    expect(model.rows()).toEqual([]);
    model.receive(entriesMsg([state()]));
    expect(model.rows()).toHaveLength(1);
  });
});
