// Table and Column (step 30, .ai/plan/poc-30-table.md). XMLUI:
// xmlui/src/components/Table/Table.tsx (metadata), TableReact.tsx; Column.tsx.
//
//   table-model.ts  columns (Column entries or inference), widths, sorting, paging
//   value-types.ts  typed cells (value.tsx renders them)
//   selection.ts    the selection rules; row-selection.ts the state (shared with List)
//   virtual.ts      the rows on TanStack Virtual (shared with List)
//
// Decisions: our own column model (1); Columns compiled to data, `$$columns` (2);
// a grid of divs with table roles (3): every row is a CSS grid with the same
// `grid-template-columns`, star widths are `fr`, so the prerender has the final
// widths; a copy handler copies selected cells as tab-separated rows.
//
// DOM (the same in the static window and when virtual, so a takeover reuses it):
//   div.gfui-Table role=table           own scroll box with a height
//     div.gfui-Table-head role=rowgroup  sticky
//       div.gfui-Table-row role=row       header cells (role=columnheader)
//     div.gfui-Table-body role=rowgroup  the rows' box (height: all rows when virtual)
//       div.gfui-Table-row role=row       cells (role=cell); a detail row after an expanded one
//   nav.gfui-Pagination                 (paging)
import { HandlerSlot, pointerData, reportDiagnostic, reportRuntimeError, templateRenderer, useComponentApi, type RegisterApi, type TemplateFunction, type TemplateRenderer, useFrameworkText, useLocaleProfile } from "@gluefuil/runtime";
import { Checkbox, Switch } from "@mantine/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { DataUrl, isDataUrl } from "./data";
import { Spinner } from "./display";
import { Glyph } from "./icons";
import { useLayout, useMultipleScope, LayoutScope, type LayoutProps } from "./layout";
import { duplicateKeys, itemKey, valueAt } from "./list-model";
import { DEFAULT_KEY_BINDINGS, matchesKeyBinding } from "./list";
import { Pager, pageSizeOptions } from "./pagination";
import { useRowSelection } from "./row-selection";
import { keyTarget, pickRow, selectAllRows, selectKeys, type SelectionState } from "./selection";
import { clampWidth, columnMinimum, columnTrack, nextSort, pageSlice, sortRows, tableColumns, type ColumnEntry, type SortDirection, type SortState, type TableColumn } from "./table-model";
import { renderValue } from "./value";
import { END_ALIGNED_TYPES, INTERACTIVE_TYPES, normalizeValueType } from "./value-types";
import { useVirtualRows } from "./virtual";

type Handler = ((...args: unknown[]) => unknown) | undefined;

const isTrue = (v: unknown) => v === true || v === "true";
const isFalse = (v: unknown) => v === false || v === "false";
const text = (v: unknown): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));
const number = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const direction = (v: unknown): SortDirection | undefined => (v === "ascending" || v === "descending" ? v : undefined);

/** The selection and expansion columns. */
const EXTRA_WIDTH = 42;
const ESTIMATE = 40;
const TEXT_TYPE = normalizeValueType("text").type;
const TOLERANCE: Record<string, number> = { none: 0, compact: 8, comfortable: 12, spacious: 16 };
const ROW_VARIANT = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Column renders nothing: its Table reads it as data (`childrenAsColumns`). */
export function Column(): null {
  return null;
}

export type TableProps = LayoutProps & {
  data?: unknown;
  items?: unknown;
  $$columns?: ColumnEntry[];
  [name: string]: unknown;
  rowDetailTemplate?: TemplateRenderer;
  noDataTemplate?: TemplateRenderer;
  registerApi?: RegisterApi;
};

/** Renders `data` (an array or a URL) in columns, virtualized (XMLUI Table). */
export function Table(props: TableProps) {
  const data = props.items ?? props.data;
  if (isDataUrl(data)) return <DataUrl url={data} render={(value) => <TableView {...props} items={undefined} data={value} loading={value === undefined ? true : props.loading} />} />;
  return <TableView {...props} data={data} />;
}

interface Row {
  kind: "row" | "detail";
  key: string;
  item: unknown;
  /** The item's index in the data. */
  dataIndex: number;
  /** Its position among the shown rows. */
  position: number;
}

