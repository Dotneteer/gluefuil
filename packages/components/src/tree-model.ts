// The Tree's data model (step 31, .ai/plan/poc-31-tree-tilegrid.md): React-free.
// XMLUI: xmlui/src/components-core/utils/treeUtils.ts (flatToNative,
// hierarchyToNative) and the helpers of xmlui/src/components/Tree/TreeReact.tsx.
//
//   buildTreeIndex   data (flat with parent ids, or nested) → an index of nodes
//   edits            new indexes: loaded children, the API's edits (decision C:
//                    the Tree's working copy; `data` itself is never changed)
//   defaultExpanded  none, first-level, all, or ids (their paths open)
//   tree state       XMLUI's TreeState: per node id, plus scrollPosition
//
// Nodes are keyed by `String(id)`; the source id keeps its type (`node.id`).
// headless-tree (decision A) reads the index through its data loader.

/** The parent key of the roots (no source id can be it). */
export const TREE_ROOT = "\u0000root";

export type TreeFormat = "flat" | "hierarchy";
export type LoadingState = "unloaded" | "loading" | "loaded";

/** The source fields a Tree reads (XMLUI's *Field props). */
export interface TreeFields {
  id: string;
  name: string;
  icon: string;
  iconExpanded: string;
  iconCollapsed: string;
  parentId: string;
  children: string;
  selectable: string;
  loaded: string;
  dynamic: string;
  autoLoadAfter: string;
}

export const DEFAULT_TREE_FIELDS: Readonly<TreeFields> = Object.freeze({
  id: "id",
  name: "name",
  icon: "icon",
  iconExpanded: "iconExpanded",
  iconCollapsed: "iconCollapsed",
  parentId: "parentId",
  children: "children",
  selectable: "selectable",
  loaded: "loaded",
  dynamic: "dynamic",
  autoLoadAfter: "autoLoadAfter",
});

type Item = Readonly<Record<string, unknown>>;

export interface TreeNode {
  /** `String(id)`. */
  readonly key: string;
  /** The source id, with its type. */
  readonly id: unknown;
  /** The source item (in hierarchy format, with its nested children as given). */
  readonly item: Item;
}

export interface TreeIndex {
  readonly format: TreeFormat;
  readonly fields: Readonly<TreeFields>;
  readonly nodes: ReadonlyMap<string, TreeNode>;
  /** Child keys by parent key; TREE_ROOT holds the roots. */
  readonly children: ReadonlyMap<string, readonly string[]>;
  /** Parent key by key (TREE_ROOT for a root). */
  readonly parent: ReadonlyMap<string, string>;
  /** Ids given more than once (the first wins). */
  readonly duplicates: readonly string[];
}

const isObject = (value: unknown): value is Item => value !== null && typeof value === "object" && !Array.isArray(value);
const noParent = (value: unknown) => value === undefined || value === null || value === "";

/** The fields: XMLUI's defaults, overridden by the *Field props that are set. */
export function treeFields(overrides: Partial<Record<keyof TreeFields, unknown>>): TreeFields {
  const fields = { ...DEFAULT_TREE_FIELDS };
  for (const name of Object.keys(fields) as (keyof TreeFields)[]) {
    const value = overrides[name];
    if (typeof value === "string" && value !== "") fields[name] = value;
  }
  return fields;
}

class IndexBuilder {
  readonly nodes = new Map<string, TreeNode>();
  readonly children = new Map<string, string[]>();
  readonly parent = new Map<string, string>();
  readonly duplicates: string[] = [];

  constructor(readonly format: TreeFormat, readonly fields: Readonly<TreeFields>) {}

  static from(index: TreeIndex): IndexBuilder {
    const b = new IndexBuilder(index.format, index.fields);
    for (const [k, v] of index.nodes) b.nodes.set(k, v);
    for (const [k, v] of index.children) b.children.set(k, [...v]);
    for (const [k, v] of index.parent) b.parent.set(k, v);
    return b;
  }

  /** Adds a node under a parent (at `position`, default the end); false for a missing or repeated id. */
  add(item: Item, parentKey: string, position?: number): string | undefined {
    const id = item[this.fields.id];
    if (id === undefined || id === null || id === "") return undefined;
    const key = String(id);
    if (this.nodes.has(key)) {
      this.duplicates.push(key);
      return undefined;
    }
    this.nodes.set(key, { key, id, item });
    this.parent.set(key, parentKey);
    let list = this.children.get(parentKey);
    if (!list) this.children.set(parentKey, (list = []));
    if (position === undefined || position >= list.length) list.push(key);
    else list.splice(Math.max(0, position), 0, key);
    return key;
  }

