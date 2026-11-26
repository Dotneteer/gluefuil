// Step 30: the typed values and the Table's column model as tables (React-free:
// value-types.ts, table-model.ts, pagination's visiblePages). XMLUI:
// Value/value-types.ts, value-formatting.ts, Table/table-column-inference.ts,
// TableReact.tsx. Design: .ai/plan/poc-30-table.md
import { describe, expect, test } from "vitest";
import { visiblePages } from "../src/pagination";
import { clampWidth, columnMinimum, columnTrack, inferColumnType, nextSort, pageSlice, parseColumnInference, parseWidth, sampleRows, sortRows, tableColumns, type TableColumn } from "../src/table-model";
import { formatValue, inlineMarkdown, normalizeValueType, VALUE_TYPE_NAMES } from "../src/value-types";

describe("the type syntax", () => {
  test("45 type names, as XMLUI's", () => expect(VALUE_TYPE_NAMES).toHaveLength(45));
  test.each<[input: string, options: unknown, expected: object]>([
    ["email", undefined, { name: "email", source: "explicit" }],
    ["Currency(eur)", undefined, { name: "currency", args: ["EUR"], options: { currency: "EUR" } }],
    ["number(8,3)", undefined, { name: "number", args: [8, 3], options: { precision: 8, scale: 3 } }],
    ["url(label:domain)", undefined, { name: "url", options: { label: "domain" } }],
    ["url(label:'Open')", undefined, { name: "url", options: { label: "Open" } }],
    ["long-text(lines:2)", { maxLines: 4 }, { name: "long-text", options: { lines: 2, maxLines: 4 } }],
    ["currency(EUR)", { currency: "HUF" }, { name: "currency", options: { currency: "HUF" } }],
    ["date(short)", undefined, { name: "date", options: { style: "short" } }],
    ["id(full)", undefined, { name: "id", options: { mode: "full" } }],
  ])("%s with %j", (input, options, expected) => {
    expect(normalizeValueType(input, options).type).toMatchObject(expected);
  });
  test.each<[input: unknown, code: string]>([
    ["", "empty-type"],
    [42, "invalid-type-value"],
    ["money", "unknown-type"],
    ["number(8)", "invalid-argument"],
    ["number(3,8)", "invalid-argument"],
    ["currency(EURO)", "invalid-argument"],
    ["date(weekly)", "invalid-argument"],
    ["email(x)", "unsupported-arguments"],
    ["url(label:a, b)", "malformed-arguments"],
    ["text()", "malformed-arguments"],
  ])("%j falls back to text: %s", (input, code) => {
    const { type, problems } = normalizeValueType(input);
    expect(type).toMatchObject({ name: "text", source: "fallback" });
    expect(problems.map((p) => p.code)).toContain(code);
  });
});

describe("formatting", () => {
  const f = (value: unknown, type: string, options?: unknown) => formatValue(value, normalizeValueType(type, { locale: "en-US", ...(options as object) }).type, { now: new Date("2026-01-10T12:00:00Z") });
  test.each<[value: unknown, type: string, options: unknown, expected: object]>([
    [null, "text", undefined, { kind: "empty" }],
    [null, "json", undefined, { kind: "json", text: "null" }],
    ["abc", "text", undefined, { kind: "text", text: "abc" }],
    ["1234567890abcdef", "id", undefined, { kind: "id", text: "12345678..." }],
    ["1234567890abcdef", "id(full)", undefined, { kind: "id", text: "1234567890abcdef" }],
    [1234.5678, "number(8,3)", undefined, { kind: "number", text: "1,234.568", integerPart: "1,234", decimalSeparator: ".", fractionPart: "568" }],
    [1234.5, "integer", undefined, { text: "1,235" }],
    [2, "decimal(2)", undefined, { text: "2.00" }],
    [0.12, "percent", undefined, { text: "12%" }],
    [1234.5, "currency(EUR)", undefined, { text: "€1,234.50", integerPart: "€1,234", fractionPart: "50" }],
    [-5, "accounting(USD)", undefined, { text: "($5.00)" }],
    [1536, "bytes", undefined, { text: "1.5 KB", suffixPart: " KB" }],
    [3661, "duration", undefined, { text: "1h 1m 1s" }],
    [4, "rating", undefined, { text: "4 / 5" }],
    ["x", "number", undefined, { kind: "text", text: "x" }],
    [true, "yes-no", undefined, { text: "Yes" }],
    [true, "checkbox", undefined, { text: "✓" }],
    ["2026-08-06", "iso-date", undefined, { text: "2026-08-06" }],
    ["2026-01-10T11:00:00Z", "relative-time", undefined, { text: "1 hour ago" }],
    ["ada@x.org", "email", undefined, { kind: "link", href: "mailto:ada@x.org" }],
    ["https://example.com/a", "url(label:domain)", undefined, { kind: "link", text: "example.com" }],
    ["sent", "enum", { sent: { label: "Sent" } }, { text: "Sent" }],
    ["draft", "status", { values: { draft: "Draft" } }, { text: "Draft" }],
    [["a", "b"], "tags", undefined, { text: "a, b" }],
    [{ a: 1 }, "object", undefined, { kind: "json", text: '{"a":1}' }],
    ["#ff0000", "color", undefined, { kind: "color", color: "#ff0000" }],
    ["/a.png", "avatar", { label: "Ada" }, { kind: "avatar", alt: "Ada" }],
    ["home", "icon", undefined, { kind: "icon", iconName: "home" }],
  ])("%j as %s", (value, type, options, expected) => {
    expect(f(value, type, options)).toMatchObject(expected);
  });
  test("inline markdown: **bold** and *italic*", () => {
    expect(inlineMarkdown("a **b** c *d*")).toEqual([{ text: "a " }, { text: "b", style: "strong" }, { text: " c " }, { text: "d", style: "em" }]);
  });
});

