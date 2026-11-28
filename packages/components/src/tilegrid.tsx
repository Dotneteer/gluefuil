// TileGrid (step 31, .ai/plan/poc-31-tree-tilegrid.md): data as a grid of
// fixed-size tiles, virtualized by rows. XMLUI: xmlui/src/components/TileGrid/
// TileGrid.tsx (metadata), TileGridReact.tsx.
//
// Decision B (measured in .tmp/vproto/tiles.html): the items are chunked into
// rows of `cols` tiles, one virtual row each, on the shared useVirtualRows
// (virtual.ts); a valid grid → row → gridcell structure. The column count comes
// from the measured width; when it changes, the first tile in view stays in
// view (both ways the prototype compared lost it).
//
// Static mode (the server render, jsdom, no width yet): the first tiles in a CSS
// grid (`repeat(auto-fill, itemWidth)`), laid out without knowing the width. XMLUI
// renders nothing until it knows the width.
import { pointerData, useComponentApi, type RegisterApi, type TemplateRenderer, useFrameworkText } from "@gluefuil/runtime";
import { Checkbox } from "@mantine/core";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { DataUrl, isDataUrl } from "./data";
import { Spinner } from "./display";
import { layoutCss } from "./layout-metadata";
import { LayoutScope, useLayout, useMultipleScope, type LayoutProps } from "./layout";
import { DEFAULT_KEY_BINDINGS, matchesKeyBinding } from "./list";
import { useRowSelection } from "./row-selection";
import { gridKeyTarget, pickRow, selectAllRows, selectKeys, type Modifiers } from "./selection";
import { useVirtualRows } from "./virtual";

type Handler = ((...args: unknown[]) => unknown) | undefined;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown): string | undefined => (value === undefined || value === null || value === "" ? undefined : String(value));
/** A size in pixels: XMLUI's parsePx (TileGridReact.tsx 21–25). */
const px = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Tiles in the static window (the server render). */
export const STATIC_TILES = 48;

export type TileGridProps = LayoutProps & {
  data?: unknown;
  itemWidth?: unknown;
  itemHeight?: unknown;
  gap?: unknown;
  stretchItems?: unknown;
  loading?: unknown;
  itemsSelectable?: unknown;
  enableMultiSelection?: unknown;
  toggleSelectionOnClick?: unknown;
  /** The value of the variable `syncWithVar` names (resolved by the compiler, as List's). */
  syncWithVar?: unknown;
  $$setSyncWithVar?: Handler;
  refreshOn?: unknown;
  hideSelectionCheckboxes?: unknown;
  checkboxPosition?: unknown;
  idKey?: unknown;
  itemUserSelect?: unknown;
  itemTemplate?: TemplateRenderer;
  onSelectionDidChange?: Handler;
  onItemDoubleClick?: Handler;
  onCutAction?: Handler;
  onCopyAction?: Handler;
  onPasteAction?: Handler;
  onDeleteAction?: Handler;
  onSelectAllAction?: Handler;
  onContextMenu?: Handler;
  registerApi?: RegisterApi;
};

/** Loads `data` from a URL first (as List does). */
export function TileGrid(props: TileGridProps) {
  if (isDataUrl(props.data)) return <DataUrl url={props.data} render={(value) => <TileGridView {...props} data={value} loading={value === undefined ? true : props.loading} />} />;
  return <TileGridView {...props} />;
}

function hasOwnHeight(props: TileGridProps): boolean {
  const from = props.$$layoutFrom;
  const set = (name: string) => {
    const value = from?.[name] ?? props[name];
    return value !== undefined && value !== null && value !== "";
  };
  return set("height") || set("maxHeight");
}

/** The number of tiles in a row: XMLUI's formula (TileGridReact.tsx 206–209). */
export function columnCount(width: number, itemWidth: number, gap: number): number {
  return width > 0 ? Math.max(1, Math.floor((width + gap) / (itemWidth + gap))) : 0;
}

const CHECKBOX_POSITIONS = new Set(["topStart", "topEnd", "bottomStart", "bottomEnd"]);
const ACTIONS = [
  ["selectAll", "onSelectAllAction"],
  ["cut", "onCutAction"],
  ["copy", "onCopyAction"],
  ["paste", "onPasteAction"],
  ["delete", "onDeleteAction"],
] as const;