  /** Adds a nested item and its `children` (hierarchy format). */
  addNested(item: Item, parentKey: string, position?: number): string | undefined {
    const key = this.add(item, parentKey, position);
    if (key === undefined) return undefined;
    const kids = item[this.fields.children];
    if (Array.isArray(kids)) for (const child of kids) if (isObject(child)) this.addNested(child, key);
    return key;
  }

  /** Adds flat items: each under the node its parent id names (roots when it is empty). */
  addFlat(items: readonly Item[]): void {
    const byParent = new Map<string, Item[]>();
    const roots: Item[] = [];
    for (const item of items) {
      const parentId = item[this.fields.parentId];
      if (noParent(parentId)) roots.push(item);
      else {
        const parentKey = String(parentId);
        let list = byParent.get(parentKey);
        if (!list) byParent.set(parentKey, (list = []));
        list.push(item);
      }
    }
    // Depth-first from the roots: an item whose parent never appears is not shown (as XMLUI).
    const visit = (item: Item, parentKey: string) => {
      const key = this.add(item, parentKey);
      if (key === undefined) return;
      for (const child of byParent.get(key) ?? []) visit(child, key);
    };
    for (const root of roots) visit(root, TREE_ROOT);
  }

  /** Removes a node's descendants (and the node itself with `self`). */
  remove(key: string, self: boolean): void {
    const parentKey = this.parent.get(key);
    const drop = (k: string) => {
      for (const child of this.children.get(k) ?? []) drop(child);
      this.children.delete(k);
      if (k !== key || self) {
        this.nodes.delete(k);
        this.parent.delete(k);
      }
    };
    drop(key);
    if (self && parentKey !== undefined) {
      const siblings = this.children.get(parentKey);
      const i = siblings?.indexOf(key) ?? -1;
      if (i >= 0) siblings!.splice(i, 1);
    }
  }

  build(): TreeIndex {
    return { format: this.format, fields: this.fields, nodes: this.nodes, children: this.children, parent: this.parent, duplicates: this.duplicates };
  }
}

/** The index of `data`: a flat array with parent ids, or nested items (an array or one root object). */
export function buildTreeIndex(data: unknown, format: TreeFormat, fields: Readonly<TreeFields> = DEFAULT_TREE_FIELDS): TreeIndex {
  const b = new IndexBuilder(format, fields);
  if (format === "hierarchy") {
    const roots = Array.isArray(data) ? data : isObject(data) ? [data] : [];
    for (const root of roots) if (isObject(root)) b.addNested(root, TREE_ROOT);
  } else if (Array.isArray(data)) {
    b.addFlat(data.filter(isObject));
  }
  return b.build();
}

export const childKeys = (index: TreeIndex, key: string): readonly string[] => index.children.get(key) ?? [];

/** The keys from the root down to the node's parent. */
export function ancestors(index: TreeIndex, key: string): string[] {
  const path: string[] = [];
  for (let p = index.parent.get(key); p !== undefined && p !== TREE_ROOT; p = index.parent.get(p)) path.unshift(p);
  return path;
}

export const depthOf = (index: TreeIndex, key: string): number => ancestors(index, key).length;

/** Every key, depth-first in display order. */
export function allKeys(index: TreeIndex): string[] {
  const out: string[] = [];
  const walk = (k: string) => {
    for (const c of childKeys(index, k)) {
      out.push(c);
      walk(c);
    }
  };
  walk(TREE_ROOT);
  return out;
}

/** The visible keys (a node's children show when it is expanded), with their depths. */
export function visibleRows(index: TreeIndex, expanded: ReadonlySet<string>): { key: string; depth: number }[] {
  const out: { key: string; depth: number }[] = [];
  const walk = (k: string, depth: number) => {
    for (const c of childKeys(index, k)) {
      out.push({ key: c, depth });
      if (expanded.has(c)) walk(c, depth + 1);
    }
  };
  walk(TREE_ROOT, 0);
  return out;
}

// --- Node fields ----------------------------------------------------------------------

export const nodeField = (index: TreeIndex, key: string, field: keyof TreeFields): unknown => index.nodes.get(key)?.item[index.fields[field]];

/** The display name: the name field, else the id (XMLUI's displayName). */
export function nodeName(index: TreeIndex, key: string): string {
  const node = index.nodes.get(key);
  if (!node) return "";
  const name = node.item[index.fields.name];
  return name === undefined || name === null || name === "" ? String(node.id) : String(name);
}

/** Selectable unless the selectable field is false (XMLUI's `?? true`). */
export const isSelectableNode = (index: TreeIndex, key: string): boolean => index.nodes.has(key) && nodeField(index, key, "selectable") !== false;

/**
 * Loads its children through `loadChildren` (only with a handler): the node's
 * dynamic field, else `loaded: false`, else the Tree's `dynamic`.
 */