describe("inference", () => {
  test.each<[label: string, values: unknown[], field: string | undefined, expected: string]>([
    ["nothing present", [null, "", undefined], undefined, "text"],
    ["uuids", ["47f4d9f8-2f6a-4e3d-9bf5-010d74822c6f"], undefined, "uuid"],
    ["the idKey field", [1, 2], "id", "id"],
    ["integers", [1, 2], "n", "integer"],
    ["numbers", [1, 2.5], "n", "number"],
    ["booleans", [true, false], undefined, "boolean"],
    ["short string arrays", [["a"], ["b", "c"]], undefined, "tags"],
    ["other arrays", [[1], [2]], undefined, "array"],
    ["objects", [{ a: 1 }], undefined, "object"],
    ["ISO dates", ["2026-01-01", "2026-02-03"], undefined, "date"],
    ["ISO datetimes", ["2026-01-01T10:00:00Z"], undefined, "datetime"],
    ["mostly emails", ["a@b.co", "c@d.co", "e@f.co", "g@h.co", "x"], undefined, "email"],
    ["urls", ["https://a.b/c"], undefined, "url"],
    ["phones", ["+1 555 123 4567"], undefined, "phone"],
    ["a name-like field", ["Ada"], "customerName", "name"],
    ["a long string", ["x".repeat(81)], undefined, "long-text"],
    ["a few repeated values", ["open", "paid", "open", "paid"], undefined, "enum"],
    ["mixed", [1, "a"], undefined, "text"],
  ])("%s", (_label, values, field, expected) => {
    expect(inferColumnType(values, field)).toBe(expected);
  });
  test.each<[input: unknown, expected: object]>([
    [undefined, { name: "first-n", count: 25 }],
    ["first-only", { name: "first-only" }],
    ["first-n(3)", { name: "first-n", count: 3 }],
    ["sample(2)", { name: "sample", count: 2 }],
    ["all", { name: "all" }],
    ["off", { name: "off" }],
    ["first-n(0)", { name: "first-n", count: 25 }],
    ["nope", { name: "first-n", count: 25 }],
  ])("columnInference %j", (input, expected) => expect(parseColumnInference(input)).toEqual(expected));
  test("sample(n) spreads deterministically", () => {
    expect(sampleRows([0, 1, 2, 3, 4, 5, 6, 7, 8], { name: "sample", count: 3 })).toEqual([0, 4, 8]);
  });
  test("columns from the sampled rows' keys, in order of discovery, typed and balanced", () => {
    const { columns } = tableColumns({ data: [{ id: 1, customer: "Ada" }, { id: 2, customer: "Grace", total: 87.5, order: 3 }], idKey: "id" });
    expect(columns.map((c) => [c.header, c.type?.name, c.type?.source, columnTrack(c)])).toEqual([
      ["id", "id", "inferred", "96px"],
      ["customer", "name", "inferred", "minmax(120px, 1fr)"],
      ["total", "number", "inferred", "120px"],
    ]);
    expect(tableColumns({ data: [{ a: 1 }, { b: 2 }], idKey: "id", columnInference: "first-only" }).columns.map((c) => c.field)).toEqual(["a"]);
    expect(tableColumns({ data: [{ a: 1 }], idKey: "id", columnInference: "off" }).columns).toEqual([]);
  });
});