function TableView(props: TableProps) {
  const t = useFrameworkText();
  // Step 34: cells and sorting in the active (or nearest Locale's) locale.
  const { locale } = useLocaleProfile();
  const layout = useLayout(props);
  const scope = useMultipleScope();
  const latest = useRef(props);
  latest.current = props;
  const idKey = text(props.idKey) ?? "id";
  const own = props.height !== undefined || props.maxHeight !== undefined || props.$$layoutFrom?.height !== undefined || props.$$layoutFrom?.maxHeight !== undefined;
  const selectable = isTrue(props.rowsSelectable);
  const multi = !isFalse(props.enableMultiRowSelection);

  // --- Data and columns --------------------------------------------------------------------
  const source = useMemo(() => (Array.isArray(props.data) ? props.data.filter((item) => item !== null && item !== undefined) : []), [props.data]);
  const keyed = useMemo(() => {
    const seen = new Set<string>();
    return source.map((item, index) => {
      const k = itemKey(item, idKey);
      const key = k !== undefined && !seen.has(k) ? k : `$$index:${index}`;
      seen.add(key);
      return { item, key, dataIndex: index };
    });
  }, [source, idKey]);
  const warned = useRef("");
  useEffect(() => {
    const problems = duplicateKeys(source, idKey);
    const signature = problems.join("\u0000");
    if (problems.length > 0 && signature !== warned.current) {
      warned.current = signature;
      reportDiagnostic(`Table: the '${idKey}' values must be unique and not empty; rows fall back to their position (${problems.slice(0, 5).join(", ")})`);
    }
  }, [source, idKey]);
  const { columns, problems } = useMemo(
    () => tableColumns({ entries: props.$$columns, data: source, idKey, columnInference: props.columnInference, columnSizing: props.columnSizing, canResizeColumns: !isFalse(props.canResizeColumns) }),
    [props.$$columns, source, idKey, props.columnInference, props.columnSizing, props.canResizeColumns],
  );
  const reportedTypes = useRef("");
  useEffect(() => {
    const signature = problems.map((p) => `${p.column}:${p.message}`).join("\u0000");
    if (signature === "" || signature === reportedTypes.current) return;
    reportedTypes.current = signature;
    for (const p of problems) reportDiagnostic(`Table column '${p.column}': ${p.message} The column shows text.`);
  }, [problems]);

  // --- Sorting ------------------------------------------------------------------------------
  const defaultDirection = direction(props.defaultSortDirection) ?? "ascending";
  const initialSort = (): SortState => ({ by: text(props.sortBy), direction: direction(props.sortDirection) ?? defaultDirection });
  const [sort, setSort] = useState<SortState>(initialSort);
  const sortProps = `${text(props.sortBy) ?? ""}\u0000${text(props.sortDirection) ?? ""}`;
  const firstSortProps = useRef(sortProps);
  useEffect(() => {
    if (firstSortProps.current === sortProps) return;
    firstSortProps.current = sortProps;
    setSort(initialSort());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortProps]);
  const sorted = useMemo(() => {
    if (!sort.by) return keyed;
    const order = sortRows(keyed.map((k) => k.item), sort.by, sort.direction, locale);
    const byItem = new Map(keyed.map((k) => [k.item, k]));
    return order.map((item) => byItem.get(item)!);
  }, [keyed, sort, locale]);
  const onHeaderSort = async (column: TableColumn) => {
    if (!column.canSort || !column.field) return;
    const next = nextSort(sort, column.field, column.defaultSortDirection ?? defaultDirection);
    const willSort = latest.current.onWillSort as Handler;
    if (willSort && (await willSort(next.by, next.direction)) === false) return;
    setSort(next);
    void (latest.current.onSortingDidChange as Handler)?.(next.by, next.direction);
  };

  // --- Paging --------------------------------------------------------------------------------
  const pageSizeProp = number(props.pageSize);
  const sizes = pageSizeOptions(props.pageSizeOptions, pageSizeProp ?? 10);
  const [pageSize, setPageSize] = useState(pageSizeProp ?? sizes[0] ?? 10);
  useEffect(() => {
    if (pageSizeProp !== undefined) setPageSize(pageSizeProp);
  }, [pageSizeProp]);
  const [pageIndex, setPageIndex] = useState(0);
  const paginated = props.isPaginated === undefined ? pageSizeProp !== undefined && sorted.length > pageSizeProp : isTrue(props.isPaginated);
  const page = paginated ? pageSlice(sorted, pageIndex, pageSize) : { rows: sorted, pageIndex: 0 };
  const shown = page.rows;

  // --- Row details -----------------------------------------------------------------------------
  const controlledExpansion = Array.isArray(props.expandedRowIds);
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(() => new Set(Array.isArray(props.initiallyExpandedRowIds) ? props.initiallyExpandedRowIds.map(String) : []));
  const expandedIds = controlledExpansion ? new Set((props.expandedRowIds as unknown[]).map(String)) : ownExpanded;
  const hasDetails = props.rowDetailTemplate !== undefined;
  // The newest expansion, also before the next render (the API reads it right after changing it).
  const expansion = useRef(expandedIds);
  expansion.current = expandedIds;
  const setExpanded = (key: string, open: boolean) => {
    const current = expansion.current;
    if (current.has(key) === open) return;
    const next = new Set(current);
    if (open) next.add(key);
    else next.delete(key);
    expansion.current = next;
    if (!controlledExpansion) setOwnExpanded(next);
    void (latest.current.onRowExpansionDidChange as Handler)?.([...next], key, open);
  };

  const rows = useMemo(() => {
    const list: Row[] = [];
    shown.forEach((r, position) => {
      list.push({ kind: "row", key: r.key, item: r.item, dataIndex: r.dataIndex, position });
      if (hasDetails && expandedIds.has(r.key)) list.push({ kind: "detail", key: `${r.key}$$detail`, item: r.item, dataIndex: r.dataIndex, position });
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, hasDetails, [...expandedIds].join("\u0000")]);
  const keys = useMemo(() => rows.map((r) => r.key), [rows]);
  const rowIndexOf = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);

  // --- Selection -------------------------------------------------------------------------------
  const walk = useMemo(() => shown.map((r) => r.key), [shown]);
  const walkIndex = useMemo(() => new Map(walk.map((k, i) => [k, i])), [walk]);
  const itemByKey = useMemo(() => new Map(keyed.map((k) => [k.key, k.item])), [keyed]);
  const { selection, setSelection, options, unselectable, selectedKeys, selectedSet, selectedItems } = useRowSelection({
    multi,
    walk,
    itemByKey,
    unselectable: [props.rowUnselectablePredicate, props.rowDisabledPredicate],
    initiallySelected: props.initiallySelected,
    syncWithVar: props.syncWithVar,
    setSyncWithVar: props.$$setSyncWithVar as Handler,
    onSelectionDidChange: props.onSelectionDidChange as Handler,
  });
  const disabled = (item: unknown) => typeof props.rowDisabledPredicate === "function" && Boolean((props.rowDisabledPredicate as (i: unknown) => unknown)(item));
  const pick = (key: string, modifiers: Parameters<typeof pickRow>[3]) => {
    const index = walkIndex.get(key);
    if (index === undefined || !selectable) return;
    setSelection((state) => pickRow(state, walk, index, modifiers, options));
  };
  const selectableKeys = walk.filter((_, i) => !unselectable(i));
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selectedSet.has(k));
  const someSelected = !allSelected && selectableKeys.some((k) => selectedSet.has(k));

  // --- Where it scrolls, and the virtualizer ---------------------------------------------------------
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const scrollState = useRef<() => unknown>(() => undefined);
  const buffer = number(props.virtualBufferSize);
  const view = useVirtualRows({
    keys,
    own,
    root,
    content: body,
    estimate: ESTIMATE,
    overscan: buffer !== undefined && buffer > 0 ? Math.max(1, Math.ceil(buffer / ESTIMATE)) : 4,
    cacheSize: isFalse(props.renderCache) ? 0 : Math.max(0, Math.floor(number(props.renderCacheSize) ?? 80)),
    onUserScroll: () => void (latest.current.onScroll as Handler)?.(scrollState.current()),
  });
  const { virtualizer, virtual, margin, visibleRange } = view;
  scrollState.current = () => ({ ...view.scrollPosition(), visibleRange: visibleRange(), itemCount: rows.length });
  const range = visibleRange();
  const reportedRange = useRef("");
  useEffect(() => {
    const signature = `${range.startIndex}:${range.endIndex}`;
    if (signature === reportedRange.current || range.startIndex < 0) return;
    reportedRange.current = signature;
    void (latest.current.onVisibleRangeDidChange as Handler)?.({ ...range });
  });

  // --- Column widths, resizing, pinning -----------------------------------------------------------
  const [resized, setResized] = useState<Record<string, number>>({});
  const checkboxes = selectable && !isTrue(props.hideSelectionCheckboxes);
  const extras: { kind: "select" | "expand" }[] = [...(checkboxes ? [{ kind: "select" as const }] : []), ...(hasDetails ? [{ kind: "expand" as const }] : [])];
  const tracks = [...extras.map(() => `${EXTRA_WIDTH}px`), ...columns.map((c) => columnTrack(c, resized[c.key]))].join(" ");
  const minWidth = `calc(${[...extras.map(() => `${EXTRA_WIDTH}px`), ...columns.map((c) => columnMinimum(c, resized[c.key]))].join(" + ") || "0px"})`;
  // Measured header cell widths: pinned offsets for star columns (fixed ones are known).
  const [measured, setMeasured] = useState<number[]>([]);
  const anyPinned = columns.some((c) => c.pinTo);
  useLayoutEffect(() => {
    const row = head.current?.firstElementChild;
    if (!anyPinned || !row || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const next = [...row.children].map((cell) => (cell as HTMLElement).getBoundingClientRect().width);
      setMeasured((old) => (old.length === next.length && old.every((w, i) => Math.abs(w - next[i]!) < 0.5) ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const cell of [...row.children]) observer.observe(cell);
    return () => observer.disconnect();
  }, [anyPinned, columns.length, extras.length]);
  const pins = useMemo(() => {
    const all = [...extras.map(() => ({ pin: undefined as "left" | "right" | undefined, css: `${EXTRA_WIDTH}px` })), ...columns.map((c) => ({ pin: c.pinTo, css: columnTrack(c, resized[c.key]) }))];
    const leftPinned = columns.some((c) => c.pinTo === "left");
    // The selection and expansion columns stay with the left-pinned ones.
    if (leftPinned) for (let i = 0; i < extras.length; i++) all[i]!.pin = "left";
    const width = (i: number) => measured[i] ?? (/^\d+(\.\d+)?px$/.test(all[i]!.css) ? Number.parseFloat(all[i]!.css) : 0);
    const offsets: (CSSProperties | undefined)[] = all.map(() => undefined);
    let left = 0;
    all.forEach((c, i) => {
      if (c.pin !== "left") return;
      // Step 34: logical sides, so the start-pinned columns stick to the right in RTL.
      offsets[i] = { position: "sticky", insetInlineStart: left };
      left += width(i);
    });
    let right = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i]!.pin !== "right") continue;
      offsets[i] = { position: "sticky", insetInlineEnd: right };
      right += width(i);
    }
    return offsets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, extras.length, resized, measured]);

  const startResize = (event: PointerEvent<HTMLDivElement>, column: TableColumn) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const cell = handle.parentElement!;
    const startX = event.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    // Step 34: in RTL the resizer is on the cell's left edge; moving left widens it.
    const sign = getComputedStyle(cell).direction === "rtl" ? -1 : 1;
    handle.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => setResized((old) => ({ ...old, [column.key]: clampWidth(column, startWidth + sign * (e.clientX - startX)) }));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const resizeByKey = (event: KeyboardEvent<HTMLDivElement>, column: TableColumn) => {
    const step = event.shiftKey ? 50 : 10;
    const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const current = resized[column.key] ?? event.currentTarget.parentElement!.getBoundingClientRect().width;
    setResized((old) => ({ ...old, [column.key]: clampWidth(column, current + delta) }));
  };

  // --- Column handlers (willChange, didChange) and cell templates --------------------------------
  const columnSlots = useMemo(() => {
    const map = new Map<string, Record<string, HandlerSlot>>();
    for (const c of columns) {
      const handlers = c.entry?.$$handlers;
      if (!handlers || !c.entry?.$$scope) continue;
      const slots: Record<string, HandlerSlot> = {};
      for (const name of Object.keys(handlers)) slots[name] = new HandlerSlot(handlers[name]!(c.entry.$$scope) as never);
      map.set(c.key, slots);
    }
    return map;
  }, [columns]);
  useEffect(() => {
    for (const slots of columnSlots.values()) for (const slot of Object.values(slots)) slot.activate();
    return () => {
      for (const slots of columnSlots.values()) for (const slot of Object.values(slots)) slot.dispose();
    };
  }, [columnSlots]);
  const cellRenderers = useMemo(() => {
    const map = new Map<string, TemplateRenderer>();
    for (const c of columns) if (c.entry?.$$cell && c.entry.$$scope) map.set(c.key, templateRenderer(c.entry.$$scope, c.entry.$$cell as TemplateFunction));
    return map;
  }, [columns]);
  const change = async (column: TableColumn, row: Row, value: unknown) => {
    const slots = columnSlots.get(column.key);
    const cell = column.field ? valueAt(row.item, column.field) : undefined;
    const args = [value, row.item, row.position, column.id, cell];
    try {
      if (slots?.onWillChange && (await slots.onWillChange.call(args)) === false) return;
      await slots?.onDidChange?.call(args);
    } catch (error) {
      // Decision 5: rows are frozen data; XMLUI's `row.x = value` fails here.
      if (error instanceof TypeError && /read only|read-only|not extensible/i.test(error.message)) {
        reportRuntimeError(new Error(`Table column '${column.id}': table rows are read-only. Assign the variable instead, for example rows = rows.map(r => r.${idKey} === row.${idKey} ? { ...r, ${column.field ?? "field"}: value } : r)`), "handler");
      } else reportRuntimeError(error, "handler");
    }
  };
  const flag = (value: unknown, column: TableColumn, row: Row, colIndex: number, fallback: boolean) => {
    if (typeof value === "function") return Boolean((value as (...a: unknown[]) => unknown)(row.item, row.position, colIndex, column.id, column.field ? valueAt(row.item, column.field) : undefined));
    return value === undefined ? fallback : isTrue(value);
  };

  // --- The API --------------------------------------------------------------------------------
  const live = useRef({ virtualizer, virtual, rows, rowIndexOf, walk, selectedKeys, selectedItems, options, expandedIds, setExpanded });
  live.current = { virtualizer, virtual, rows, rowIndexOf, walk, selectedKeys, selectedItems, options, expandedIds, setExpanded };
  const api = useMemo(() => {
    const scrollToRow = (index: number, align: "start" | "end" | "auto" = "start") => {
      const l = live.current;
      if (index < 0 || index >= l.rows.length) return;
      if (l.virtual) l.virtualizer.scrollToIndex(index, { align });
      else root.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: align === "auto" ? "nearest" : align });
    };
    const update = (next: (s: SelectionState) => SelectionState) => setSelection((s) => next(s));
    return {
      scrollToTop: () => scrollToRow(0),
      scrollToBottom: () => scrollToRow(live.current.rows.length - 1, "end"),
      scrollToIndex: (index: unknown) => scrollToRow(Math.trunc(Number(index))),
      scrollToId: (id: unknown) => {
        const index = live.current.rowIndexOf.get(String(id));
        if (index !== undefined) scrollToRow(index);
      },
      getItemCount: () => live.current.rows.length,
      getVisibleRange: () => (scrollState.current() as { visibleRange: unknown }).visibleRange,
      expandRow: (id: unknown) => live.current.setExpanded(String(id), true),
      collapseRow: (id: unknown) => live.current.setExpanded(String(id), false),
      toggleRowExpansion: (id: unknown) => live.current.setExpanded(String(id), !expansion.current.has(String(id))),
      getExpandedRowIds: () => [...expansion.current],
      isRowExpanded: (id: unknown) => expansion.current.has(String(id)),
      clearSelection: () => update((s) => (s.selected.length === 0 ? s : { ...s, selected: [] })),
      getSelectedItems: () => [...live.current.selectedItems],
      getSelectedIds: () => [...live.current.selectedKeys],
      selectAll: () => {
        if (isTrue(latest.current.rowsSelectable)) update((s) => selectAllRows(s, live.current.walk, live.current.options));
      },
      selectId: (ids: unknown) => {
        if (isTrue(latest.current.rowsSelectable)) update((s) => selectKeys(s, live.current.walk, Array.isArray(ids) ? ids : [ids], live.current.options));
      },
    };
  }, [setSelection]);
  useComponentApi(props.registerApi, api);
  useEffect(() => {
    if (isTrue(props.autoFocus)) root.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Keys, copying -------------------------------------------------------------------------------
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectable || event.target !== event.currentTarget) return;
    const bindings = { ...DEFAULT_KEY_BINDINGS, ...(props.keyBindings !== null && typeof props.keyBindings === "object" ? (props.keyBindings as Record<string, string>) : {}) };
    const events: Record<string, string> = { selectAll: "onSelectAllAction", cut: "onCutAction", copy: "onCopyAction", paste: "onPasteAction", delete: "onDeleteAction" };
    for (const action of Object.keys(events)) {
      const binding = bindings[action as keyof typeof bindings];
      if (typeof binding !== "string" || !matchesKeyBinding(binding, event)) continue;
      const handler = props[events[action]!] as Handler;
      if (action !== "selectAll" && !handler) return;
      event.preventDefault();
      const state = action === "selectAll" ? selectAllRows(selection, walk, options) : selection;
      if (state !== selection) setSelection(state);
      const keysNow = state.selected.filter((k) => itemByKey.has(k));
      const focused = walk[state.focused];
      const row = focused === undefined ? null : { item: itemByKey.get(focused), rowIndex: state.focused, rowId: focused, isSelected: keysNow.includes(focused), isFocused: true };
      void handler?.(row, keysNow.map((k) => itemByKey.get(k)), keysNow);
      return;
    }
    const next = keyTarget(event.key, selection.focused, walk.length);
    if (next === undefined) return;
    event.preventDefault();
    setSelection((state) => pickRow(state, walk, next, { shift: event.shiftKey }, options));
    const index = rowIndexOf.get(walk[next]!);
    if (index !== undefined) {
      if (virtual) virtualizer.scrollToIndex(index, { align: "auto" });
      else root.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };
  // Decision 3: a selection across cells copies as tab-separated cells, a line per row (as a native table).
  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selected = typeof window === "undefined" ? null : window.getSelection();
    if (!selected || selected.isCollapsed || !body.current) return;
    // The data cells only: not the selection and expansion columns.
    const cells = [...body.current.querySelectorAll<HTMLElement>("[role=cell][data-col], .gfui-Table-detail")].filter((cell) => selected.containsNode(cell, true));
    if (cells.length < 2) return;
    const lines = new Map<Element, string[]>();
    for (const cell of cells) {
      const rowEl = cell.parentElement!;
      if (!lines.has(rowEl)) lines.set(rowEl, []);
      lines.get(rowEl)!.push((cell.textContent ?? "").trim());
    }
    const ordered = [...lines.entries()].sort((a, b) => Number(a[0].getAttribute("data-index")) - Number(b[0].getAttribute("data-index")));
    event.clipboardData.setData("text/plain", ordered.map(([, values]) => values.join("\t")).join("\n"));
    event.preventDefault();
  };
  const [hoveredColumn, setHoveredColumn] = useState<number | undefined>(undefined);
  const highlight = isTrue(props.highlightHoveredColumn);

  // --- Rendering ------------------------------------------------------------------------------------
  const align = props.cellVerticalAlign === "top" ? "start" : props.cellVerticalAlign === "bottom" ? "end" : "center";
  const tolerance = TOLERANCE[String(props.checkboxTolerance)] ?? TOLERANCE.compact!;
  const userSelect = (a: unknown, b: unknown) => (text(a) ?? text(b)) as CSSProperties["userSelect"] | undefined;
  const cellSelect = userSelect(props.userSelectCell, props.cellUserSelect);
  const headSelect = userSelect(props.userSelectHeading, props.headerUserSelect);
  const rowSelect = userSelect(props.userSelectRow, undefined);
  const gridStyle: CSSProperties = { gridTemplateColumns: tracks, minWidth };
  const sortIcon = (column: TableColumn) => {
    const active = sort.by !== undefined && sort.by === column.field;
    const name = active ? (sort.direction === "ascending" ? (text(props.iconSortAsc) ?? "sortasc") : (text(props.iconSortDesc) ?? "sortdesc")) : (text(props.iconNoSort) ?? "nosort");
    if (name === "-") return null;
    return <Glyph name={name} className="gfui-Table-sortIcon" />;
  };

  const header = isTrue(props.hideHeader) ? null : (
    <div ref={head} className="gfui-Table-head" role="rowgroup" data-sticky={own || isTrue(props.alwaysShowHeader) ? "" : undefined}>
      <div className="gfui-Table-row gfui-Table-headerRow" role="row" aria-rowindex={1} style={{ ...gridStyle, minHeight: text(props.headerHeight), userSelect: headSelect }}>
        {extras.map((extra, i) =>
          extra.kind === "select" ? (
            <div key="select" className="gfui-Table-cell gfui-Table-selectCell" role="columnheader" data-pinned={pins[i] ? "" : undefined} style={pins[i]} data-always={isTrue(props.alwaysShowSelectionCheckboxesHeader) || someSelected || allSelected ? "" : undefined}>
              {multi && !isTrue(props.hideSelectionCheckboxesHeader) ? (
                <Checkbox
                  size="xs"
                  aria-label={t("gfui.aria.selectAllRows")}
                  checked={allSelected}
                  indeterminate={someSelected}
                  className="gfui-Table-check"
                  vars={checkboxVars}
                  onChange={() => setSelection((s) => (allSelected ? { ...s, selected: s.selected.filter((k) => !walkIndex.has(k)) } : selectAllRows(s, walk, options)))}
                />
              ) : null}
            </div>
          ) : (
            <div key="expand" className="gfui-Table-cell gfui-Table-expandCell" role="columnheader" aria-label={t("gfui.aria.details")} data-pinned={pins[i] ? "" : undefined} style={pins[i]} />
          ),
        )}
        {columns.map((column, c) => {
          const i = extras.length + c;
          const active = sort.by !== undefined && sort.by === column.field;
          const content = (
            <>
              <span className="gfui-Table-headerText">{column.header}</span>
              {column.canSort ? <span className="gfui-Table-sort" data-visible={active || isTrue(props.alwaysShowSortingIndicator) ? "" : undefined}>{sortIcon(column)}</span> : null}
            </>
          );
          return (
            <div
              key={column.key}
              className="gfui-Table-cell gfui-Table-headerCell"
              role="columnheader"
              data-col={c}
              data-pinned={pins[i] ? column.pinTo ?? "left" : undefined}
              data-align={column.headerAlign ?? (column.type && END_ALIGNED_TYPES.has(column.type.name) ? "end" : undefined)}
              aria-sort={active ? (sort.direction === "ascending" ? "ascending" : "descending") : column.canSort ? "none" : undefined}
              style={pins[i]}
            >
              {column.canSort ? (
                <button type="button" className="gfui-Table-sortButton" onClick={() => void onHeaderSort(column)}>
                  {content}
                </button>
              ) : (
                <span className="gfui-Table-headerContent">{content}</span>
              )}
              {column.canResize ? (
                <div
                  className="gfui-Table-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${column.header}`}
                  aria-valuenow={resized[column.key] ?? measured[i] ?? undefined}
                  tabIndex={0}
                  onPointerDown={(event) => startResize(event, column)}
                  onKeyDown={(event) => resizeByKey(event, column)}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCell = (row: Row, column: TableColumn, c: number): ReactNode => {
    const value = column.field ? valueAt(row.item, column.field) : undefined;
    const renderer = cellRenderers.get(column.key);
    if (renderer) {
      return renderer({ $item: row.item, $row: row.item, $itemIndex: row.dataIndex, $rowIndex: row.dataIndex, $cell: value, $colIndex: c, $rowId: row.key }, `${row.key}:${column.key}`);
    }
    const type = column.type ?? TEXT_TYPE;
    if (INTERACTIVE_TYPES.has(type.name)) {
      const readOnly = flag(column.readOnly, column, row, c, false);
      const enabled = flag(column.enabled, column, row, c, true);
      const label = `${column.header}`;
      if (type.name === "checkbox") return <Checkbox size="xs" aria-label={label} checked={Boolean(value)} disabled={!enabled} readOnly={readOnly} vars={checkboxVars} onClick={(e) => e.stopPropagation()} onChange={(e) => !readOnly && void change(column, row, e.currentTarget.checked)} />;
      if (type.name === "switch") return <Switch size="sm" aria-label={label} checked={Boolean(value)} disabled={!enabled} readOnly={readOnly} onClick={(e) => e.stopPropagation()} onChange={(e) => !readOnly && void change(column, row, e.currentTarget.checked)} />;
      return (
        <input
          type="color"
          className="gfui-Table-color"
          aria-label={label}
          value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          disabled={!enabled || readOnly}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void change(column, row, e.currentTarget.value)}
        />
      );
    }
    return renderValue(value, type, { locale });
  };

  const renderRow = (row: Row, index: number, style: CSSProperties | undefined, measure: ((el: HTMLElement | null) => void) | undefined) => {
    if (row.kind === "detail") {
      return (
        <div key={row.key} ref={measure} className="gfui-Table-row gfui-Table-detailRow" role="row" data-index={index} style={{ ...style, ...gridStyle }}>
          <div className="gfui-Table-cell gfui-Table-detail" role="cell">
            {props.rowDetailTemplate?.({ $item: row.item, $row: row.item, $itemIndex: row.dataIndex, $rowIndex: row.dataIndex, $rowId: row.key, $isExpanded: true }, row.key)}
          </div>
        </div>
      );
    }
    const selected = selectedSet.has(row.key);
    const isDisabled = disabled(row.item);
    const canSelect = selectable && !unselectable(walkIndex.get(row.key) ?? -1);
    const variant = typeof props.rowVariant === "function" ? (props.rowVariant as (i: unknown) => unknown)(row.item) : undefined;
    const variantName = typeof variant === "string" && ROW_VARIANT.test(variant) ? variant : undefined;
    const variantStyle = variantName
      ? ({ "--gfui-row-variant-bg": `var(--gfui-backgroundColor-row-${variantName}-Table)`, "--gfui-row-variant-bg-hover": `var(--gfui-backgroundColor-row-${variantName}-Table--hover)`, "--gfui-row-variant-text": `var(--gfui-textColor-row-${variantName}-Table)` } as CSSProperties)
      : undefined;
    const expanded = expandedIds.has(row.key);
    return (
      <div
        key={row.key}
        ref={measure}
        className="gfui-Table-row"
        role="row"
        data-index={index}
        aria-rowindex={row.position + 2}
        aria-selected={selectable ? selected : undefined}
        aria-disabled={isDisabled || undefined}
        data-selected={selected ? "" : undefined}
        data-selectable={canSelect ? "" : undefined}
        data-disabled={isDisabled ? "" : undefined}
        data-parity={row.position % 2 === 0 ? "even" : "odd"}
        data-last={row.position === shown.length - 1 ? "" : undefined}
        data-variant={variantName}
        data-focused={walk[selection.focused] === row.key ? "" : undefined}
        style={{ ...style, ...gridStyle, ...variantStyle, userSelect: rowSelect }}
        onClick={(event: MouseEvent) => {
          if (canSelect) pick(row.key, isTrue(props.toggleSelectionOnClick) ? { toggle: true, shift: event.shiftKey } : { shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey });
          void (latest.current.onRowClick as Handler)?.(row.item);
        }}
        onDoubleClick={() => void (latest.current.onRowDoubleClick as Handler)?.(row.item)}
        onPointerEnter={props.onRowEnter ? () => void (latest.current.onRowEnter as Handler)?.(row.item) : undefined}
        onPointerLeave={props.onRowLeave ? () => void (latest.current.onRowLeave as Handler)?.(row.item) : undefined}
        onContextMenu={
          props.onContextMenu
            ? (event) => {
                event.preventDefault();
                void (latest.current.onContextMenu as Handler)?.(pointerData(event), row.item);
              }
            : undefined
        }
      >
        {extras.map((extra, i) =>
          extra.kind === "select" ? (
            <div
              key="select"
              className="gfui-Table-cell gfui-Table-selectCell"
              role="cell"
              data-pinned={pins[i] ? "left" : undefined}
              data-always={isTrue(props.alwaysShowSelectionCheckboxes) || selected ? "" : undefined}
              style={{ ...pins[i], padding: tolerance }}
              onClick={(event) => {
                event.stopPropagation();
                if (canSelect) pick(row.key, { toggle: true, shift: event.shiftKey });
              }}
            >
              <Checkbox size="xs" aria-label={t("gfui.aria.selectRow")} checked={selected} disabled={!canSelect} tabIndex={-1} className="gfui-Table-check" vars={checkboxVars} onChange={() => undefined} />
            </div>
          ) : (
            <div key="expand" className="gfui-Table-cell gfui-Table-expandCell" role="cell" data-pinned={pins[i] ? "left" : undefined} style={pins[i]}>
              <button
                type="button"
                className="gfui-Table-expandButton"
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse row" : "Expand row"}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(row.key, !expanded);
                }}
              >
                <Glyph name={expanded ? "chevrondown" : "chevronright"} />
              </button>
            </div>
          ),
        )}
        {columns.map((column, c) => {
          const i = extras.length + c;
          const type = column.type?.name;
          return (
            <div
              key={column.key}
              className="gfui-Table-cell"
              role="cell"
              data-col={c}
              data-hover-column={highlight && hoveredColumn === c ? "" : undefined}
              data-pinned={pins[i] ? column.pinTo ?? "left" : undefined}
              data-align={type && INTERACTIVE_TYPES.has(type) ? "center" : type && END_ALIGNED_TYPES.has(type) ? "end" : undefined}
              title={column.tooltip}
              style={{ ...pins[i], alignItems: align, userSelect: cellSelect }}
              onPointerEnter={highlight ? () => setHoveredColumn(c) : undefined}
            >
              {renderCell(row, column, c)}
            </div>
          );
        })}
      </div>
    );
  };

  let bodyRows: ReactNode;
  if (virtual) {
    bodyRows = virtualizer.getVirtualItems().map((v) => renderRow(rows[v.index]!, v.index, { transform: `translateY(${v.start - margin}px)` }, virtualizer.measureElement));
  } else {
    bodyRows = rows.slice(view.staticStart, view.staticEnd).map((row, i) => renderRow(row, view.staticStart + i, undefined, undefined));
  }
  const empty = rows.length === 0;
  const pagerLocation = text(props.paginationControlsLocation) ?? "bottom";
  const showPager = paginated && (props.alwaysShowPagination === undefined ? sorted.length > pageSize : isTrue(props.alwaysShowPagination));
  const pager = showPager ? (
    <Pager
      pageIndex={page.pageIndex}
      pageSize={pageSize}
      itemCount={sorted.length}
      pageSizeOptions={sizes}
      maxVisiblePages={1}
      enabled
      showPageInfo={!isFalse(props.showPageInfo)}
      showPageSizeSelector={!isFalse(props.showPageSizeSelector)}
      showCurrentPage={!isFalse(props.showCurrentPage)}
      orientation="horizontal"
      pageSizeSelectorPosition={(text(props.pageSizeSelectorPosition) as "start") ?? "start"}
      pageInfoPosition={(text(props.pageInfoPosition) as "end") ?? "end"}
      buttonRowPosition={(text(props.buttonRowPosition) as "center") ?? "center"}
      onPage={setPageIndex}
      onPageSize={(size) => {
        setPageSize(size);
        setPageIndex(0);
      }}
      className="gfui-Table-pagination"
    />
  ) : null;
  return (
    <div className="gfui-Table-frame" {...layout.attributes} style={own ? undefined : layout.style} data-own={own ? "" : undefined}>
      {pagerLocation === "top" || pagerLocation === "both" ? pager : null}
      <div
        ref={root}
        className="gfui-Table"
        role="table"
        aria-rowcount={shown.length + 1}
        aria-multiselectable={selectable && multi ? true : undefined}
        data-scroll={own ? "own" : "outside"}
        data-striped={isTrue(props.striped) ? "" : undefined}
        data-no-bottom-border={isTrue(props.noBottomBorder) ? "" : undefined}
        data-selectable={selectable ? "" : undefined}
        tabIndex={selectable ? 0 : undefined}
        style={own ? layout.style : undefined}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPointerLeave={highlight ? () => setHoveredColumn(undefined) : undefined}
      >
        {header}
        <div ref={body} className="gfui-Table-body" role="rowgroup" data-virtual={virtual ? "" : undefined} style={virtual ? { height: virtualizer.getTotalSize(), minWidth } : { minWidth }}>
          <LayoutScope value={scope}>{bodyRows}</LayoutScope>
        </div>
        {empty ? (
          isTrue(props.loading) ? (
            <div className="gfui-Table-loading">
              <Spinner delay={number(props.loadingDelay) ?? 400} />
            </div>
          ) : props.noDataTemplate ? (
            <div className="gfui-Table-noData">{props.noDataTemplate({})}</div>
          ) : (
            <div className="gfui-Table-noData">No data available</div>
          )
        ) : null}
      </div>
      {pagerLocation === "bottom" || pagerLocation === "both" ? pager : null}
    </div>
  );
}

const checkboxVars = () => ({ root: { "--checkbox-color": "var(--gfui-backgroundColor-Checkbox--checked)", "--checkbox-radius": "var(--gfui-borderRadius-Checkbox)" } });

