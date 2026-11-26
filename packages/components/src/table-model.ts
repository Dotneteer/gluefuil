// The Table's column model (step 30, .ai/plan/poc-30-table.md decision 1: our
// own, no TanStack Table). React-free; tested in tables
// (tests/table-model.test.ts). XMLUI: xmlui/src/components/Table/TableReact.tsx
// (widths 578–816 and 1640–1730, sorting 139–190 and 1566–1610) and
// table-column-inference.ts.
//
//   Column entries ($$columns) or inference ─ tableColumns ─ columns
//   columns + user widths ─ gridTracks ─ grid-template-columns (stars are fr)
//   rows ─ sortRows ─ pageSlice ─ the rows to show
import { valueAt } from "./list-model";
import { INTERACTIVE_TYPES, normalizeValueType, type NormalizedValueType, type ValueTypeName, type ValueTypeProblem } from "./value-types";

export type SortDirection = "ascending" | "descending";
export type ColumnSizing = "auto" | "stretch" | "balanced" | "content";

/** A width: a CSS length, or a share of the free space (`2*`). */
export type ColumnWidth = { css: string } | { star: number };

/** A Column entry as the compiler emits it (`childrenAsColumns`). */
export interface ColumnEntry {
  $$key: string;
  bindTo?: unknown;
  header?: unknown;
  headerHorizontalAlignment?: unknown;
  tooltip?: unknown;
  tooltipOptions?: unknown;
  width?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  canSort?: unknown;
  defaultSortDirection?: unknown;
  pinTo?: unknown;
  canResize?: unknown;
  type?: unknown;
  typeOptions?: unknown;
  readOnly?: unknown;
  enabled?: unknown;
  $$cell?: (scope: object) => unknown;
  $$scope?: object;
  $$handlers?: Record<string, (scope: object) => unknown>;
}

export interface TableColumn {
  /** Identity: the entry's key (`bindTo` for inferred columns). Resized widths are kept by it. */
  key: string;
  /** What `didChange` reports as the column id: `bindTo`, else the key. */
  id: string;
  field?: string;
  header: string;
  headerAlign?: "start" | "center" | "end";
  type?: NormalizedValueType;
  width: ColumnWidth;
  minWidth?: string;
  maxWidth?: string;
  canSort: boolean;
  canResize: boolean;
  pinTo?: "left" | "right";
  defaultSortDirection?: SortDirection;
  tooltip?: string;
  readOnly?: unknown;
  enabled?: unknown;
  inferred: boolean;
  entry?: ColumnEntry;
}

const isTrue = (v: unknown) => v === true || v === "true";
const isFalse = (v: unknown) => v === false || v === "false";
const text = (v: unknown): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));
const direction = (v: unknown): SortDirection | undefined => (v === "ascending" || v === "descending" ? v : undefined);

/** A width prop: a number or `100px` (px), `2rem`/`3em`, or (for widths) a star size `*`, `2*`. Anything else is undefined. */
export function parseWidth(value: unknown, allowStar: boolean): ColumnWidth | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return { css: `${value}px` };
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  const star = /^(\d*(?:\.\d+)?)\s*\*$/.exec(v);
  if (star) return allowStar ? { star: star[1] === "" ? 1 : Number(star[1]) || 1 } : undefined;
  const px = /^(\d+(?:\.\d+)?)\s*(px)?$/.exec(v);
  if (px) return { css: `${Number(px[1])}px` };
  const rel = /^(\d+(?:\.\d+)?)\s*(rem|em)$/.exec(v);
  if (rel) return { css: `${Number(rel[1])}${rel[2]}` };
  return undefined;
}

const cssOf = (value: unknown) => {
  const w = parseWidth(value, false);
  return w && "css" in w ? w.css : undefined;
};

// --- Column sizing by type (XMLUI TableReact.tsx 589–816) ---------------------------------------

