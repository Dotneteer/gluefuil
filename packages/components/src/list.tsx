// List (step 29, .ai/plan/poc-29-list.md): a virtualized list of item
// templates, with groups, selection, keyboard actions and bottom anchoring.
// XMLUI: xmlui/src/components/List/List.tsx (metadata), ListReact.tsx.
//
//   list-model.ts  data → rows (order, limit, groups)
//   selection.ts   the selection rules (shared with Table, step 30)
//   virtual.ts     the TanStack Virtual setup (where it scrolls, the render
//                  cache, user scrolls)
//
// Two modes with the same DOM (so a takeover reuses the prerendered rows):
//   - static: the first rows (the last with scrollAnchor="bottom") in normal
//     flow. The server render, the first client render, and any time the
//     viewport has no size (jsdom, a hidden tab);
//   - virtual: the rows in range, each placed absolutely at its measured
//     offset in a content box as tall as all rows.
import { pointerData, reportDiagnostic, reportRuntimeError, useComponentApi, type RegisterApi, type TemplateRenderer, type TraceCell, useFrameworkText } from "@gluefuil/runtime";
import { Checkbox } from "@mantine/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DataUrl, isDataUrl } from "./data";
import { Spinner } from "./display";
import { layoutCss } from "./layout-metadata";
import { LayoutScope, useLayout, useMultipleScope, type LayoutProps } from "./layout";
import { duplicateKeys, listModel, type ListGroup, type ListRow } from "./list-model";
import { keyTarget, pickRow, selectAllRows, selectKeys, type SelectionState } from "./selection";
import { useRowSelection } from "./row-selection";
import { useVirtualRows } from "./virtual";
export { keepsAnEdge, STATIC_ROWS } from "./virtual";

type Handler = ((...args: unknown[]) => unknown) | undefined;

/** The size of a row not measured yet. */
const ESTIMATE = 48;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown): string | undefined => (value === undefined || value === null || value === "" ? undefined : String(value));
const number = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export type ListProps = LayoutProps & {
  /** Step 35: the element's trace cell (its position names the diagnostics). */
  $$trace?: TraceCell;
  data?: unknown;
  items?: unknown;
  loading?: unknown;
  loadingDelay?: unknown;
  limit?: unknown;
  orderBy?: unknown;
  idKey?: unknown;
  scrollAnchor?: unknown;
  fixedItemSize?: unknown;
  renderCache?: unknown;
  renderCacheSize?: unknown;
  virtualBufferSize?: unknown;
  groupBy?: unknown;
  availableGroups?: unknown;
  defaultGroups?: unknown;
  hideEmptyGroups?: unknown;
  groupsInitiallyExpanded?: unknown;
  borderCollapse?: unknown;
  rowsSelectable?: unknown;
  enableMultiRowSelection?: unknown;
  initiallySelected?: unknown;
  /** The value of the variable `syncWithVar` names (the compiler resolves it, step 29 decision 3). */
  syncWithVar?: unknown;
  /** Writes that variable. */
  $$setSyncWithVar?: Handler;
  refreshOn?: unknown;
  rowUnselectablePredicate?: unknown;
  hideSelectionCheckboxes?: unknown;
  selectionCheckboxPosition?: unknown;
  selectionCheckboxAnchor?: unknown;
  selectionCheckboxOffsetX?: unknown;
  selectionCheckboxOffsetY?: unknown;
  selectionCheckboxSize?: unknown;
  keyBindings?: unknown;
  itemTemplate?: TemplateRenderer;
  emptyListTemplate?: TemplateRenderer;
  groupHeaderTemplate?: TemplateRenderer;
  groupFooterTemplate?: TemplateRenderer;
  onScroll?: Handler;
  onVisibleRangeDidChange?: Handler;
  onSelectionDidChange?: Handler;
  onRowDoubleClick?: Handler;
  onContextMenu?: Handler;
  onSelectAllAction?: Handler;
  onCutAction?: Handler;
  onCopyAction?: Handler;
  onPasteAction?: Handler;
  onDeleteAction?: Handler;
  registerApi?: RegisterApi;
};

/** XMLUI's default key bindings (List.defaults.ts). */
export const DEFAULT_KEY_BINDINGS: Readonly<Record<ListAction, string>> = {
  selectAll: "CmdOrCtrl+A",
  cut: "CmdOrCtrl+X",
  copy: "CmdOrCtrl+C",
  paste: "CmdOrCtrl+V",
  delete: "Delete",
};
type ListAction = "selectAll" | "cut" | "copy" | "paste" | "delete";
const ACTION_EVENTS: Record<ListAction, keyof ListProps> = {
  selectAll: "onSelectAllAction",
  cut: "onCutAction",
  copy: "onCopyAction",
  paste: "onPasteAction",
  delete: "onDeleteAction",
};

