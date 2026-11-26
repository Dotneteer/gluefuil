// Tree (step 31, .ai/plan/poc-31-tree-tilegrid.md): hierarchical data as a
// virtualized list of tree items. XMLUI: xmlui/src/components/Tree/Tree.tsx
// (metadata), TreeReact.tsx.
//
//   tree-model.ts   the data index (flat or nested, mapped fields), edits,
//                   default expansion, tree state (React-free)
//   headless-tree   the visible items with their ARIA metadata, focus and the
//                   navigation keys (decision A). Its state is controlled: the
//                   TreeStore below owns expansion and focus and writes them in.
//   virtual.ts      the rows on TanStack Virtual (shared with List and Table);
//                   the focused row stays mounted (`pinned`: the one tab stop)
//
// The TreeStore is a plain object in a ref, so an API call sees its own
// writes at once (step 30 found APIs that read stale React state). Its changes
// re-render the component through `notify`.
import { createTree, hotkeysCoreFeature, syncDataLoaderFeature, type FeatureImplementation, type TreeInstance } from "@headless-tree/core";
import { pointerData, reportRuntimeError, useComponentApi, type RegisterApi, type TemplateRenderer } from "@gluefuil/runtime";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { DataUrl, isDataUrl } from "./data";
import { Spinner } from "./display";
import { Icon } from "./icons";
import { LayoutScope, useLayout, useMultipleScope, type LayoutProps } from "./layout";
import { DEFAULT_KEY_BINDINGS, matchesKeyBinding } from "./list";
import {
  ancestors,
  appendNode,
  buildTreeIndex,
  childKeys,
  copyChildren,
  defaultExpandedKeys,
  entryExpanded,
  entryLoadingState,
  getTreeState,
  initialLoadingState,
  insertSibling,
  isDynamicNode,
  isSelectableNode,
  keysToLevel,
  nodeField,
  nodeName,
  parseDefaultExpansion,
  removeChildren,
  removeNode,
  replaceNode,
  setChildren,
  stateScrollPosition,
  TREE_ROOT,
  treeFields,
  treeStateEntries,
  type LoadingState,
  type TreeFields,
  type TreeIndex,
  type TreeItemState,
  type TreeNode,
} from "./tree-model";
import { useVirtualRows } from "./virtual";

type Handler = ((...args: unknown[]) => unknown) | undefined;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const number = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export type TreeProps = LayoutProps & {
  data?: unknown;
  dataFormat?: unknown;
  idField?: unknown;
  nameField?: unknown;
  iconField?: unknown;
  iconExpandedField?: unknown;
  iconCollapsedField?: unknown;
  parentIdField?: unknown;
  childrenField?: unknown;
  selectableField?: unknown;
  loadedField?: unknown;
  dynamicField?: unknown;
  autoLoadAfterField?: unknown;
  selectedValue?: unknown;
  selectedId?: unknown;
  defaultExpanded?: unknown;
  initialTreeState?: unknown;
  dataRefreshMode?: unknown;
  autoExpandToSelection?: unknown;
  itemClickExpands?: unknown;
  iconCollapsed?: unknown;
  iconExpanded?: unknown;
  iconSize?: unknown;
  itemHeight?: unknown;
  fixedItemSize?: unknown;
  animateExpand?: unknown;
  expandRotation?: unknown;
  dynamic?: unknown;
  autoLoadAfter?: unknown;
  spinnerDelay?: unknown;
  scrollStyle?: unknown;
  showScrollerFade?: unknown;
  overflow?: unknown;
  itemTemplate?: TemplateRenderer;
  onSelectionDidChange?: Handler;
  onNodeDidExpand?: Handler;
  onNodeDidCollapse?: Handler;
  onLoadChildren?: Handler;
  onContextMenu?: Handler;
  onCutAction?: Handler;
  onCopyAction?: Handler;
  onPasteAction?: Handler;
  onDeleteAction?: Handler;
  registerApi?: RegisterApi;
};

/** Loads `data` from a URL first (as List and Table do). */
export function Tree(props: TreeProps) {
  if (isDataUrl(props.data)) return <DataUrl url={props.data} render={(value) => <TreeView {...props} data={value ?? []} />} />;
  return <TreeView {...props} />;
}

type ScrollAlign = "start" | "center" | "end" | "auto";
type RefreshOptions = { operation?: unknown; scrollTarget?: unknown };
const UNSET = Symbol("unset");