const TYPE_WIDTHS: Partial<Record<ValueTypeName, number>> = {
  id: 96, uuid: 260, number: 120, integer: 96, decimal: 120, percent: 96, currency: 140, accounting: 140, scientific: 120, bytes: 112,
  duration: 112, rating: 96, boolean: 88, "yes-no": 88, date: 128, time: 112, datetime: 176, timestamp: 152, "iso-date": 128,
  "relative-time": 128, enum: 128, status: 128, tag: 128,
};
const CONTENT_WIDTHS: Partial<Record<ValueTypeName, number>> = {
  text: 180, "short-text": 160, name: 180, email: 220, phone: 160, url: 240, link: 220, "long-text": 320, markdown: 320, address: 260,
  json: 260, object: 260, array: 220, list: 220, tags: 220,
};
const STAR_TYPES: ReadonlySet<ValueTypeName> = new Set(["text", "short-text", "name", "email", "phone", "url", "link", "long-text", "markdown", "address", "json", "object", "array", "list", "tags"]);
const MIN_WIDTHS: Partial<Record<ValueTypeName, number>> = {
  text: 120, "short-text": 120, name: 120, email: 160, phone: 120, url: 160, link: 160, "long-text": 220, markdown: 220, address: 180,
  json: 180, object: 180, array: 160, list: 160, tags: 160,
};
const CONTROL_WIDTHS: Partial<Record<ValueTypeName, number>> = { checkbox: 20, switch: 58, color: 50 };

/** `auto` is `balanced` for inferred columns, `stretch` for explicit ones (XMLUI resolveColumnSizingMode). */
export function sizingMode(sizing: unknown, explicit: boolean): Exclude<ColumnSizing, "auto"> {
  if (sizing === "stretch" || sizing === "balanced" || sizing === "content") return sizing;
  return explicit ? "stretch" : "balanced";
}

/** A column's default width for its type: interactive types fit their control and header; others by mode. */
function defaultWidth(type: NormalizedValueType | undefined, mode: Exclude<ColumnSizing, "auto">, header: string, canSort: boolean, canResize: boolean): ColumnWidth {
  if (!type) return { star: 1 };
  if (INTERACTIVE_TYPES.has(type.name)) {
    const control = (CONTROL_WIDTHS[type.name] ?? 0) + 12;
    // XMLUI estimates 7px per character for its 14px headers; ours are larger (step 30 finding).
    const headerWidth = header.trim() ? Math.ceil(header.trim().length * 8.5) + 16 + (canSort ? 20 : 0) + (canResize ? 6 : 0) : 0;
    return { css: `${Math.ceil(Math.max(control, headerWidth))}px` };
  }
  if (mode === "stretch") return { star: 1 };
  if (mode === "balanced" && STAR_TYPES.has(type.name)) return { star: type.name === "long-text" || type.name === "markdown" ? 2 : 1 };
  const px = TYPE_WIDTHS[type.name] ?? CONTENT_WIDTHS[type.name];
  return px === undefined ? { star: 1 } : { css: `${px}px` };
}

// --- Columns ------------------------------------------------------------------------------------

export interface ColumnsInput {
  entries?: readonly ColumnEntry[];
  data: readonly unknown[];
  idKey: string;
  columnInference?: unknown;
  columnSizing?: unknown;
  canResizeColumns?: boolean;
}

/** The Table's columns: its Column children, else inferred from the data. Type problems are returned (the Table reports them once). */
export function tableColumns(input: ColumnsInput): { columns: TableColumn[]; problems: (ValueTypeProblem & { column: string })[] } {
  const problems: (ValueTypeProblem & { column: string })[] = [];
  const explicit = (input.entries?.length ?? 0) > 0;
  const mode = sizingMode(input.columnSizing, explicit);
  const resizeAll = input.canResizeColumns !== false;
  if (explicit) {
    const columns = input.entries!.map((entry) => {
      const field = text(entry.bindTo);
      const header = text(entry.header) ?? field ?? "";
      let type: NormalizedValueType | undefined;
      if (entry.type !== undefined && entry.type !== null && entry.type !== "") {
        const normalized = normalizeValueType(entry.type, entry.typeOptions);
        type = normalized.type;
        problems.push(...normalized.problems.map((p) => ({ ...p, column: field ?? header })));
      } else if (entry.typeOptions !== undefined) type = normalizeValueType("text", entry.typeOptions).type;
      const canSort = !isFalse(entry.canSort) && field !== undefined;
      const canResize = entry.canResize === undefined ? resizeAll : !isFalse(entry.canResize);
      const width = parseWidth(entry.width, true) ?? defaultWidth(type, mode, header, canSort, canResize);
      const min = cssOf(entry.minWidth) ?? (mode !== "stretch" && type && MIN_WIDTHS[type.name] ? `${MIN_WIDTHS[type.name]}px` : undefined);
      const align = entry.headerHorizontalAlignment;
      return {
        key: entry.$$key,
        id: field ?? entry.$$key,
        field,
        header,
        headerAlign: align === "start" || align === "center" || align === "end" ? align : undefined,
        type,
        width,
        minWidth: min,
        maxWidth: cssOf(entry.maxWidth),
        canSort,
        canResize,
        pinTo: entry.pinTo === "left" || entry.pinTo === "right" ? entry.pinTo : undefined,
        defaultSortDirection: direction(entry.defaultSortDirection),
        tooltip: text(entry.tooltip),
        readOnly: entry.readOnly,
        enabled: entry.enabled,
        inferred: false,
        entry,
      } satisfies TableColumn;
    });
    return { columns, problems };
  }
  const inference = parseColumnInference(input.columnInference);
  const sampled = sampleRows(input.data, inference);
  const columns = discoverFields(sampled).map((field): TableColumn => {
    const type = normalizeValueType(inferColumnType(sampled.map((r) => (isPlainRecord(r) ? r[field] : undefined)), field, input.idKey), undefined, "inferred").type;
    const min = mode !== "stretch" && MIN_WIDTHS[type.name] ? `${MIN_WIDTHS[type.name]}px` : undefined;
    return { key: field, id: field, field, header: field, type, width: defaultWidth(type, mode, field, true, resizeAll), minWidth: min, canSort: true, canResize: resizeAll, inferred: true };
  });
  return { columns, problems };
}