const KEY_NAMES: Record<string, string> = { del: "delete", esc: "escape", space: " ", return: "enter" };

/** Whether a key event matches a binding such as `CmdOrCtrl+Shift+X` or `Delete` (Electron-style accelerators, as XMLUI's). */
export function matchesKeyBinding(binding: string, event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  const parts = binding.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  if (!key) return false;
  let cmdOrCtrl = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  for (const part of parts) {
    if (part === "cmdorctrl" || part === "commandorcontrol") cmdOrCtrl = true;
    else if (part === "ctrl" || part === "control") ctrl = true;
    else if (part === "cmd" || part === "command" || part === "meta" || part === "super") meta = true;
    else if (part === "shift") shift = true;
    else if (part === "alt" || part === "option") alt = true;
    else return false;
  }
  if (cmdOrCtrl) {
    if (!event.ctrlKey && !event.metaKey) return false;
  } else if (event.ctrlKey !== ctrl || event.metaKey !== meta) return false;
  if (event.shiftKey !== shift || event.altKey !== alt) return false;
  return event.key.toLowerCase() === (KEY_NAMES[key] ?? key);
}

/** The List has a size of its own (it scrolls itself); otherwise it scrolls with its container. */
function hasOwnHeight(props: ListProps): boolean {
  const from = props.$$layoutFrom;
  const set = (name: string) => {
    const value = from?.[name] ?? props[name];
    return value !== undefined && value !== null && value !== "";
  };
  return set("height") || set("maxHeight");
}

/** A row's context for the keyboard actions (XMLUI ListRowContext). */
interface RowContext {
  item: unknown;
  rowIndex: number;
  rowId: string;
  isSelected: boolean;
  isFocused: boolean;
}

/** Renders `data` (an array, or a URL to load) through the item template, virtualized (XMLUI List). */
export function List(props: ListProps) {
  const data = props.items ?? props.data;
  if (isDataUrl(data)) return <DataUrl url={data} render={(value) => <ListView {...props} items={undefined} data={value} loading={value === undefined ? true : props.loading} />} />;
  return <ListView {...props} data={data} />;
}