/** The Tree's state: the working copy of the data and the view state (decisions C and D). */
class TreeStore {
  props: TreeProps = {};
  index: TreeIndex = buildTreeIndex([], "flat");
  base: unknown = UNSET;
  shape = "";
  expanded = new Set<string>();
  loading = new Map<string, LoadingState>();
  selected: string | undefined;
  focused: string | null = null;
  expandedAt = new Map<string, number>();
  collapsedAt = new Map<string, number>();
  autoLoadAfter = new Map<string, number | null>();
  /** initialTreeState entries whose nodes haven't appeared yet. */
  pending: [string, TreeItemState][] = [];
  preserveNext: RefreshOptions | undefined;
  lastWanted: unknown = UNSET;
  /** Bumped on every change of the index or the expanded set (headless-tree rebuilds then). */
  structure = 0;
  /** Scrolls to do after the next render (the rows must exist first). */
  scrollTo: { key: string; align: ScrollAlign; ifNeeded?: boolean } | undefined;
  scrollTop: number | undefined;
  /** The current load of a node, so a stale answer is dropped. */
  private loads = new Map<string, number>();
  private loadSeq = 0;
  private views = new Map<string, Readonly<Record<string, unknown>>>();
  /** Lazy loads asked for while rendering (a restored state), started after the commit. */
  toLoad: string[] = [];
  /** Repeated ids to report after the commit. */
  duplicates: readonly string[] = [];
  notify: () => void = () => undefined;
  syncing = false;

  // --- Node facts ---------------------------------------------------------------------
  dynamic(key: string): boolean {
    return typeof this.props.onLoadChildren === "function" && isDynamicNode(this.index, key, isTrue(this.props.dynamic));
  }
  loadingState(key: string): LoadingState {
    return this.loading.get(key) ?? initialLoadingState(this.index, key, this.dynamic(key));
  }
  isFolder(key: string): boolean {
    return childKeys(this.index, key).length > 0 || (this.dynamic(key) && this.loadingState(key) !== "loaded");
  }
  exists(key: string | undefined): key is string {
    return key !== undefined && this.index.nodes.has(key);
  }

  /** The node as handlers and templates see it ($item; XMLUI Tree.tsx 617–625); the same object while nothing in it changed. */
  view(key: string | undefined): Record<string, unknown> | null {
    if (!this.exists(key)) return null;
    const node = this.index.nodes.get(key)!;
    const parent = this.index.parent.get(key);
    const up = ancestors(this.index, key);
    const fields = this.index.fields;
    const view: Record<string, unknown> = {
      ...node.item,
      id: node.id,
      key,
      name: nodeName(this.index, key),
      displayName: nodeName(this.index, key),
      depth: up.length,
      isExpanded: this.expanded.has(key),
      hasChildren: this.isFolder(key),
      children: childKeys(this.index, key).map((k) => this.index.nodes.get(k)!.item),
      selectable: isSelectableNode(this.index, key),
      parentId: parent === undefined || parent === TREE_ROOT ? null : this.index.nodes.get(parent)!.id,
      parentIds: up.map((k) => this.index.nodes.get(k)!.id),
      path: [...up, key].map((k) => nodeName(this.index, k)),
      loadingState: this.loadingState(key),
      icon: node.item[fields.icon],
      iconExpanded: node.item[fields.iconExpanded],
      iconCollapsed: node.item[fields.iconCollapsed],
    };
    const cached = this.views.get(key);
    if (cached && sameView(cached, view)) return cached;
    const frozen = Object.freeze(view);
    this.views.set(key, frozen);
    return frozen;
  }

  // --- Data (decision C: a working copy, replaced by every new `data`) ------------------------
  sync(props: TreeProps): void {
    this.props = props;
    const format = props.dataFormat === "hierarchy" ? "hierarchy" : "flat";
    const fields = treeFields({
      id: props.idField,
      name: props.nameField,
      icon: props.iconField,
      iconExpanded: props.iconExpandedField,
      iconCollapsed: props.iconCollapsedField,
      parentId: props.parentIdField,
      children: props.childrenField,
      selectable: props.selectableField,
      loaded: props.loadedField,
      dynamic: props.dynamicField,
      autoLoadAfter: props.autoLoadAfterField,
    });
    const shape = `${format}\u0000${Object.values(fields).join("\u0000")}`;
    if (this.base === UNSET) this.load(props.data, format, fields, shape, "first");
    else if (props.data !== this.base || shape !== this.shape) {
      const preserve = this.preserveNext !== undefined || props.dataRefreshMode === "preserve-state";
      this.load(props.data, format, fields, shape, preserve && shape === this.shape ? "preserve" : "reset");
    }
    // decision D: selectedValue is the first selection and follows its changes (no event).
    const wanted = props.selectedValue ?? props.selectedId;
    // Unset from the start: the selection is the user's (or a saved state's).
    if (this.lastWanted === UNSET && (wanted === undefined || wanted === null)) this.lastWanted = wanted;
    if (wanted !== this.lastWanted) {
      this.lastWanted = wanted;
      this.selected = wanted === undefined || wanted === null || wanted === "" ? undefined : String(wanted);
      if (this.exists(this.selected)) {
        this.revealSelection();
        this.scrollTo = { key: this.selected, align: "auto", ifNeeded: true };
      }
    }
  }