function TileGridView(props: TileGridProps) {
  const t = useFrameworkText();
  const layout = useLayout(props);
  const scope = useMultipleScope();
  const latest = useRef(props);
  latest.current = props;
  const idKey = text(props.idKey) ?? "id";
  const own = hasOwnHeight(props);
  const selectable = isTrue(props.itemsSelectable);
  const multi = !isFalse(props.enableMultiSelection);
  const itemWidth = px(props.itemWidth, 120);
  const itemHeight = px(props.itemHeight, 140);
  const gapCss = layoutCss(props.gap ?? "$space-2") ?? "8px";

  // --- Items and their keys (the id, else the position; a repeated id falls back to it too) -------------
  const items = useMemo(() => (Array.isArray(props.data) ? (props.data as unknown[]) : []), [props.data]);
  const { keys, itemByKey, keyOf } = useMemo(() => {
    const seen = new Set<string>();
    const byKey = new Map<string, unknown>();
    const of = new Map<unknown, string>();
    const list = items.map((item, i) => {
      const id = item !== null && typeof item === "object" ? (item as Record<string, unknown>)[idKey] : undefined;
      let key = id === undefined || id === null || id === "" ? `#${i}` : String(id);
      if (seen.has(key)) key = `#${i}`;
      seen.add(key);
      byKey.set(key, item);
      of.set(item, key);
      return key;
    });
    return { keys: list, itemByKey: byKey as ReadonlyMap<string, unknown>, keyOf: of };
  }, [items, idKey]);
  const indexOf = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);

  // --- Columns from the measured width --------------------------------------------------------------
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0, gap: 8 });
  useLayoutEffect(() => {
    const el = root.current!;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(el).columnGap);
      const next = { width: el.clientWidth, height: el.clientHeight, gap: Number.isFinite(gap) ? gap : 8 };
      setBox((old) => (old.width === next.width && old.height === next.height && old.gap === next.gap ? old : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cols = columnCount(box.width, itemWidth, box.gap);
  const rowSize = itemHeight + box.gap;
  const tileWidth = isTrue(props.stretchItems) && cols > 0 ? (box.width - box.gap * (cols - 1)) / cols : itemWidth;
  // One row per `cols` tiles, keyed by its first tile.
  const rowKeys = useMemo(() => (cols === 0 ? [] : keys.filter((_, i) => i % cols === 0)), [keys, cols]);

  const view = useVirtualRows({ keys: rowKeys, own, root, content, estimate: rowSize, overscan: 2, cacheSize: 0 });
  const { virtualizer, virtual, margin } = view;
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [rowSize, virtualizer]);

  // A new column count keeps the first tile in view (the prototype showed it is lost otherwise).
  const firstTile = useRef(0);
  const lastCols = useRef(cols);
  useLayoutEffect(() => {
    if (!virtual || cols === 0) return;
    if (lastCols.current !== cols && lastCols.current > 0) {
      virtualizer.scrollToIndex(Math.floor(firstTile.current / cols), { align: "start" });
    } else {
      const range = virtualizer.range;
      if (range) firstTile.current = range.startIndex * cols;
    }
    lastCols.current = cols;
  });

  // --- Selection (row-selection.ts, as List and Table) -----------------------------------------------
  const { selection, setSelection, options, selectedKeys, selectedSet, selectedItems } = useRowSelection({
    multi,
    walk: keys,
    itemByKey,
    unselectable: [],
    syncWithVar: props.syncWithVar,
    setSyncWithVar: props.$$setSyncWithVar,
    onSelectionDidChange: props.onSelectionDidChange ? (chosen: unknown) => latest.current.onSelectionDidChange?.(chosen, (chosen as unknown[]).map((item) => keyOf.get(item))) : undefined,
  });
  // The focus ring, apart from the selection: Ctrl/Cmd with the arrows moves it alone (XMLUI).
  const [focused, setFocused] = useState(-1);
  const focusedIndex = focused < keys.length ? focused : keys.length - 1;

  const scrollToTile = (index: number) => {
    if (index < 0 || cols === 0) return;
    if (virtual) virtualizer.scrollToIndex(Math.floor(index / cols), { align: "auto" });
    else root.current?.querySelector(`[data-tile="${index}"]`)?.scrollIntoView({ block: "nearest" });
  };

  // The focused tile stays in view (XMLUI TileGridReact.tsx 262–267): keys, clicks and selectId move it.
  const scrolledTo = useRef(-1);
  useLayoutEffect(() => {
    if (focusedIndex === scrolledTo.current) return;
    scrolledTo.current = focusedIndex;
    if (focusedIndex >= 0) scrollToTile(focusedIndex);
  });

  // --- The API: what XMLUI's code registers (TileGridReact.tsx 276–295), which its metadata leaves out ------
  const live = useRef({ keys, indexOf, selectedKeys, selectedItems, options });
  live.current = { keys, indexOf, selectedKeys, selectedItems, options };
  const api = useMemo(
    () => ({
      clearSelection: () => {
        setSelection((state) => (state.selected.length === 0 ? state : { ...state, selected: [] }));
        setFocused(-1);
      },
      selectAll: () => setSelection((state) => selectAllRows(state, live.current.keys, live.current.options)),
      selectId: (ids: unknown) => {
        const list = Array.isArray(ids) ? ids : [ids];
        setSelection((state) => selectKeys(state, live.current.keys, list, live.current.options));
        setFocused(live.current.indexOf.get(String(list[0])) ?? -1);
      },
      getSelectedItems: () => [...live.current.selectedItems],
      getSelectedIds: () => [...live.current.selectedKeys],
    }),
    [setSelection],
  );
  useComponentApi(props.registerApi, api);

  // --- Interaction ---------------------------------------------------------------------------------------
  const hasActions = ACTIONS.some(([, event]) => props[event] !== undefined);
  const keyboard = selectable || hasActions;
  const pick = (index: number, modifiers: Modifiers) => {
    if (!selectable) return;
    setSelection((state) => pickRow(state, keys, index, modifiers, options));
  };
  const onTileClick = (index: number, event: MouseEvent) => {
    if (!selectable) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const wasSelected = selectedSet.has(keys[index]!);
    // Ctrl/Cmd on a selected tile deselects it and clears the focus ring (XMLUI).
    setFocused(ctrl && wasSelected ? -1 : index);
    const plain = !event.shiftKey && !ctrl;
    pick(index, plain && isTrue(props.toggleSelectionOnClick) ? { toggle: true } : { shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!keyboard || event.target !== event.currentTarget) return;
    for (const [action, name] of ACTIONS) {
      if (!matchesKeyBinding(DEFAULT_KEY_BINDINGS[action], event)) continue;
      const handler = props[name];
      if (action === "selectAll" ? !selectable : !handler) return;
      event.preventDefault();
      const state = action === "selectAll" ? selectAllRows(selection, keys, options) : selection;
      if (state !== selection) setSelection(state);
      const chosen = state.selected.filter((k) => itemByKey.has(k));
      const focusedItem = focusedIndex >= 0 ? itemByKey.get(keys[focusedIndex]!) : null;
      const items = chosen.map((k) => itemByKey.get(k));
      // XMLUI passes null as the focused item; the focused tile is passed here.
      if (action === "selectAll") void handler?.(items, chosen);
      else void handler?.(focusedItem, items, chosen);
      return;
    }
    if (event.key === " " && focusedIndex >= 0) {
      event.preventDefault();
      pick(focusedIndex, { toggle: true });
      return;
    }
    const pageRows = Math.max(1, Math.floor(box.height / Math.max(1, rowSize)));
    const ctrl = event.ctrlKey || event.metaKey;
    const next = gridKeyTarget(event.key, focusedIndex, keys.length, Math.max(1, cols), pageRows, ctrl);
    if (next === undefined) return;
    event.preventDefault();
    if (!(ctrl && !event.shiftKey)) pick(next, { shift: event.shiftKey });
    setFocused(next);
  };

  // --- Rendering -----------------------------------------------------------------------------------------
  const checkboxes = selectable && !isTrue(props.hideSelectionCheckboxes);
  const checkboxPosition = CHECKBOX_POSITIONS.has(String(props.checkboxPosition)) ? String(props.checkboxPosition) : "topStart";
  const last = items.length - 1;
  const checkboxVars = () => ({ root: { "--checkbox-color": "var(--gfui-backgroundColor-Checkbox--checked)", "--checkbox-radius": "var(--gfui-borderRadius-Checkbox)" } });

  const tile = (index: number, style?: CSSProperties): ReactNode => {
    const key = keys[index]!;
    const item = itemByKey.get(key);
    const selected = selectedSet.has(key);
    return (
      <div
        key={key}
        className="gfui-TileGrid-tile"
        role="gridcell"
        data-tile={index}
        data-selected={selected ? "" : undefined}
        data-focused={keyboard && index === focusedIndex ? "" : undefined}
        data-selectable={selectable ? "" : undefined}
        aria-selected={selectable ? selected : undefined}
        style={style}
        onClick={(event) => onTileClick(index, event)}
        onDoubleClick={props.onItemDoubleClick ? () => void latest.current.onItemDoubleClick?.(item, index) : undefined}
        onContextMenu={
          props.onContextMenu
            ? (event) => {
                event.preventDefault();
                void latest.current.onContextMenu?.(pointerData(event), item, index);
              }
            : undefined
        }
      >
        {checkboxes ? (
          <div className="gfui-TileGrid-check" data-position={checkboxPosition} onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.stopPropagation()}>
            <Checkbox
              size="xs"
              checked={selected}
              aria-label={`Select ${String(item !== null && typeof item === "object" ? ((item as Record<string, unknown>)[idKey] ?? index) : index)}`}
              tabIndex={-1}
              vars={checkboxVars}
              onChange={() => {
                setFocused(selected ? -1 : index);
                pick(index, { toggle: true });
              }}
            />
          </div>
        ) : null}
        <div className="gfui-TileGrid-content">
          {props.itemTemplate?.({ $item: item, $itemIndex: index, $isFirst: index === 0, $isLast: index === last, $selected: selected }, key)}
        </div>
      </div>
    );
  };

  let body: ReactNode = null;
  if (isTrue(props.loading)) {
    body = (
      <div className="gfui-TileGrid-loading">
        <Spinner delay={0} />
      </div>
    );
  } else if (virtual && cols > 0) {
    body = virtualizer.getVirtualItems().map((v) => {
      const start = v.index * cols;
      const tiles: ReactNode[] = [];
      for (let i = start; i < Math.min(keys.length, start + cols); i++) tiles.push(tile(i, { width: tileWidth, height: itemHeight }));
      return (
        <div key={v.key} className="gfui-TileGrid-row" role="row" data-index={v.index} style={{ transform: `translateY(${v.start - margin}px)`, height: itemHeight }}>
          {tiles}
        </div>
      );
    });
  } else if (keys.length > 0) {
    const count = Math.min(keys.length, STATIC_TILES);
    const tiles: ReactNode[] = [];
    for (let i = 0; i < count; i++) tiles.push(tile(i, { height: itemHeight }));
    body = (
      <div className="gfui-TileGrid-static" role="row" style={{ gridTemplateColumns: `repeat(auto-fill, ${isTrue(props.stretchItems) ? `minmax(${itemWidth}px, 1fr)` : `${itemWidth}px`})` }}>
        {tiles}
      </div>
    );
  }

  return (
    <div
      ref={root}
      className="gfui-TileGrid"
      data-scroll={own ? "own" : "outside"}
      role="grid"
      aria-label={t("gfui.aria.tileGrid")}
      aria-multiselectable={selectable && multi ? true : undefined}
      tabIndex={keyboard ? 0 : undefined}
      onKeyDown={onKeyDown}
      {...layout.attributes}
      style={{ ...layout.style, columnGap: gapCss, "--gfui-TileGrid-gap": gapCss, "--gfui-TileGrid-userSelect": text(props.itemUserSelect) ?? "none" } as CSSProperties}
    >
      <div ref={content} className="gfui-TileGrid-content-box" data-virtual={virtual && cols > 0 ? "" : undefined} style={virtual && cols > 0 ? { height: virtualizer.getTotalSize() } : undefined}>
        <LayoutScope value={scope}>{body}</LayoutScope>
      </div>
    </div>
  );
}