describe("widths", () => {
  test.each<[value: unknown, star: boolean, expected: unknown]>([
    [120, true, { css: "120px" }],
    ["120px", true, { css: "120px" }],
    ["120", true, { css: "120px" }],
    ["2rem", true, { css: "2rem" }],
    ["*", true, { star: 1 }],
    ["3*", true, { star: 3 }],
    ["3*", false, undefined],
    ["50%", true, undefined],
  ])("%j (stars %s)", (value, star, expected) => expect(parseWidth(value, star)).toEqual(expected));
  const column = (width: string, min?: string, max?: string) => tableColumns({ entries: [{ $$key: "0", bindTo: "a", width, minWidth: min, maxWidth: max }], data: [], idKey: "id" }).columns[0]!;
  test.each<[column: TableColumn, track: string, minimum: string]>([
    [column("100px"), "100px", "100px"],
    [column("2*"), "minmax(0px, 2fr)", "0px"],
    [column("*", "80px"), "minmax(80px, 1fr)", "80px"],
    [column("100px", "50px", "500px"), "clamp(50px, 100px, 500px)", "max(50px, 100px)"],
  ])("track %#", (c, track, minimum) => {
    expect(columnTrack(c)).toBe(track);
    expect(columnMinimum(c)).toBe(minimum);
    expect(columnTrack(c, 250)).toBe("250px");
  });
  test("a resized width stays within px limits", () => {
    expect(clampWidth(column("100px", "50px", "500px"), 20)).toBe(50);
    expect(clampWidth(column("100px", "50px", "500px"), 900)).toBe(500);
    expect(clampWidth(column("*"), 5)).toBe(24);
  });
  test("explicit columns: stretch by default (stars), interactive types fit their control, types align and size by mode", () => {
    const entries = [{ $$key: "0", bindTo: "a", type: "currency" }, { $$key: "1", bindTo: "b", type: "switch", header: "Live" }, { $$key: "2", header: "Actions" }];
    expect(tableColumns({ entries, data: [], idKey: "id" }).columns.map((c) => [columnTrack(c), c.canSort])).toEqual([["minmax(0px, 1fr)", true], ["76px", true], ["minmax(0px, 1fr)", false]]);
    expect(tableColumns({ entries, data: [], idKey: "id", columnSizing: "content" }).columns.map((c) => columnTrack(c))).toEqual(["140px", "76px", "minmax(0px, 1fr)"]);
  });
  test("a bad type is reported and the column shows text", () => {
    const { columns, problems } = tableColumns({ entries: [{ $$key: "0", bindTo: "a", type: "money" }], data: [], idKey: "id" });
    expect(columns[0]!.type?.name).toBe("text");
    expect(problems).toMatchObject([{ code: "unknown-type", column: "a" }]);
  });
});

describe("sorting and paging", () => {
  test.each<[label: string, current: { by?: string; direction: "ascending" | "descending" }, first: "ascending" | "descending", expected: object]>([
    ["a new column starts at its first direction", { by: "a", direction: "ascending" }, "descending", { by: "b", direction: "descending" }],
    ["then the other direction", { by: "b", direction: "descending" }, "descending", { by: "b", direction: "ascending" }],
    ["then unsorted, reporting what was on screen", { by: "b", direction: "ascending" }, "descending", { by: undefined, direction: "ascending" }],
  ])("%s", (_label, current, first, expected) => expect(nextSort(current, "b", first)).toEqual(expected));
  test("sortRows: stable, nulls last ascending, the locale's collation, a dotted path", () => {
    const rows = [{ n: "b", v: 2 }, { n: "Á", v: null }, { n: "a", v: 1 }, { n: "c", v: 1 }];
    expect(sortRows(rows, "n", "ascending", "en").map((r) => r.n)).toEqual(["a", "Á", "b", "c"]);
    expect(sortRows(rows, "v", "ascending").map((r) => r.n)).toEqual(["a", "c", "b", "Á"]);
    expect(sortRows(rows, "v", "descending").map((r) => r.n)).toEqual(["Á", "b", "a", "c"]);
    expect(sortRows([{ a: { b: 2 } }, { a: { b: 1 } }], "a.b", "ascending")).toEqual([{ a: { b: 1 } }, { a: { b: 2 } }]);
  });
  test("pageSlice clamps the page", () => {
    expect(pageSlice([1, 2, 3, 4, 5], 1, 2)).toEqual({ rows: [3, 4], pageIndex: 1 });
    expect(pageSlice([1, 2, 3, 4, 5], 9, 2)).toEqual({ rows: [5], pageIndex: 2 });
    expect(pageSlice([], 0, 10)).toEqual({ rows: [], pageIndex: 0 });
  });
  test.each<[current: number, total: number, max: number, expected: number[]]>([
    [1, 3, 5, [1, 2, 3]],
    [5, 10, 3, [4, 5, 6]],
    [10, 10, 3, [8, 9, 10]],
    [1, 10, 1, [1]],
  ])("page buttons around %i of %i (%i)", (current, total, max, expected) => expect(visiblePages(current, total, max)).toEqual(expected));
});