  private load(data: unknown, format: "flat" | "hierarchy", fields: TreeFields, shape: string, mode: "first" | "reset" | "preserve"): void {
    const old = this.index;
    const oldLoading = this.loading;
    let index = buildTreeIndex(data, format, fields);
    this.duplicates = index.duplicates;
    this.base = data;
    this.shape = shape;
    if (mode === "preserve") {
      // Loaded children of nodes that survive, when the new data has none for them.
      for (const [key, state] of oldLoading) {
        if (state === "loaded" && index.nodes.has(key) && childKeys(index, key).length === 0 && childKeys(old, key).length > 0) index = copyChildren(index, old, key);
      }
      this.index = index;
      this.expanded = new Set([...this.expanded].filter((k) => index.nodes.has(k)));
      this.loading = new Map([...oldLoading].filter(([k, s]) => index.nodes.has(k) && s !== "loading"));
      for (const map of [this.expandedAt, this.collapsedAt, this.autoLoadAfter]) for (const k of [...map.keys()]) if (!index.nodes.has(k)) map.delete(k);
      this.afterPreserve(old, this.preserveNext ?? {});
    } else {
      this.index = index;
      this.loading = new Map();
      this.expandedAt = new Map();
      this.collapsedAt = new Map();
      this.loads.clear();
      const spec = parseDefaultExpansion(this.props.defaultExpanded);
      this.expanded = new Set(defaultExpandedKeys(index, spec, (k) => this.dynamic(k) && this.loadingState(k) === "unloaded"));
      if (mode === "first") {
        const initial = this.props.initialTreeState;
        this.pending = treeStateEntries(initial, index).missing;
        this.applyEntries(treeStateEntries(initial, index).present);
        this.scrollTop = stateScrollPosition(initial);
      }
    }
    this.preserveNext = undefined;
    // Saved entries for nodes that appeared now.
    if (this.pending.length > 0) {
      const now = this.pending.filter(([id]) => index.nodes.has(id));
      this.pending = this.pending.filter(([id]) => !index.nodes.has(id));
      this.applyEntries(now);
    }
    if (mode === "first" && this.exists(this.selected)) this.revealSelection();
    this.fixFocus();
    this.structure++;
  }

  /** preserveStateOnNextDataRefresh's scroll intent (Tree.md § Preserving State Across Data Refreshes). */
  private afterPreserve(old: TreeIndex, options: RefreshOptions): void {
    const target = options.scrollTarget;
    if (target !== undefined && target !== "preserve" && target !== "first-inserted") {
      const key = String(target);
      if (this.exists(key)) this.scrollTo = { key, align: "auto" };
      return;
    }
    if (options.operation === "insert" || target === "first-inserted") {
      const inserted = [...this.index.nodes.keys()].find((k) => !old.nodes.has(k) && this.isVisible(k));
      if (inserted !== undefined) this.scrollTo = { key: inserted, align: "auto", ifNeeded: true };
    }
  }

  private isVisible(key: string): boolean {
    return ancestors(this.index, key).every((a) => this.expanded.has(a));
  }

  /** autoExpandToSelection (default true): the selected node's path opens. */
  private revealSelection(): void {
    if (isFalse(this.props.autoExpandToSelection) || this.selected === undefined) return;
    const closed = ancestors(this.index, this.selected).filter((a) => !this.expanded.has(a));
    if (closed.length === 0) return;
    for (const a of closed) this.expanded.add(a);
    this.structure++;
  }

  /** The focused row must be visible: else its nearest visible ancestor (the one tab stop). */
  fixFocus(): void {
    if (this.focused === null) return;
    if (!this.exists(this.focused)) {
      this.focused = null;
      return;
    }
    const hidden = ancestors(this.index, this.focused).find((a) => !this.expanded.has(a));
    if (hidden !== undefined) this.focused = hidden;
  }

  private applyEntries(entries: [string, TreeItemState][]): void {
    const toLoad: string[] = [];
    for (const [key, entry] of entries) {
      if (!this.index.nodes.has(key)) continue;
      const loading = entryLoadingState(entry);
      // A saved "loaded" for a node whose children are gone means loading them again.
      if (loading !== undefined && loading !== "loading" && this.dynamic(key)) {
        this.loading.set(key, loading === "loaded" && childKeys(this.index, key).length === 0 ? "unloaded" : loading);
      }
      const expanded = entryExpanded(entry);
      if (expanded === true) {
        this.expanded.add(key);
        if (this.dynamic(key) && this.loadingState(key) === "unloaded") toLoad.push(key);
      } else if (expanded === false) this.expanded.delete(key);
      if (entry.selected === true) this.selected = key;
      if (typeof entry.expandedTimestamp === "number") this.expandedAt.set(key, entry.expandedTimestamp);
      if (typeof entry.collapsedTimestamp === "number") this.collapsedAt.set(key, entry.collapsedTimestamp);
      if (entry.autoLoadAfter === null || typeof entry.autoLoadAfter === "number") this.autoLoadAfter.set(key, entry.autoLoadAfter);
    }
    this.toLoad.push(...toLoad);
  }

