// Step 35: the trace core: the ring, subscribers, the export, IDs, previews and
// masking, and the switch (autoEnableTrace).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  childSpan,
  clearTrace,
  droppedEntries,
  emit,
  enableTrace,
  entries,
  exportTrace,
  flushTrace,
  inspectorLocation,
  newTrace,
  resetTrace,
  subscribeTrace,
  tracing,
  type TraceOptions,
} from "../../src/trace/core";
import type { TraceEntry } from "../../src/trace/entries";
import { autoEnableTrace, INSPECTOR_ATTRIBUTE, trace, TRACE_ATTRIBUTE, TRACE_STORAGE_KEY } from "../../src/trace";
import { stopBridge } from "../../src/trace/bridge";
import { formatLocation, locations } from "../../src/trace/location";
import { MASK, preview, PREVIEW_NODES } from "../../src/trace/preview";

beforeEach(() => resetTrace());
afterEach(() => {
  stopBridge();
  resetTrace();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

const diag = (message: string) => emit({ kind: "diagnostic", message, category: "general" });
const messages = () => entries().map((e) => (e as Extract<TraceEntry, { kind: "diagnostic" }>).message);

describe("the ring", () => {
  test("stamps seq and time; keeps the newest `size` entries, oldest first; counts what it dropped", () => {
    enableTrace({ size: 3 });
    for (const m of ["a", "b", "c", "d", "e"]) diag(m);
    expect(messages()).toEqual(["c", "d", "e"]);
    expect(entries().map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(droppedEntries()).toBe(2);
    expect(entries()[0]!.time).toBeGreaterThan(Date.now() - 60_000);
  });

  test("resizing keeps the newest entries; clear forgets them, seq goes on", () => {
    enableTrace({ size: 5 });
    for (const m of ["a", "b", "c", "d"]) diag(m);
    enableTrace({ size: 2 });
    expect(messages()).toEqual(["c", "d"]);
    diag("e");
    expect(messages()).toEqual(["d", "e"]);
    clearTrace();
    expect(entries()).toEqual([]);
    diag("f");
    expect(entries()[0]!.seq).toBe(6);
  });

  test("subscribers get new entries in batches; a failing one doesn't stop the others", () => {
    enableTrace();
    const batches: number[][] = [];
    subscribeTrace(() => {
      throw new Error("bad subscriber");
    });
    const stop = subscribeTrace((batch) => batches.push(batch.map((e) => e.seq)));
    diag("a");
    diag("b");
    expect(batches).toEqual([]);
    flushTrace();
    diag("c");
    flushTrace();
    stop();
    diag("d");
    flushTrace();
    expect(batches).toEqual([[1, 2], [3]]);
  });

  test("the export is versioned JSON", () => {
    enableTrace();
    diag("a");
    const exported = exportTrace();
    expect(exported).toMatchObject({ format: "gfui-trace", version: 1, dropped: 0 });
    expect(JSON.parse(JSON.stringify(exported)).entries[0].message).toBe("a");
  });
});

describe("IDs", () => {
  test("W3C shapes: 32 hex digits for a trace, 16 for a span", () => {
    const root = newTrace();
    expect(root.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(root.spanId).toMatch(/^[0-9a-f]{16}$/);
    const child = childSpan(root);
    expect(child).toMatchObject({ traceId: root.traceId, parentSpanId: root.spanId });
    expect(child.spanId).not.toBe(root.spanId);
    expect(childSpan(undefined).parentSpanId).toBeUndefined();
  });
});

describe("locations", () => {
  test("a module's table: frozen objects from [element, line, column] triples", () => {
    const table = locations("src/Main.gui", ["Button", 14, 5, "count", 2, 6]);
    expect(table).toEqual([
      { file: "src/Main.gui", element: "Button", line: 14, column: 5 },
      { file: "src/Main.gui", element: "count", line: 2, column: 6 },
    ]);
    expect(Object.isFrozen(table[0])).toBe(true);
    expect(formatLocation(table[0])).toBe("src/Main.gui:14:5");
  });
});

describe("previews (decision 3)", () => {
  const rows = Array.from({ length: 10_000 }, (_, i) => ({ id: i, name: `User ${i}` }));
  const circular: Record<string, unknown> = { a: 1 };
  circular.self = circular;
  test.each<[label: string, value: unknown, expected: unknown]>([
    ["a string", "Ada", "Ada"],
    ["a long string is cut", "x".repeat(100), `${"x".repeat(80)}…`],
    ["a number", 42, 42],
    ["NaN", Number.NaN, "NaN"],
    ["undefined", undefined, "[undefined]"],
    ["null", null, null],
    ["a bigint", 5n, "5n"],
    ["a function", () => 1, "[function]"],
    ["a date", new Date("2026-11-28T10:00:00Z"), "2026-11-28T10:00:00.000Z"],
    ["an error", new TypeError("bad"), "[TypeError: bad]"],
    ["a map", new Map([[1, 2]]), "[Map(1)]"],
    ["a file: its name and size, never its content", new File(["secret"], "a.txt"), "[File a.txt, 6 bytes]"],
    ["a nested object, two levels deep", { a: { b: { c: 1 } } }, { a: { b: "[Object(1)]" } }],
    ["a circular reference", circular, { a: 1, self: "[circular]" }],
  ])("%s", (_, value, expected) => {
    expect(preview(value)).toEqual(expected);
  });

  test("a large array: at most PREVIEW_NODES nodes, the rest counted", () => {
    const result = preview(rows) as unknown[];
    expect(result.length).toBeLessThan(PREVIEW_NODES);
    expect(result.at(-1)).toMatch(/^…\d+ more$/);
    expect(JSON.stringify(result).length).toBeLessThan(1000);
  });

  test("the mask", () => {
    expect(MASK).toBe("•••");
  });
});

describe("the switch (autoEnableTrace, decision 1)", () => {
  const container = (attributes: Record<string, string>) => ({ getAttribute: (name: string) => attributes[name] ?? null });

  test.each<[label: string, setup: () => void, attributes: Record<string, string>, on: boolean]>([
    ["off by default", () => {}, {}, false],
    ["the dev server's default", () => {}, { [TRACE_ATTRIBUTE]: "on" }, true],
    ["?gfui-trace", () => window.history.replaceState(null, "", "/?gfui-trace"), {}, true],
    ["?gfui-trace=0 wins over the dev server", () => window.history.replaceState(null, "", "/?gfui-trace=0"), { [TRACE_ATTRIBUTE]: "on" }, false],
    ["remembered for the tab", () => sessionStorage.setItem(TRACE_STORAGE_KEY, "1"), {}, true],
    ["turned off for the tab", () => sessionStorage.setItem(TRACE_STORAGE_KEY, "0"), { [TRACE_ATTRIBUTE]: "on" }, false],
    ["a stored setting", () => localStorage.setItem(TRACE_STORAGE_KEY, "1"), {}, true],
    ["a stored 0", () => localStorage.setItem(TRACE_STORAGE_KEY, "0"), { [TRACE_ATTRIBUTE]: "on" }, false],
  ])("%s", (_, setup, attributes, on) => {
    setup();
    expect(autoEnableTrace(container(attributes))).toBe(on);
    expect(tracing).toBe(on);
  });

  test("?gfui-trace is remembered for the tab", () => {
    window.history.replaceState(null, "", "/?gfui-trace");
    autoEnableTrace();
    expect(sessionStorage.getItem(TRACE_STORAGE_KEY)).toBe("1");
  });

  test("the container names the Inspector; trace.inspect() opens it without an opener", () => {
    autoEnableTrace(container({ [INSPECTOR_ATTRIBUTE]: "/app/__gfui/inspector/" }));
    expect(inspectorLocation()).toBe("/app/__gfui/inspector/");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    trace.inspect();
    expect(open).toHaveBeenCalledWith("/app/__gfui/inspector/", "_blank", "noopener");
    open.mockRestore();
  });

  test("the API object", () => {
    const options: TraceOptions = { render: true };
    trace.enable(options);
    expect(trace.enabled).toBe(true);
    expect(trace.render).toBe(true);
    trace.disable();
    expect(trace.enabled).toBe(false);
    expect(Object.isFrozen(trace)).toBe(true);
  });
});
