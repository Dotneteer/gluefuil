// The List's row model (step 29, .ai/plan/poc-29-list.md): data → the rows the
// virtualizer shows. Pure functions, no React, tested in tables
// (tests/list-model.test.ts). XMLUI: xmlui/src/components/List/ListReact.tsx
// 90–190 (useListData).
//
//   data ─ drop nullish items ─ orderBy ─ limit ─ groups ─ rows
//
// A row is an item, a group header or a group footer. Every row has a key that
// identifies it across data changes: an item's `idKey` value, else its index
// (reported by `duplicateKeys`).

/** `orderBy`: `{ field, direction }` or an array of them (XMLUI's docs and source; its metadata says string). */
export interface OrderByField {
  field: string;
  direction?: "asc" | "desc";
}

/** What a group header or footer template sees as `$group` (plus `isExpanded` and `toggle()`). */
export interface ListGroup {
  id: string;
  key: string;
  items: unknown[];
}

export type ListRow =
  | { kind: "item"; key: string; item: unknown; index: number }
  | { kind: "header"; key: string; group: ListGroup }
  | { kind: "footer"; key: string; group: ListGroup };

export interface ListModelInput {
  data: unknown;
  idKey?: string;
  orderBy?: unknown;
  limit?: unknown;
  /** A field name or a function of the item (XMLUI). */
  groupBy?: unknown;
  defaultGroups?: unknown;
  /** Only these groups, in this order (step 29 decision 5: it filters, as XMLUI's docs say). */
  availableGroups?: unknown;
  hideEmptyGroups?: boolean;
  groupsInitiallyExpanded?: boolean;
  /** Groups the user folded or unfolded, by key. */
  expanded?: Readonly<Record<string, boolean>>;
  /** Header and footer rows exist only when there is a template for them. */
  hasHeader?: boolean;
  hasFooter?: boolean;
}

export interface ListModel {
  rows: ListRow[];
  /** The shown items in order (ordered, limited; inside folded groups too). */
  items: unknown[];
  /** Their keys, in the same order. */
  keys: string[];
  /** Whether rows are grouped. */
  grouped: boolean;
}

/** A value at a dotted path (`address.city`), as lodash `get`. */
export function valueAt(item: unknown, path: string): unknown {
  let value: unknown = item;
  for (const part of path.split(".")) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** `orderBy` normalized; anything else is no ordering. */
export function orderFields(orderBy: unknown): OrderByField[] {
  const list = Array.isArray(orderBy) ? orderBy : orderBy !== null && orderBy !== undefined ? [orderBy] : [];
  return list.filter((o): o is OrderByField => o !== null && typeof o === "object" && typeof (o as OrderByField).field === "string");
}

/** Ascending comparison as lodash's: nullish and NaN after everything else, then natural order. */
function compareValues(a: unknown, b: unknown): number {
  const missing = (v: unknown) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  if (missing(a) || missing(b)) return missing(a) === missing(b) ? 0 : missing(a) ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  const x = a as number;
  const y = b as number;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Items sorted by the fields (stable). */
export function orderItems(items: readonly unknown[], orderBy: unknown): unknown[] {
  const fields = orderFields(orderBy);
  if (fields.length === 0) return [...items];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      for (const { field, direction } of fields) {
        const c = compareValues(valueAt(a.item, field), valueAt(b.item, field));
        if (c !== 0) return direction === "desc" ? -c : c;
      }
      return a.index - b.index;
    })
    .map((e) => e.item);
}

function positiveInteger(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** An item's key: its `idKey` value, or `undefined` when it has none. */
export function itemKey(item: unknown, idKey: string): string | undefined {
  if (item === null || typeof item !== "object") return undefined;
  const value = (item as Record<string, unknown>)[idKey];
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

/** Keys that are empty or used twice: the rows then fall back to their index (the List warns once). */
export function duplicateKeys(items: readonly unknown[], idKey: string): string[] {
  const seen = new Set<string>();
  const problems = new Set<string>();
  for (const item of items) {
    const key = itemKey(item, idKey);
    if (key === undefined) problems.add("(empty)");
    else if (seen.has(key)) problems.add(key);
    else seen.add(key);
  }
  return [...problems];
}

/** The rows for the data and the props. */
export function listModel(input: ListModelInput): ListModel {
  const idKey = input.idKey ?? "id";
  const source = Array.isArray(input.data) ? input.data : [];
  let items = orderItems(source.filter((item) => item !== null && item !== undefined), input.orderBy);
  const limit = positiveInteger(input.limit);
  if (limit !== undefined && limit > 0) items = items.slice(0, limit);
  // Keys: the idKey value; a duplicate or an empty one falls back to the item's position.
  const keys = new Set<string>();
  const keyOf = items.map((item, index) => {
    const key = itemKey(item, idKey);
    if (key !== undefined && !keys.has(key)) {
      keys.add(key);
      return key;
    }
    return `$$index:${index}`;
  });
  // `index`: the item's position in the shown items (display order).
  const itemRow = (source: number, index = source): ListRow => ({ kind: "item", key: keyOf[source]!, item: items[source], index });
  const groupBy = input.groupBy;
  const grouped = typeof groupBy === "function" || (typeof groupBy === "string" && groupBy !== "");
  if (!grouped) return { rows: items.map((_, i) => itemRow(i)), items, keys: keyOf, grouped: false };

  const keyFor =
    typeof groupBy === "function" ? (item: unknown) => (groupBy as (item: unknown) => unknown)(item) : (item: unknown) => valueAt(item, groupBy as string);
  const members = new Map<string, number[]>();
  for (const name of strings(input.defaultGroups)) members.set(name, []);
  items.forEach((item, index) => {
    const name = String(keyFor(item));
    if (!members.has(name)) members.set(name, []);
    members.get(name)!.push(index);
  });
  const available = Array.isArray(input.availableGroups) ? strings(input.availableGroups) : undefined;
  const names = available ?? [...members.keys()];
  const rows: ListRow[] = [];
  const shown: unknown[] = [];
  const shownKeys: string[] = [];
  for (const name of new Set(names)) {
    const indexes = members.get(name) ?? [];
    if (indexes.length === 0 && input.hideEmptyGroups !== false) continue;
    const group: ListGroup = { id: name, key: name, items: indexes.map((i) => items[i]) };
    const first = shown.length;
    shown.push(...group.items);
    for (const i of indexes) shownKeys.push(keyOf[i]!);
    if (input.hasHeader) rows.push({ kind: "header", key: `$$group:${name}`, group });
    const open = input.expanded?.[name] ?? input.groupsInitiallyExpanded !== false;
    // Without a header nothing can fold a group: it stays open.
    if (open || !input.hasHeader) {
      indexes.forEach((source, n) => rows.push(itemRow(source, first + n)));
      if (input.hasFooter) rows.push({ kind: "footer", key: `$$group-footer:${name}`, group });
    }
  }
  return { rows, items: shown, keys: shownKeys, grouped: true };
}