  setTreeState(state: unknown): void {
    this.applyEntries(treeStateEntries(state, this.index).present);
    const top = stateScrollPosition(state);
    if (top !== undefined) this.scrollTop = top;
    this.fixFocus();
    this.changed();
  }

  /** A change of the index or the expanded set. */
  changed(): void {
    this.structure++;
    this.notify();
  }

  edit(next: TreeIndex): void {
    if (next === this.index) return;
    this.index = next;
    for (const k of [...this.expanded]) if (!next.nodes.has(k)) this.expanded.delete(k);
    if (this.selected !== undefined && !next.nodes.has(this.selected)) this.selected = undefined;
    this.fixFocus();
    this.changed();
  }

  // --- Expansion and lazy loading --------------------------------------------------------------
  autoLoadAfterOf(key: string): number | null | undefined {
    if (this.autoLoadAfter.has(key)) return this.autoLoadAfter.get(key);
    const own = number(nodeField(this.index, key, "autoLoadAfter"));
    return own ?? number(this.props.autoLoadAfter);
  }

  async expand(key: string): Promise<void> {
    if (!this.exists(key) || this.expanded.has(key) || this.loadingState(key) === "loading") return;
    this.expanded.add(key);
    const now = Date.now();
    this.expandedAt.set(key, now);
    this.changed();
    void this.props.onNodeDidExpand?.(this.view(key));
    if (!this.dynamic(key)) return;
    const state = this.loadingState(key);
    const threshold = this.autoLoadAfterOf(key);
    const collapsed = this.collapsedAt.get(key);
    const stale = state === "loaded" && typeof threshold === "number" && collapsed !== undefined && now - collapsed >= threshold;
    if (state === "unloaded" || stale) await this.loadChildren(key);
  }

  collapse(key: string): void {
    if (!this.expanded.has(key)) return;
    this.expanded.delete(key);
    this.collapsedAt.set(key, Date.now());
    this.fixFocus();
    this.changed();
    void this.props.onNodeDidCollapse?.(this.view(key));
  }

  toggle(key: string): void {
    if (this.expanded.has(key)) this.collapse(key);
    else void this.expand(key);
  }

  /** loadChildren: the node shows empty and loading; the handler's result becomes its children (XMLUI TreeReact.tsx 1958–2050). */
  async loadChildren(key: string): Promise<void> {
    const handler = this.props.onLoadChildren;
    if (typeof handler !== "function" || !this.exists(key)) return;
    const seq = ++this.loadSeq;
    this.loads.set(key, seq);
    this.loading.set(key, "loading");
    this.index = setChildren(this.index, key, []);
    this.changed();
    let result: unknown;
    try {
      result = await handler({ ...this.view(key), isExpanded: true });
    } catch (error) {
      if (this.loads.get(key) !== seq) return;
      this.loads.delete(key);
      this.loading.set(key, "unloaded");
      this.expanded.delete(key);
      this.changed();
      reportRuntimeError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (this.loads.get(key) !== seq || !this.exists(key)) return;
    this.loads.delete(key);
    this.index = setChildren(this.index, key, Array.isArray(result) ? result : []);
    this.loading.set(key, "loaded");
    if (this.pending.length > 0) {
      const now = this.pending.filter(([id]) => this.index.nodes.has(id));
      this.pending = this.pending.filter(([id]) => !this.index.nodes.has(id));
      this.applyEntries(now);
    }
    this.changed();
  }

  markLoaded(key: string): void {
    if (!this.exists(key)) return;
    this.loading.set(key, "loaded");
    this.changed();
  }

  /** markNodeUnloaded: it collapses, and loads again when expanded. */
  markUnloaded(key: string): void {
    if (!this.exists(key)) return;
    this.loads.delete(key);
    this.loading.set(key, "unloaded");
    this.expanded.delete(key);
    this.fixFocus();
    this.changed();
  }

  // --- Selection and focus ----------------------------------------------------------------------
  select(key: string | undefined, fire = true): void {
    if (key !== undefined && (!this.exists(key) || !isSelectableNode(this.index, key))) return;
    if (key === this.selected) return;
    const previous = this.selected;
    this.selected = key;
    this.notify();
    if (fire) void this.props.onSelectionDidChange?.({ newNode: this.view(key), previousNode: this.view(previous) });
  }

  focus(key: string | null): void {
    if (key === this.focused) return;
    this.focused = key;
    this.notify();
  }
}

/** The same fields; arrays (children, parentIds, path) compared by their elements. */
function sameView(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    if (Object.is(x, y)) return true;
    return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
  });
}