export function isDynamicNode(index: TreeIndex, key: string, dynamicDefault: boolean): boolean {
  const own = nodeField(index, key, "dynamic");
  if (typeof own === "boolean") return own;
  if (nodeField(index, key, "loaded") === false) return true;
  return dynamicDefault;
}

/** A dynamic node starts unloaded unless its loaded field is true; others are loaded. */
export const initialLoadingState = (index: TreeIndex, key: string, dynamic: boolean): LoadingState =>
  dynamic && nodeField(index, key, "loaded") !== true ? "unloaded" : "loaded";

// --- Default expansion (TreeReact.tsx 363–397) ----------------------------------------------

export type DefaultExpansion = "none" | "first-level" | "all" | readonly unknown[];

export function parseDefaultExpansion(value: unknown): DefaultExpansion {
  if (Array.isArray(value)) return value;
  if (value === "first-level" || value === "all") return value;
  return "none";
}

/** The keys `defaultExpanded` opens; never nodes still to be loaded (`unloaded`). */
export function defaultExpandedKeys(index: TreeIndex, spec: DefaultExpansion, isUnloaded: (key: string) => boolean = () => false): string[] {
  if (spec === "first-level") return childKeys(index, TREE_ROOT).filter((k) => !isUnloaded(k));
  if (spec === "all") return allKeys(index).filter((k) => !isUnloaded(k));
  if (Array.isArray(spec)) {
    const keys = new Set<string>();
    for (const id of spec) {
      const key = String(id);
      if (!index.nodes.has(key)) continue;
      for (const a of ancestors(index, key)) keys.add(a);
      keys.add(key);
    }
    return [...keys].filter((k) => !isUnloaded(k));
  }
  return [];
}

/** `expandToLevel(level)`: the nodes above that depth (1: the roots). */
export function keysToLevel(index: TreeIndex, level: number): string[] {
  const out: string[] = [];
  const walk = (k: string, depth: number) => {
    if (depth >= level) return;
    for (const c of childKeys(index, k)) {
      out.push(c);
      walk(c, depth + 1);
    }
  };
  walk(TREE_ROOT, 0);
  return out;
}

// --- Edits (decision C: they make a new index; `data` is never changed) ------------------------

/** The node's children replaced by `items` (source format; in flat format each becomes a direct child). */
export function setChildren(index: TreeIndex, key: string, items: unknown): TreeIndex {
  if (key !== TREE_ROOT && !index.nodes.has(key)) return index;
  const b = IndexBuilder.from(index);
  b.remove(key, false);
  b.children.set(key, []);
  insertItems(b, index, key, undefined, items);
  return b.build();
}

/** Items in the source format under a parent, from a position on. */
function insertItems(b: IndexBuilder, index: TreeIndex, parentKey: string, position: number | undefined, items: unknown): void {
  const list = (Array.isArray(items) ? items : [items]).filter(isObject);
  let at = position;
  for (const raw of list) {
    // In flat format the parent id points at the new parent, with its source type (XMLUI makes it a string).
    const item = index.format === "flat" ? { ...raw, [index.fields.parentId]: parentKey === TREE_ROOT ? null : index.nodes.get(parentKey)!.id } : raw;
    const added = index.format === "hierarchy" ? b.addNested(item, parentKey, at) : b.add(item, parentKey, at);
    if (added !== undefined && at !== undefined) at++;
  }
}

/** `appendNode(parentId, item)`: the last child of a node, or a root (null). */
export function appendNode(index: TreeIndex, parentKey: string | null, item: unknown): TreeIndex {
  const parent = parentKey ?? TREE_ROOT;
  if (parent !== TREE_ROOT && !index.nodes.has(parent)) return index;
  const b = IndexBuilder.from(index);
  insertItems(b, index, parent, undefined, item);
  return b.build();
}

/** `insertNodeBefore` / `insertNodeAfter`: a sibling of an existing node. */
export function insertSibling(index: TreeIndex, siblingKey: string, item: unknown, after: boolean): TreeIndex {
  const parent = index.parent.get(siblingKey);
  if (parent === undefined) return index;
  const b = IndexBuilder.from(index);
  const position = childKeys(index, parent).indexOf(siblingKey) + (after ? 1 : 0);
  insertItems(b, index, parent, position, item);
  return b.build();
}

/** `removeNode`: the node and its descendants. */
export function removeNode(index: TreeIndex, key: string): TreeIndex {
  if (!index.nodes.has(key)) return index;
  const b = IndexBuilder.from(index);
  b.remove(key, true);
  return b.build();
}

/** `removeChildren`: the node's descendants. */
export function removeChildren(index: TreeIndex, key: string): TreeIndex {
  if (!index.nodes.has(key) || childKeys(index, key).length === 0) return index;
  const b = IndexBuilder.from(index);
  b.remove(key, false);
  return b.build();
}