function ListView(props: ListProps) {
  const t = useFrameworkText();
  const layout = useLayout(props);
  const scope = useMultipleScope();
  const latest = useRef(props);
  latest.current = props;
  const idKey = text(props.idKey) ?? "id";
  const bottom = props.scrollAnchor === "bottom";
  const own = hasOwnHeight(props);
  const selectable = isTrue(props.rowsSelectable);
  const multi = !isFalse(props.enableMultiRowSelection);

  // --- Rows ---------------------------------------------------------------------------
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const hasHeader = props.groupHeaderTemplate !== undefined;
  const hasFooter = props.groupFooterTemplate !== undefined;
  const model = useMemo(
    () =>
      listModel({
        data: props.data,
        idKey,
        orderBy: props.orderBy,
        limit: props.limit,
        groupBy: props.groupBy,
        defaultGroups: props.defaultGroups,
        availableGroups: props.availableGroups,
        hideEmptyGroups: !isFalse(props.hideEmptyGroups),
        groupsInitiallyExpanded: !isFalse(props.groupsInitiallyExpanded),
        expanded,
        hasHeader,
        hasFooter,
      }),
    [props.data, idKey, props.orderBy, props.limit, props.groupBy, props.defaultGroups, props.availableGroups, props.hideEmptyGroups, props.groupsInitiallyExpanded, expanded, hasHeader, hasFooter],
  );
  const { rows } = model;
  const rowIndex = useMemo(() => new Map(rows.map((row, i) => [row.key, i])), [rows]);
  const itemByKey = useMemo(() => new Map(model.keys.map((key, i) => [key, model.items[i]])), [model]);
  // The item rows a user can reach with the keys, in display order.
  const walk = useMemo(() => rows.filter((row) => row.kind === "item").map((row) => row.key), [rows]);
  const walkIndex = useMemo(() => new Map(walk.map((key, i) => [key, i])), [walk]);

  // Duplicate or empty ids make rows share state (XMLUI warns too, List.tsx 143–155).
  const warned = useRef("");
  useEffect(() => {
    const problems = duplicateKeys(model.items, idKey);
    const signature = problems.join("\u0000");
    if (problems.length > 0 && signature !== warned.current) {
      warned.current = signature;
      reportDiagnostic(`List: the '${idKey}' values must be unique and not empty; rows fall back to their position (${problems.slice(0, 5).join(", ")})`, {
        category: "component",
        ...(props.$$trace?.at ? { at: props.$$trace.at } : {}),
      });
    }
  }, [model.items, idKey]);

  // --- Groups: $group, memoized so a header's context changes only with its group ---------
  const groupContexts = useMemo(() => {
    const map = new Map<string, ListGroup & { isExpanded: boolean; toggle: () => void }>();
    for (const row of rows) {
      if (row.kind === "item" || map.has(row.group.key)) continue;
      const key = row.group.key;
      const isExpanded = expanded[key] ?? !isFalse(props.groupsInitiallyExpanded);
      map.set(key, { ...row.group, isExpanded, toggle: () => setExpanded((old) => ({ ...old, [key]: !isExpanded })) });
    }
    return map;
  }, [rows, expanded, props.groupsInitiallyExpanded]);

  // --- Selection (row-selection.ts, shared with Table) ---------------------------------------
  const { selection, setSelection, options, unselectable, selectedKeys, selectedSet, selectedItems } = useRowSelection({
    multi,
    walk,
    itemByKey,
    unselectable: [props.rowUnselectablePredicate],
    initiallySelected: props.initiallySelected,
    syncWithVar: props.syncWithVar,
    setSyncWithVar: props.$$setSyncWithVar,
    onSelectionDidChange: props.onSelectionDidChange,
  });
  const update = useCallback((next: (state: SelectionState) => SelectionState) => setSelection((state) => next(state)), [setSelection]);

  // --- Where it scrolls, and the virtualizer (virtual.ts, shared with Table) ----------------
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  const fixed = isTrue(props.fixedItemSize);
  const [fixedSize, setFixedSize] = useState<number | undefined>(undefined);
  const estimate = fixed && fixedSize !== undefined ? fixedSize : ESTIMATE;
  const buffer = number(props.virtualBufferSize);
  const scrollStateRef = useRef<() => unknown>(() => undefined);
  const rowsView = useVirtualRows({
    keys,
    own,
    root,
    content,
    estimate,
    overscan: buffer !== undefined && buffer > 0 ? Math.max(1, Math.ceil(buffer / estimate)) : 4,
    cacheSize: isFalse(props.renderCache) ? 0 : Math.max(0, Math.floor(number(props.renderCacheSize) ?? 80)),
    bottom,
    onUserScroll: () => void latest.current.onScroll?.(scrollStateRef.current()),
  });
  const { virtualizer, virtual, margin, visibleRange } = rowsView;
  useEffect(() => {
    if (fixedSize !== undefined) virtualizer.measure();
  }, [fixedSize, virtualizer]);

  // --- The visible range ---------------------------------------------------------------
  const range = visibleRange();
  const reported = useRef("");
  useEffect(() => {
    const signature = `${range.startIndex}:${range.endIndex}`;
    if (signature === reported.current || range.startIndex < 0) return;
    reported.current = signature;
    void latest.current.onVisibleRangeDidChange?.({ ...range });
  });

  // --- The scroll event: user scrolls only (XMLUI) ---------------------------------------
  const scrollState = () => ({ ...rowsView.scrollPosition(), visibleRange: visibleRange(), itemCount: rows.length });
  scrollStateRef.current = scrollState;

  // --- The API ---------------------------------------------------------------------------
  const live = useRef({ virtualizer, rows, rowIndex, virtual, own, walk, selectedKeys, selectedItems, options });
  live.current = { virtualizer, rows, rowIndex, virtual, own, walk, selectedKeys, selectedItems, options };
  const api = useMemo(() => {
    const scrollToRow = (index: number, align: "start" | "end" | "auto" = "start") => {
      const l = live.current;
      if (index < 0 || index >= l.rows.length) return;
      if (l.virtual) l.virtualizer.scrollToIndex(index, { align });
      else root.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: align === "auto" ? "nearest" : align });
    };
    return {
      scrollToTop: () => scrollToRow(0),
      scrollToBottom: () => {
        const l = live.current;
        if (l.virtual && l.own) l.virtualizer.scrollToEnd();
        else scrollToRow(l.rows.length - 1, "end");
      },
      scrollToIndex: (index: unknown) => scrollToRow(Math.trunc(Number(index))),
      scrollToId: (id: unknown) => {
        const index = live.current.rowIndex.get(String(id));
        if (index !== undefined) scrollToRow(index);
      },
      getItemCount: () => live.current.rows.length,
      getVisibleRange: () => (scrollStateRef.current() as ReturnType<typeof scrollState>).visibleRange,
      clearSelection: () => update((state) => (state.selected.length === 0 ? state : { ...state, selected: [] })),
      getSelectedItems: () => [...live.current.selectedItems],
      getSelectedIds: () => [...live.current.selectedKeys],
      selectAll: () => {
        if (!isTrue(latest.current.rowsSelectable)) return;
        update((state) => selectAllRows(state, live.current.walk, live.current.options));
      },
      selectId: (ids: unknown) => {
        if (!isTrue(latest.current.rowsSelectable)) return;
        update((state) => selectKeys(state, live.current.walk, Array.isArray(ids) ? ids : [ids], live.current.options));
      },
    };
  }, [update]);
  useComponentApi(props.registerApi, api);

  // --- Interaction ------------------------------------------------------------------------
  const pick = (key: string, modifiers: Parameters<typeof pickRow>[3]) => {
    const index = walkIndex.get(key);
    if (index === undefined || !selectable) return;
    setSelection((state) => pickRow(state, walk, index, modifiers, options));
  };
  const rowContext = (state: SelectionState): RowContext | null => {
    const key = walk[state.focused];
    if (key === undefined) return null;
    return { item: itemByKey.get(key), rowIndex: state.focused, rowId: key, isSelected: selectedSet.has(key), isFocused: true };
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectable) return;
    const bindings = { ...DEFAULT_KEY_BINDINGS, ...(props.keyBindings !== null && typeof props.keyBindings === "object" ? (props.keyBindings as Record<string, string>) : {}) };
    for (const action of Object.keys(ACTION_EVENTS) as ListAction[]) {
      const binding = bindings[action];
      if (typeof binding !== "string" || !matchesKeyBinding(binding, event)) continue;
      const handler = props[ACTION_EVENTS[action]] as Handler;
      // Select all is the List's own (the page's text selection would be wrong); the others only when handled.
      if (action !== "selectAll" && !handler) return;
      event.preventDefault();
      const state = action === "selectAll" ? selectAllRows(selection, walk, options) : selection;
      if (state !== selection) setSelection(state);
      const keys = state.selected.filter((k) => itemByKey.has(k));
      void handler?.(rowContext(state), keys.map((k) => itemByKey.get(k)), keys);
      return;
    }
    const next = keyTarget(event.key, selection.focused, walk.length);
    if (next === undefined) return;
    event.preventDefault();
    setSelection((state) => pickRow(state, walk, next, { shift: event.shiftKey }, options));
    const index = rowIndex.get(walk[next]!);
    if (index !== undefined) {
      if (virtual) virtualizer.scrollToIndex(index, { align: "auto" });
      else root.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };
  const onRowClick = (row: ListRow, event: MouseEvent) => {
    if (row.kind !== "item") return;
    pick(row.key, { shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey });
  };

  // --- Rendering ----------------------------------------------------------------------------
  const checkboxes = selectable && !isTrue(props.hideSelectionCheckboxes);
  const overlay = props.selectionCheckboxPosition === "overlay";
  const anchor = text(props.selectionCheckboxAnchor) ?? "center-left";
  const checkStyle = {
    "--gfui-List-check-x": layoutCss(props.selectionCheckboxOffsetX ?? "$space-2"),
    "--gfui-List-check-y": layoutCss(props.selectionCheckboxOffsetY ?? "$space-2"),
  } as CSSProperties;
  const checkSize = layoutCss(props.selectionCheckboxSize);
  // Mantine sets its own variables inline; ours go through `vars` (as inputs.tsx's Checkbox).
  const checkboxVars = () => ({
    root: {
      "--checkbox-color": "var(--gfui-backgroundColor-Checkbox--checked)",
      "--checkbox-radius": "var(--gfui-borderRadius-Checkbox)",
      ...(checkSize ? { "--checkbox-size": checkSize } : {}),
    },
  });
  const focusedKey = walk[selection.focused];
  const lastItem = model.items.length - 1;

  const cell = (row: ListRow): ReactNode => {
    if (row.kind === "item") {
      return props.itemTemplate?.(
        { $item: row.item, $itemIndex: row.index, $isFirst: row.index === 0, $isLast: row.index === lastItem, $isSelected: selectedSet.has(row.key) },
        row.key,
      );
    }
    const template = row.kind === "header" ? props.groupHeaderTemplate : props.groupFooterTemplate;
    return template?.({ $group: groupContexts.get(row.group.key) }, row.key);
  };

  const renderRow = (row: ListRow, index: number, style: CSSProperties | undefined, measure: ((el: HTMLDivElement | null) => void) | undefined) => {
    const isItem = row.kind === "item";
    const selected = isItem && selectedSet.has(row.key);
    const canSelect = selectable && isItem && !unselectable(walkIndex.get(row.key) ?? -1);
    return (
      <div
        key={row.key}
        ref={measure}
        className="gfui-List-row"
        data-index={index}
        data-kind={row.kind}
        data-first={index === 0 ? "" : undefined}
        data-last={index === rows.length - 1 ? "" : undefined}
        data-selectable={canSelect ? "" : undefined}
        data-selected={selected ? "" : undefined}
        data-focused={isItem && row.key === focusedKey ? "" : undefined}
        role={selectable ? (isItem ? "option" : "presentation") : "listitem"}
        aria-selected={selectable && isItem ? selected : undefined}
        aria-setsize={isItem ? model.items.length : undefined}
        aria-posinset={isItem ? row.index + 1 : undefined}
        style={style}
        onClick={(event) => onRowClick(row, event)}
        onDoubleClick={isItem && props.onRowDoubleClick ? () => void latest.current.onRowDoubleClick?.(row.item) : undefined}
        onContextMenu={
          isItem && props.onContextMenu
            ? (event) => {
                event.preventDefault();
                void latest.current.onContextMenu?.(pointerData(event), row.item);
              }
            : undefined
        }
      >
        {checkboxes && isItem ? (
          <div className="gfui-List-check" data-overlay={overlay ? "" : undefined} data-anchor={overlay ? anchor : undefined} style={overlay ? checkStyle : undefined} onClick={(event) => event.stopPropagation()}>
            <Checkbox
              size="xs"
              checked={selected}
              disabled={!canSelect}
              aria-label={t("gfui.aria.selectRow")}
              tabIndex={-1}
              className="gfui-List-checkbox"
              vars={checkboxVars}
              onChange={() => pick(row.key, { toggle: true })}
            />
          </div>
        ) : null}
        <div className="gfui-List-cell">{cell(row)}</div>
      </div>
    );
  };

  let body: ReactNode;
  if (virtual) {
    const items = virtualizer.getVirtualItems();
    body = items.map((v) => {
      const row = rows[v.index]!;
      const measure = fixed && fixedSize !== undefined ? undefined : fixed && v.index === 0 ? (el: HTMLDivElement | null) => measureFirst(el) : virtualizer.measureElement;
      return renderRow(row, v.index, { transform: `translateY(${v.start - margin}px)` }, measure);
    });
  } else {
    body = rows.slice(rowsView.staticStart, rowsView.staticEnd).map((row, i) => renderRow(row, rowsView.staticStart + i, undefined, undefined));
  }
  function measureFirst(el: HTMLDivElement | null) {
    virtualizer.measureElement(el);
    if (!el || fixedSize !== undefined) return;
    const height = el.getBoundingClientRect().height;
    if (height > 0) setFixedSize(height);
  }

  const empty = rows.length === 0;
  return (
    <div
      ref={root}
      className="gfui-List"
      data-scroll={own ? "own" : "outside"}
      data-anchor={bottom ? "bottom" : undefined}
      data-border-collapse={isFalse(props.borderCollapse) ? undefined : ""}
      data-grouped={model.grouped ? "" : undefined}
      role={empty ? undefined : selectable ? "listbox" : "list"}
      aria-multiselectable={selectable && multi ? true : undefined}
      tabIndex={selectable && !empty ? 0 : undefined}
      onKeyDown={onKeyDown}
      {...layout.attributes}
      style={layout.style}
    >
      {empty ? (
        isTrue(props.loading) ? (
          <div className="gfui-List-loading">
            <Spinner delay={number(props.loadingDelay) ?? 400} />
          </div>
        ) : props.emptyListTemplate ? (
          props.emptyListTemplate({})
        ) : (
          <div className="gfui-List-empty">No data available</div>
        )
      ) : null}
      <div
        ref={content}
        className="gfui-List-content"
        data-virtual={virtual ? "" : undefined}
        style={virtual ? { height: virtualizer.getTotalSize() } : undefined}
      >
        <LayoutScope value={scope}>{body}</LayoutScope>
      </div>
    </div>
  );
}