/** headless-tree's expansion goes to the store (loading, events), and reads it from there. */
function storeFeature(store: TreeStore): FeatureImplementation<TreeNode> {
  return {
    key: "gfui-store",
    itemInstance: {
      expand: ({ itemId }) => void store.expand(itemId),
      collapse: ({ itemId }) => store.collapse(itemId),
      isExpanded: ({ itemId }) => store.expanded.has(itemId),
    },
  };
}

const PLACEHOLDER: TreeNode = Object.freeze({ key: "", id: undefined, item: Object.freeze({}) });

/** Whether the Tree has a height of its own (it scrolls itself); otherwise it scrolls with its container. */
function hasOwnHeight(props: TreeProps): boolean {
  if (props.overflow !== undefined && props.overflow !== "auto" && props.overflow !== "scroll") return false;
  const from = props.$$layoutFrom;
  const set = (name: string) => {
    const value = from?.[name] ?? props[name];
    return value !== undefined && value !== null && value !== "";
  };
  return set("height") || set("maxHeight");
}

const SCROLL_STYLES = new Set(["overlay", "whenMouseOver", "whenScrolling"]);

function TreeView(props: TreeProps) {
  const layout = useLayout(props);
  const scope = useMultipleScope();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [store] = useState(() => new TreeStore());
  store.notify = rerender;
  store.sync(props);

  // --- headless-tree, mounted during render so the server render has the rows too -------------------
  const scrollRef = useRef<(key: string, align: ScrollAlign) => void>(() => undefined);
  const [tree] = useState<TreeInstance<TreeNode>>(() => {
    const t = createTree<TreeNode>({
      rootItemId: TREE_ROOT,
      dataLoader: {
        getItem: (key) => store.index.nodes.get(key) ?? PLACEHOLDER,
        getChildren: (key) => [...childKeys(store.index, key)],
      },
      getItemName: (item) => nodeName(store.index, item.getId()),
      isItemFolder: (item) => store.isFolder(item.getId()),
      initialState: { expandedItems: [], focusedItem: null },
      setState: () => undefined,
      setExpandedItems: () => undefined,
      setFocusedItem: (update) => {
        if (store.syncing) return;
        const next = typeof update === "function" ? update(store.focused) : update;
        store.focus(next);
      },
      scrollToItem: (item) => scrollRef.current(item.getId(), "auto"),
      ignoreHotkeysOnInputs: true,
      features: [syncDataLoaderFeature, hotkeysCoreFeature, storeFeature(store)],
    });
    t.setMounted(true);
    return t;
  });
  const built = useRef(-1);
  if (built.current !== store.structure) {
    built.current = store.structure;
    store.syncing = true;
    tree.applySubStateUpdate("expandedItems", [...store.expanded]);
    tree.applySubStateUpdate("focusedItem", store.focused);
    tree.rebuildTree();
    store.syncing = false;
  } else if (tree.getState().focusedItem !== store.focused) {
    store.syncing = true;
    tree.applySubStateUpdate("focusedItem", store.focused);
    store.syncing = false;
  }
  const items = tree.getItems();
  const keys = useMemo(() => items.map((item) => item.getId()), [items]);

  // --- The rows on the shared virtualizer ---------------------------------------------------------
  const own = hasOwnHeight(props);
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const itemHeight = number(props.itemHeight) ?? 32;
  const fixed = isTrue(props.fixedItemSize);
  const [fixedSize, setFixedSize] = useState<number | undefined>(undefined);
  const estimate = fixed && fixedSize !== undefined ? fixedSize : itemHeight;
  const view = useVirtualRows({ keys, own, root, content, estimate, overscan: 4, cacheSize: 0, pinned: store.focused ?? undefined });
  const { virtualizer, virtual, margin } = view;
  useEffect(() => {
    if (fixedSize !== undefined) virtualizer.measure();
  }, [fixedSize, virtualizer]);
  useLayoutEffect(() => {
    if (!fixed || fixedSize !== undefined || !virtual) return;
    const height = root.current?.querySelector<HTMLElement>('[data-index="0"]')?.getBoundingClientRect().height ?? 0;
    if (height > 0) setFixedSize(height);
  });
  // After the commit: lazy loads a restored state asked for, and repeated ids.
  useEffect(() => {
    const keysToLoad = store.toLoad.splice(0);
    for (const k of keysToLoad) void store.loadChildren(k);
    if (store.duplicates.length > 0) {
      reportRuntimeError(new Error(`Tree: the ids must be unique; repeated: ${store.duplicates.slice(0, 5).join(", ")}`));
      store.duplicates = [];
    }
  });
  const keyIndex = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);

  const live = useRef({ keys, keyIndex, virtual, virtualizer, margin, own });
  live.current = { keys, keyIndex, virtual, virtualizer, margin, own };
  const scrollToKey = (key: string, align: ScrollAlign, ifNeeded = false) => {
    const l = live.current;
    const index = l.keyIndex.get(key);
    if (index === undefined) return;
    if (l.virtual) {
      if (ifNeeded) {
        const range = l.virtualizer.range;
        if (range && index >= range.startIndex && index <= range.endIndex) return;
      }
      l.virtualizer.scrollToIndex(index, { align });
    } else {
      root.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: align === "auto" ? "nearest" : align });
    }
  };
  scrollRef.current = scrollToKey;
  // Scrolls asked for while rendering (a selection, scrollIntoView, an insert), once the rows exist.
  useLayoutEffect(() => {
    if (store.scrollTop !== undefined && virtual) {
      const top = store.scrollTop;
      store.scrollTop = undefined;
      virtualizer.scrollToOffset(top + (own ? 0 : margin));
    }
    const next = store.scrollTo;
    if (next && (virtual || typeof ResizeObserver === "undefined")) {
      store.scrollTo = undefined;
      scrollToKey(next.key, next.align, next.ifNeeded);
    }
  });

  // --- The API (all of XMLUI's, decision E; also the thirteen its metadata hides) ----------------------
  const api = useMemo(() => {
    const key = (id: unknown) => (id === undefined || id === null ? undefined : String(id));
    const known = (id: unknown) => {
      const k = key(id);
      return store.exists(k) ? k : undefined;
    };
    const scrollPosition = () => {
      const l = live.current;
      return l.virtual ? Math.max(0, (l.virtualizer.scrollOffset ?? 0) - (l.own ? 0 : l.margin)) : 0;
    };
    return {
      expandAll: () => {
        store.expanded = new Set([...store.index.nodes.keys()].filter((k) => store.isFolder(k) && store.loadingState(k) !== "unloaded"));
        store.changed();
      },
      collapseAll: () => {
        store.expanded = new Set();
        store.fixFocus();
        store.changed();
      },
      expandToLevel: (level: unknown) => {
        store.expanded = new Set(keysToLevel(store.index, Math.max(0, Math.trunc(Number(level) || 0))));
        store.changed();
      },
      expandNode: async (id: unknown) => {
        const k = known(id);
        if (k !== undefined) await store.expand(k);
      },
      collapseNode: (id: unknown) => {
        const k = known(id);
        if (k !== undefined) store.collapse(k);
      },
      selectNode: (id: unknown) => store.select(known(id)),
      selectNodeByIndex: (index: unknown) => store.select(Number.isInteger(Number(index)) ? live.current.keys[Number(index)] : undefined),
      clearSelection: () => store.select(undefined),
      getNodeById: (id: unknown) => store.view(known(id)),
      getExpandedNodes: () => [...store.expanded].map((k) => store.index.nodes.get(k)!.id),
      getSelectedNode: () => store.view(store.selected),
      scrollIntoView: (id: unknown, options?: { block?: unknown }) => {
        const k = known(id);
        if (k === undefined) return;
        const closed = ancestors(store.index, k).filter((a) => !store.expanded.has(a));
        for (const a of closed) store.expanded.add(a);
        const block = options?.block;
        store.scrollTo = { key: k, align: block === "start" || block === "end" || block === "center" ? block : "center" };
        if (closed.length > 0) store.changed();
        else store.notify();
      },
      scrollToItem: (id: unknown) => {
        const k = known(id);
        if (k !== undefined) scrollToKey(k, "center");
      },
      getVisibleItems: () => {
        const l = live.current;
        const range = l.virtual ? l.virtualizer.range : null;
        const [from, to] = range ? [range.startIndex, range.endIndex] : [view.staticStart, view.staticEnd - 1];
        const out: unknown[] = [];
        for (let i = Math.max(0, from); i <= to && i < l.keys.length; i++) out.push(store.view(l.keys[i]));
        return out;
      },
      getTreeState: () =>
        getTreeState({
          index: store.index,
          expanded: store.expanded,
          isFolder: (k) => store.isFolder(k),
          loading: new Map([...store.index.nodes.keys()].filter((k) => store.dynamic(k)).map((k) => [k, store.loadingState(k)])),
          selected: store.selected,
          expandedAt: store.expandedAt,
          collapsedAt: store.collapsedAt,
          autoLoadAfter: store.autoLoadAfter,
          scrollPosition: scrollPosition(),
        }),
      setTreeState: (state: unknown) => store.setTreeState(state),
      preserveStateOnNextDataRefresh: (options?: RefreshOptions) => {
        store.preserveNext = options !== null && typeof options === "object" ? options : {};
      },
      appendNode: (parentId: unknown, item: unknown) => {
        const parent = parentId === undefined || parentId === null ? null : known(parentId);
        if (parentId !== undefined && parentId !== null && parent === undefined) return;
        store.edit(appendNode(store.index, parent ?? null, item));
      },
      removeNode: (id: unknown) => {
        const k = known(id);
        if (k !== undefined) store.edit(removeNode(store.index, k));
      },
      removeChildren: (id: unknown) => {
        const k = known(id);
        if (k !== undefined) store.edit(removeChildren(store.index, k));
      },
      insertNodeBefore: (id: unknown, item: unknown) => {
        const k = known(id);
        if (k !== undefined) store.edit(insertSibling(store.index, k, item, false));
      },
      insertNodeAfter: (id: unknown, item: unknown) => {
        const k = known(id);
        if (k !== undefined) store.edit(insertSibling(store.index, k, item, true));
      },
      replaceNode: (id: unknown, item: unknown) => {
        const k = known(id);
        if (k !== undefined) store.edit(replaceNode(store.index, k, item));
      },
      replaceChildren: (id: unknown, items: unknown) => {
        const k = known(id);
        if (k !== undefined) store.edit(setChildren(store.index, k, Array.isArray(items) ? items : []));
      },
      getNodeLoadingState: (id: unknown) => {
        const k = known(id);
        return k === undefined ? undefined : store.loadingState(k);
      },
      markNodeLoaded: (id: unknown) => {
        const k = known(id);
        if (k !== undefined) store.markLoaded(k);
      },
      markNodeUnloaded: (id: unknown) => {
        const k = known(id);
        if (k !== undefined) store.markUnloaded(k);
      },
      getExpandedTimestamp: (id: unknown) => {
        const k = known(id);
        return k === undefined ? undefined : store.expandedAt.get(k);
      },
      setAutoLoadAfter: (id: unknown, ms: unknown) => {
        const k = known(id);
        if (k === undefined) return;
        const value = number(ms);
        if (value === undefined) store.autoLoadAfter.delete(k);
        else store.autoLoadAfter.set(k, value);
      },
      getNodeAutoLoadAfter: (id: unknown) => {
        const k = known(id);
        return k === undefined ? undefined : store.autoLoadAfterOf(k);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  useComponentApi(props.registerApi, api);

  // --- Keys: headless-tree moves the focus (arrows, Home, End); Enter, Space and the actions are ours -------
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).getAttribute?.("role") !== "treeitem") return;
    const key = store.focused ?? keys[0];
    if (key === undefined) return;
    const actions: [keyof typeof DEFAULT_KEY_BINDINGS, Handler][] = [
      ["cut", props.onCutAction],
      ["copy", props.onCopyAction],
      ["paste", props.onPasteAction],
      ["delete", props.onDeleteAction],
    ];
    for (const [action, handler] of actions) {
      if (!handler || !matchesKeyBinding(DEFAULT_KEY_BINDINGS[action], event)) continue;
      event.preventDefault();
      void handler(store.view(key));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      store.focus(key);
      store.select(key);
      if (event.key === "Enter" && store.isFolder(key) && store.loadingState(key) !== "loading") store.toggle(key);
    }
  };

  // --- Rendering ---------------------------------------------------------------------------------
  const measureRef = useRef<((el: HTMLElement | null) => void) | undefined>(undefined);
  measureRef.current = !virtual || fixed ? undefined : virtualizer.measureElement;
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const rowRef = (key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (el) => {
        tree.getItemInstance(key).registerElement(el);
        measureRef.current?.(el);
      };
      refs.current.set(key, ref);
    }
    return ref;
  };

  const iconSize = props.iconSize ?? "16";
  const rotation = number(props.expandRotation) ?? 90;
  const animate = isTrue(props.animateExpand);
  const spinnerDelay = Math.max(0, number(props.spinnerDelay) ?? 0);
  const clickExpands = isTrue(props.itemClickExpands);

  const renderRow = (key: string, index: number, style: CSSProperties | undefined) => {
    const item = tree.getItemInstance(key);
    const node = store.view(key)!;
    if (!node) return null;
    const expanded = store.expanded.has(key);
    const folder = store.isFolder(key);
    const loading = store.loadingState(key) === "loading";
    const selected = store.selected === key;
    const selectable = isSelectableNode(store.index, key);
    const { ref: _ref, onClick: _onClick, ...aria } = item.getProps() as Record<string, unknown>;
    const toggleIcon = String(
      animate
        ? (node.iconCollapsed ?? props.iconCollapsed ?? "chevronright")
        : expanded
          ? (node.iconExpanded ?? props.iconExpanded ?? "chevrondown")
          : (node.iconCollapsed ?? props.iconCollapsed ?? "chevronright"),
    );
    return (
      <div
        key={key}
        {...aria}
        ref={rowRef(key)}
        className="gfui-Tree-row"
        data-index={index}
        data-selected={selected ? "" : undefined}
        data-focused={item.isFocused() ? "" : undefined}
        data-selectable={selectable ? "" : undefined}
        aria-selected={selected}
        aria-busy={loading || undefined}
        style={style}
        onContextMenu={(event) => {
          event.preventDefault();
          store.focus(key);
          if (selectable) store.select(key);
          void props.onContextMenu?.(pointerData(event), node);
        }}
      >
        <div
          className="gfui-Tree-gutter"
          style={{ "--gfui-Tree-depth": node.depth } as CSSProperties}
          onMouseDown={() => store.focus(key)}
          onClick={(event) => {
            event.stopPropagation();
            if (folder && !loading) store.toggle(key);
          }}
        >
          <span className="gfui-Tree-toggle" data-hidden={folder ? undefined : ""}>
            {folder ? (
              <TreeToggle loading={loading} delay={spinnerDelay} icon={toggleIcon} size={iconSize} rotate={animate && expanded ? rotation : undefined} />
            ) : null}
          </span>
        </div>
        <div
          className="gfui-Tree-label"
          onMouseDown={() => {
            store.focus(key);
            if (selectable) store.select(key);
          }}
          onClick={() => {
            if (clickExpands && folder && !loading) store.toggle(key);
          }}
        >
          {props.itemTemplate ? (
            props.itemTemplate({ $item: node }, key)
          ) : (
            <span className="gfui-Tree-default">
              {node.icon ? <Icon name={node.icon} /> : null}
              <span>{String(node.name)}</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  let body: ReactNode;
  if (virtual) {
    body = virtualizer.getVirtualItems().map((v) => renderRow(keys[v.index]!, v.index, { transform: `translateY(${v.start - margin}px)` }));
  } else {
    body = keys.slice(view.staticStart, view.staticEnd).map((key, i) => renderRow(key, view.staticStart + i, undefined));
  }

  // Fades (showScrollerFade with a scroll style): where there is more to scroll.
  const styled = SCROLL_STYLES.has(String(props.scrollStyle));
  const fade = styled && isTrue(props.showScrollerFade) && own;
  const [edges, setEdges] = useState({ top: true, bottom: true });
  const updateEdges = () => {
    const el = root.current;
    if (!el || !fade) return;
    const top = el.scrollTop <= 1;
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setEdges((old) => (old.top === top && old.bottom === bottom ? old : { top, bottom }));
  };
  useLayoutEffect(updateEdges);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  const onScroll = () => {
    updateEdges();
    if (props.scrollStyle !== "whenScrolling") return;
    setScrolling(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrolling(false), 400);
  };

  const [setRoot] = useState(() => (el: HTMLDivElement | null) => {
    root.current = el;
    tree.registerElement(el);
  });
  return (
    <div
      className="gfui-Tree"
      data-scroll={own ? "own" : "outside"}
      data-fade-top={fade && !edges.top ? "" : undefined}
      data-fade-bottom={fade && !edges.bottom ? "" : undefined}
      {...layout.attributes}
      style={{ ...layout.style, "--gfui-Tree-row-height": `${itemHeight}px` } as CSSProperties}
    >
      <div
        ref={setRoot}
        role="tree"
        aria-label="Tree navigation"
        aria-multiselectable={false}
        className="gfui-Tree-scroll"
        data-scroll-style={styled ? String(props.scrollStyle) : undefined}
        data-scrolling={scrolling ? "" : undefined}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
      >
        <div ref={content} className="gfui-Tree-content" data-virtual={virtual ? "" : undefined} style={virtual ? { height: virtualizer.getTotalSize() } : undefined}>
          <LayoutScope value={scope}>{body}</LayoutScope>
        </div>
      </div>
    </div>
  );
}

/** The expand icon; while loading, after `spinnerDelay`, a spinner (XMLUI TreeReact.tsx 96–117). */
function TreeToggle({ loading, delay, icon, size, rotate }: { loading: boolean; delay: number; icon: string; size: unknown; rotate: number | undefined }) {
  const [spin, setSpin] = useState(loading && delay === 0);
  useEffect(() => {
    if (!loading) {
      setSpin(false);
      return undefined;
    }
    if (delay === 0) {
      setSpin(true);
      return undefined;
    }
    const timer = setTimeout(() => setSpin(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);
  if (loading && spin) return <Spinner delay={0} />;
  return (
    <span className="gfui-Tree-icon" data-rotated={rotate !== undefined ? "" : undefined} style={rotate !== undefined ? { transform: `rotate(${rotate}deg)` } : undefined}>
      <Icon name={icon} size={size} />
    </span>
  );
}