/** `replaceNode`: the fields merged into the node (its id stays); children replaced only when given. */
export function replaceNode(index: TreeIndex, key: string, patch: unknown): TreeIndex {
  const node = index.nodes.get(key);
  if (!node || !isObject(patch)) return index;
  const { [index.fields.id]: _ignored, ...fields } = patch;
  const b = IndexBuilder.from(index);
  b.nodes.set(key, { ...node, item: { ...node.item, ...fields } });
  const replaced = b.build();
  const kids = patch[index.fields.children];
  return index.format === "hierarchy" && Array.isArray(kids) ? setChildren(replaced, key, kids) : replaced;
}

/** The subtree under `key` in `from` copied into `to` (preserve-state keeps loaded children). */
export function copyChildren(to: TreeIndex, from: TreeIndex, key: string): TreeIndex {
  if (!to.nodes.has(key)) return to;
  const b = IndexBuilder.from(to);
  const copy = (k: string) => {
    for (const c of childKeys(from, k)) {
      const node = from.nodes.get(c);
      if (!node || b.nodes.has(c)) continue;
      b.nodes.set(c, node);
      b.parent.set(c, k);
      let list = b.children.get(k);
      if (!list) b.children.set(k, (list = []));
      list.push(c);
      copy(c);
    }
  };
  copy(key);
  return b.build();
}

// --- Tree state (XMLUI's TreeState: components-core/abstractions/treeAbstractions.ts 68–82) ------

export interface TreeItemState {
  expanded?: boolean;
  collapsed?: boolean;
  loaded?: boolean;
  loadingState?: LoadingState;
  selected?: boolean;
  expandedTimestamp?: number;
  collapsedTimestamp?: number;
  autoLoadAfter?: number | null;
}

export type TreeState = { [id: string]: TreeItemState | number | undefined; scrollPosition?: number };

export interface TreeStateInput {
  index: TreeIndex;
  expanded: ReadonlySet<string>;
  isFolder: (key: string) => boolean;
  loading: ReadonlyMap<string, LoadingState>;
  selected?: string;
  expandedAt: ReadonlyMap<string, number>;
  collapsedAt: ReadonlyMap<string, number>;
  autoLoadAfter: ReadonlyMap<string, number | null>;
  scrollPosition: number;
}

/** The state of every node with any: folders (expanded or not), loaded or loading nodes, the selection, the times. */
export function getTreeState(input: TreeStateInput): TreeState {
  const state: TreeState = {};
  for (const key of input.index.nodes.keys()) {
    const entry: TreeItemState = {};
    if (input.isFolder(key) || input.expanded.has(key)) {
      entry.expanded = input.expanded.has(key);
      entry.collapsed = !entry.expanded;
    }
    const loading = input.loading.get(key);
    if (loading !== undefined) {
      entry.loadingState = loading;
      entry.loaded = loading === "loaded";
    }
    if (input.selected === key) entry.selected = true;
    const expandedAt = input.expandedAt.get(key);
    if (expandedAt !== undefined) entry.expandedTimestamp = expandedAt;
    const collapsedAt = input.collapsedAt.get(key);
    if (collapsedAt !== undefined) entry.collapsedTimestamp = collapsedAt;
    if (input.autoLoadAfter.has(key)) entry.autoLoadAfter = input.autoLoadAfter.get(key)!;
    if (Object.keys(entry).length > 0) state[key] = entry;
  }
  state.scrollPosition = input.scrollPosition;
  return state;
}

/** A saved state's entries split by whether their node exists now (the rest wait for it). */
export function treeStateEntries(state: unknown, index: TreeIndex): { present: [string, TreeItemState][]; missing: [string, TreeItemState][] } {
  const present: [string, TreeItemState][] = [];
  const missing: [string, TreeItemState][] = [];
  if (!isObject(state)) return { present, missing };
  for (const [id, entry] of Object.entries(state)) {
    if (id === "scrollPosition" || !isObject(entry)) continue;
    (index.nodes.has(id) ? present : missing).push([id, entry as TreeItemState]);
  }
  return { present, missing };
}

export const entryExpanded = (entry: TreeItemState): boolean | undefined =>
  typeof entry.expanded === "boolean" ? entry.expanded : typeof entry.collapsed === "boolean" ? !entry.collapsed : undefined;

export function entryLoadingState(entry: TreeItemState): LoadingState | undefined {
  if (entry.loadingState === "unloaded" || entry.loadingState === "loading" || entry.loadingState === "loaded") return entry.loadingState;
  if (typeof entry.loaded === "boolean") return entry.loaded ? "loaded" : "unloaded";
  return undefined;
}

export function stateScrollPosition(state: unknown): number | undefined {
  const value = isObject(state) ? state.scrollPosition : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