// --- Inference (XMLUI table-column-inference.ts) ---------------------------------------------------

export type InferenceMode = { name: "first-only" | "first-n" | "sample" | "all" | "off"; count?: number };

/** `columnInference`: `first-n(25)` (default), `first-only`, `sample(n)`, `all`, `off`; anything else is the default. */
export function parseColumnInference(value: unknown): InferenceMode {
  const fallback: InferenceMode = { name: "first-n", count: 25 };
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const match = /^([A-Za-z][A-Za-z0-9-]*)(?:\((.*)\))?$/.exec(value.trim());
  if (!match) return fallback;
  const name = match[1]!.toLowerCase();
  if (name === "first-only" || name === "all" || name === "off") return match[2] === undefined ? { name } : fallback;
  if (name === "first-n" || name === "sample") {
    const count = Number(match[2]?.trim());
    return Number.isInteger(count) && count > 0 ? { name, count } : fallback;
  }
  return fallback;
}

export function sampleRows<T>(rows: readonly T[], mode: InferenceMode): T[] {
  switch (mode.name) {
    case "off":
      return [];
    case "first-only":
      return rows.slice(0, 1);
    case "all":
      return rows.slice();
    case "sample": {
      const count = mode.count ?? 25;
      if (rows.length <= count) return rows.slice();
      if (count === 1) return rows.slice(0, 1);
      const indexes = new Set<number>();
      for (let i = 0; i < count; i++) indexes.add(Math.round((i * (rows.length - 1)) / (count - 1)));
      return [...indexes].sort((a, b) => a - b).map((i) => rows[i]!);
    }
    default:
      return rows.slice(0, mode.count ?? 25);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** The sampled rows' own keys, in order of discovery (`order` is skipped, as XMLUI). */
export function discoverFields(rows: readonly unknown[]): string[] {
  const fields: string[] = [];
  const seen = new Set<string>(["order"]);
  for (const row of rows) {
    if (!isPlainRecord(row)) continue;
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push(key);
    }
  }
  return fields;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A field's display type from its sampled values (XMLUI inferColumnType). */
export function inferColumnType(values: readonly unknown[], field?: string, idKey = "id"): ValueTypeName {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (present.length === 0) return "text";
  if (present.every((v) => typeof v === "string" && UUID.test(v))) return "uuid";
  if (field !== undefined && field === idKey && present.every((v) => (typeof v === "string" && v.trim().length > 0 && v.length <= 80) || (typeof v === "number" && Number.isFinite(v)) || typeof v === "bigint")) return "id";
  if (present.every((v) => typeof v === "number" && Number.isFinite(v))) return present.every((v) => Number.isInteger(v)) ? "integer" : "number";
  if (present.every((v) => typeof v === "boolean")) return "boolean";
  if (present.every((v) => Array.isArray(v))) return present.every((v) => (v as unknown[]).every((i) => typeof i === "string" && i.length <= 40)) ? "tags" : "array";
  if (present.every(isPlainRecord)) return "object";
  if (present.every((v) => typeof v === "string")) return inferStringType(present as string[], field);
  return "text";
}

function inferStringType(values: readonly string[], field?: string): ValueTypeName {
  const mostly = (test: (v: string) => boolean) => values.filter(test).length / values.length >= 0.8;
  if (values.every((v) => UUID.test(v))) return "uuid";
  if (values.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return "date";
  if (values.every((v) => /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)))) return "datetime";
  if (mostly((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) return "email";
  if (mostly((v) => /^https?:\/\/\S+$/i.test(v))) return "url";
  if (mostly((v) => /^\+?[\d\s().-]{7,}$/.test(v) && /\d{7,}/.test(v.replace(/\D/g, "")))) return "phone";
  if (field !== undefined && (/^(name|customer|customerName|displayName|fullName)$/i.test(field) || /Name$/.test(field)) && values.every((v) => v.length > 0 && v.length <= 80)) return "name";
  if (values.some((v) => v.length > 80)) return "long-text";
  const unique = new Set(values);
  if (unique.size > 1 && unique.size <= Math.min(10, Math.max(3, Math.ceil(values.length / 2))) && values.every((v) => v.length <= 40 && /^[\p{L}\p{N}_ -]+$/u.test(v))) return "enum";
  return "text";
}

// --- The grid ------------------------------------------------------------------------------------

/** A column's grid track: px for a resized one, `minmax(min, Nfr)` for a star, a (clamped) length otherwise. */
export function columnTrack(column: TableColumn, resized?: number): string {
  if (resized !== undefined) return `${resized}px`;
  if ("star" in column.width) return `minmax(${column.minWidth ?? "0px"}, ${column.maxWidth ?? `${column.width.star}fr`})`;
  if (column.minWidth || column.maxWidth) return `clamp(${column.minWidth ?? "0px"}, ${column.width.css}, ${column.maxWidth ?? column.width.css})`;
  return column.width.css;
}

/** The narrowest a column gets (a row's min-width adds these up, so the table scrolls sideways instead of squeezing). */
export function columnMinimum(column: TableColumn, resized?: number): string {
  if (resized !== undefined) return `${resized}px`;
  if ("star" in column.width) return column.minWidth ?? "0px";
  return column.minWidth ? `max(${column.minWidth}, ${column.width.css})` : column.width.css;
}

/** A resized width within the column's limits (px; the limits only when they are px). */
export function clampWidth(column: TableColumn, px: number): number {
  const limit = (css: string | undefined) => (css && /^\d+(\.\d+)?px$/.test(css) ? Number.parseFloat(css) : undefined);
  const min = limit(column.minWidth) ?? 24;
  const max = limit(column.maxWidth) ?? Number.POSITIVE_INFINITY;
  return Math.round(Math.min(max, Math.max(min, px)));
}

// --- Sorting (XMLUI TableReact.tsx 139–190, 1566–1610) --------------------------------------------

export interface SortState {
  by?: string;
  direction: SortDirection;
}

/** A header click: the column's first direction, then the other one, then unsorted. */
export function nextSort(current: SortState, field: string, first: SortDirection = "ascending"): SortState {
  const other: SortDirection = first === "ascending" ? "descending" : "ascending";
  if (current.by !== field) return { by: field, direction: first };
  if (current.direction === first) return { by: field, direction: other };
  // Clearing reports the direction that was on screen (XMLUI judell/bram#290).
  return { by: undefined, direction: current.direction };
}

function compare(a: unknown, b: unknown, collator: Intl.Collator): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "string" || typeof b === "string") return collator.compare(String(a), String(b));
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if ((a as number) < (b as number)) return -1;
  if ((a as number) > (b as number)) return 1;
  return collator.compare(String(a), String(b));
}

/** Rows sorted by a field (a dotted path), stable; strings by the locale's collation. */
export function sortRows<T>(rows: readonly T[], by: string | undefined, dir: SortDirection, locale?: string): T[] {
  if (!by) return rows.slice();
  const sign = dir === "ascending" ? 1 : -1;
  const collator = new Intl.Collator(locale);
  return rows
    .map((item, index) => ({ item, index }))
    .sort((l, r) => {
      const c = compare(valueAt(l.item, by), valueAt(r.item, by), collator);
      return c === 0 ? l.index - r.index : c * sign;
    })
    .map((e) => e.item);
}

// --- Paging ------------------------------------------------------------------------------------

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** The rows of a page (the index clamped to the pages there are). */
export function pageSlice<T>(rows: readonly T[], pageIndex: number, pageSize: number): { rows: T[]; pageIndex: number } {
  const pages = pageCount(rows.length, pageSize);
  const index = Math.min(Math.max(0, Math.trunc(pageIndex) || 0), pages - 1);
  return { rows: rows.slice(index * pageSize, (index + 1) * pageSize), pageIndex: index };
}

export const isTruthyProp = isTrue;
