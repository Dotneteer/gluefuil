// Step 31: the Tree's model (tree-model.ts) and the TileGrid's key targets
// (selection.ts) as tables. Pure: no jsdom needed. XMLUI: components-core/utils/
// treeUtils.ts, Tree/TreeReact.tsx 363–397, TileGrid/TileGridReact.tsx 38–80.
// Design: .ai/plan/poc-31-tree-tilegrid.md
import { describe, expect, test } from "vitest";
import {
  allKeys,
  ancestors,
  appendNode,
  buildTreeIndex,
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
  visibleRows,
  type TreeIndex,
} from "../src/tree-model";
import { gridKeyTarget } from "../src/selection";

const flat = [
  { id: 1, name: "Root", parentId: null },
  { id: 2, name: "A", parentId: 1 },
  { id: 3, name: "B", parentId: 1 },
  { id: 4, name: "A1", parentId: 2 },
  { id: 5, name: "Other", parentId: undefined },
];
const nested = [
  { id: "r", name: "Root", children: [{ id: "a", name: "A", children: [{ id: "a1", name: "A1" }] }, { id: "b", name: "B" }] },
  { id: "o", name: "Other" },
];
/** The visible rows as `name@depth`. */
const show = (index: TreeIndex, expanded: string[] = allKeys(index)) => visibleRows(index, new Set(expanded)).map((r) => `${nodeName(index, r.key)}@${r.depth}`);

describe("building the index", () => {
  test.each<[label: string, index: () => TreeIndex, expected: string[]]>([
    ["flat: parent ids, roots by an empty parent", () => buildTreeIndex(flat, "flat"), ["Root@0", "A@1", "A1@2", "B@1", "Other@0"]],
    ["hierarchy: nested children", () => buildTreeIndex(nested, "hierarchy"), ["Root@0", "A@1", "A1@2", "B@1", "Other@0"]],
    ["hierarchy: one root object", () => buildTreeIndex({ id: 1, name: "Only", children: [{ id: 2, name: "Kid" }] }, "hierarchy"), ["Only@0", "Kid@1"]],
    ["flat: an item whose parent never appears is not shown (XMLUI)", () => buildTreeIndex([{ id: 1, name: "A" }, { id: 2, name: "B", parentId: 9 }], "flat"), ["A@0"]],
    ["flat: an empty string parent is a root", () => buildTreeIndex([{ id: 1, name: "A", parentId: "" }], "flat"), ["A@0"]],
    ["mapped fields", () => buildTreeIndex([{ uid: "x", label: "X", up: null }, { uid: "y", label: "Y", up: "x" }], "flat", treeFields({ id: "uid", name: "label", parentId: "up" })), ["X@0", "Y@1"]],
    ["the name falls back to the id", () => buildTreeIndex([{ id: 7 }], "flat"), ["7@0"]],
    ["not an array (flat) or nothing: no rows", () => buildTreeIndex("nope", "flat"), []],
    ["items without an id are skipped", () => buildTreeIndex([{ name: "no id" }, { id: 1, name: "A" }], "flat"), ["A@0"]],
  ])("%s", (_label, index, expected) => {
    expect(show(index())).toEqual(expected);
  });

  test("a repeated id: the first wins and it is reported", () => {
    const index = buildTreeIndex([{ id: 1, name: "A" }, { id: 1, name: "Again" }], "flat");
    expect(show(index)).toEqual(["A@0"]);
    expect(index.duplicates).toEqual(["1"]);
  });

  test("a cycle in nested data stops at the repeated id", () => {
    const loop: Record<string, unknown> = { id: "x", name: "X", children: [] };
    (loop.children as unknown[]).push(loop);
    expect(show(buildTreeIndex([loop], "hierarchy"))).toEqual(["X@0"]);
  });

  test("keys are strings; the source id keeps its type", () => {
    const index = buildTreeIndex(flat, "flat");
    expect(index.nodes.get("2")!.id).toBe(2);
    expect(ancestors(index, "4")).toEqual(["1", "2"]);
  });

  test("visible rows follow the expanded set", () => {
    const index = buildTreeIndex(flat, "flat");
    expect(show(index, [])).toEqual(["Root@0", "Other@0"]);
    expect(show(index, ["1"])).toEqual(["Root@0", "A@1", "B@1", "Other@0"]);
    expect(show(index, ["2"])).toEqual(["Root@0", "Other@0"]);
  });
});

describe("node fields", () => {
  const index = buildTreeIndex(
    [
      { id: 1, name: "plain" },
      { id: 2, name: "locked", selectable: false },
      { id: 3, name: "lazy", dynamic: true },
      { id: 4, name: "unloaded", loaded: false },
      { id: 5, name: "static", dynamic: false },
      { id: 6, name: "done", dynamic: true, loaded: true },
    ],
    "flat",
  );
  test.each<[key: string, selectable: boolean, dynamicOff: boolean, dynamicOn: boolean, loading: string]>([
    ["1", true, false, true, "loaded"],
    ["2", false, false, true, "loaded"],
    ["3", true, true, true, "unloaded"],
    ["4", true, true, true, "unloaded"],
    ["5", true, false, false, "loaded"],
    ["6", true, true, true, "loaded"],
  ])("node %s: selectable %s, dynamic %s (Tree dynamic off) / %s (on), %s", (key, selectable, off, on, loading) => {
    expect(isSelectableNode(index, key)).toBe(selectable);
    expect(isDynamicNode(index, key, false)).toBe(off);
    expect(isDynamicNode(index, key, true)).toBe(on);
    expect(initialLoadingState(index, key, isDynamicNode(index, key, false))).toBe(loading);
  });
});

describe("default expansion", () => {
  const index = buildTreeIndex(flat, "flat");
  test.each<[spec: unknown, expected: string[]]>([
    [undefined, []],
    ["none", []],
    ["first-level", ["1", "5"]],
    ["all", ["1", "2", "4", "3", "5"]],
    [[4], ["1", "2", "4"]],
    [["3", 99], ["1", "3"]],
  ])("%j", (spec, expected) => {
    expect(defaultExpandedKeys(index, parseDefaultExpansion(spec))).toEqual(expected);
  });

  test("nodes still to load are never opened by default", () => {
    expect(defaultExpandedKeys(index, "all", (k) => k === "2")).toEqual(["1", "4", "3", "5"]);
  });

  test.each<[level: number, expected: string[]]>([
    [0, []],
    [1, ["1", "5"]],
    [2, ["1", "2", "3", "5"]],
  ])("expandToLevel(%i)", (level, expected) => {
    expect(keysToLevel(index, level)).toEqual(expected);
  });
});

describe("edits make a new index (decision C)", () => {
  const base = buildTreeIndex(flat, "flat");

  test.each<[label: string, edit: (i: TreeIndex) => TreeIndex, expected: string[]]>([
    ["setChildren: replaces the subtree", (i) => setChildren(i, "2", [{ id: 10, name: "N" }]), ["Root@0", "A@1", "N@2", "B@1", "Other@0"]],
    ["setChildren: an empty array clears", (i) => setChildren(i, "1", []), ["Root@0", "Other@0"]],
    ["appendNode: a child at the end", (i) => appendNode(i, "1", { id: 11, name: "C" }), ["Root@0", "A@1", "A1@2", "B@1", "C@1", "Other@0"]],
    ["appendNode: a root (null)", (i) => appendNode(i, null, { id: 12, name: "Last" }), ["Root@0", "A@1", "A1@2", "B@1", "Other@0", "Last@0"]],
    ["insertNodeBefore", (i) => insertSibling(i, "3", { id: 13, name: "Pre" }, false), ["Root@0", "A@1", "A1@2", "Pre@1", "B@1", "Other@0"]],
    ["insertNodeAfter", (i) => insertSibling(i, "2", { id: 14, name: "Post" }, true), ["Root@0", "A@1", "A1@2", "Post@1", "B@1", "Other@0"]],
    ["removeNode: with its descendants", (i) => removeNode(i, "2"), ["Root@0", "B@1", "Other@0"]],
    ["removeChildren: keeps the node", (i) => removeChildren(i, "1"), ["Root@0", "Other@0"]],
    ["replaceNode: merges fields, keeps the id and children", (i) => replaceNode(i, "2", { id: 99, name: "A!" }), ["Root@0", "A!@1", "A1@2", "B@1", "Other@0"]],
    ["unknown keys change nothing", (i) => removeNode(appendNode(i, "nope", { id: 20 }), "nope"), ["Root@0", "A@1", "A1@2", "B@1", "Other@0"]],
  ])("%s", (_label, edit, expected) => {
    const next = edit(base);
    expect(show(next)).toEqual(expected);
    expect(show(base)).toEqual(["Root@0", "A@1", "A1@2", "B@1", "Other@0"]);
  });

  test("a loaded child's parent id keeps the parent's type (XMLUI makes it a string)", () => {
    const next = setChildren(base, "1", [{ id: 30, name: "kid", parentId: "whatever" }]);
    expect(next.nodes.get("30")!.item.parentId).toBe(1);
  });

  test("in hierarchy format loaded children may nest, and replaceNode can replace them", () => {
    const h = buildTreeIndex(nested, "hierarchy");
    expect(show(setChildren(h, "b", [{ id: "b1", name: "B1", children: [{ id: "b11", name: "B11" }] }]))).toEqual(["Root@0", "A@1", "A1@2", "B@1", "B1@2", "B11@3", "Other@0"]);
    expect(show(replaceNode(h, "a", { name: "A2", children: [{ id: "z", name: "Z" }] }))).toEqual(["Root@0", "A2@1", "Z@2", "B@1", "Other@0"]);
  });

  test("copyChildren carries a loaded subtree into new data (preserve-state)", () => {
    const loaded = setChildren(base, "5", [{ id: 40, name: "L" }]);
    const fresh = buildTreeIndex(flat, "flat");
    expect(show(copyChildren(fresh, loaded, "5"))).toEqual(["Root@0", "A@1", "A1@2", "B@1", "Other@0", "L@1"]);
  });

  test("the root's key is not a source id", () => {
    expect(base.children.get(TREE_ROOT)).toEqual(["1", "5"]);
  });
});

describe("tree state (XMLUI's TreeState)", () => {
  const index = buildTreeIndex(flat, "flat");
  const folders = new Set(["1", "2"]);
  const state = getTreeState({
    index,
    expanded: new Set(["1"]),
    isFolder: (k) => folders.has(k),
    loading: new Map([["5", "loaded" as const]]),
    selected: "3",
    expandedAt: new Map([["1", 100]]),
    collapsedAt: new Map(),
    autoLoadAfter: new Map([["5", 500]]),
    scrollPosition: 42,
  });

  test("folders, loading states, the selection and times; the scroll position", () => {
    expect(state).toEqual({
      1: { expanded: true, collapsed: false, expandedTimestamp: 100 },
      2: { expanded: false, collapsed: true },
      3: { selected: true },
      5: { loadingState: "loaded", loaded: true, autoLoadAfter: 500 },
      scrollPosition: 42,
    });
  });

  test("entries for nodes that exist now, and those that wait", () => {
    const { present, missing } = treeStateEntries({ ...state, 77: { expanded: true }, junk: 3 }, index);
    expect(present.map(([id]) => id)).toEqual(["1", "2", "3", "5"]);
    expect(missing.map(([id]) => id)).toEqual(["77"]);
    expect(stateScrollPosition(state)).toBe(42);
    expect(stateScrollPosition({})).toBeUndefined();
  });

  test.each<[entry: object, expanded: boolean | undefined, loading: string | undefined]>([
    [{ expanded: true }, true, undefined],
    [{ collapsed: true }, false, undefined],
    [{ loaded: true }, undefined, "loaded"],
    [{ loaded: false }, undefined, "unloaded"],
    [{ loadingState: "loading" }, undefined, "loading"],
    [{ loadingState: "bogus" }, undefined, undefined],
  ])("%j", (entry, expanded, loading) => {
    expect(entryExpanded(entry)).toBe(expanded);
    expect(entryLoadingState(entry)).toBe(loading);
  });
});

describe("TileGrid keys (gridKeyTarget)", () => {
  // 10 tiles in 4 columns: rows 0–3, 4–7, 8–9.
  test.each<[key: string, from: number, ctrl: boolean, expected: number | undefined]>([
    ["ArrowRight", -1, false, 0],
    ["ArrowRight", 3, false, 4],
    ["ArrowRight", 9, false, 9],
    ["ArrowLeft", 0, false, 0],
    ["ArrowDown", 1, false, 5],
    ["ArrowDown", 6, false, 6],
    ["ArrowUp", 5, false, 1],
    ["ArrowUp", 2, false, 2],
    ["Home", 6, false, 4],
    ["Home", 6, true, 0],
    ["End", 4, false, 7],
    ["End", 8, false, 9],
    ["End", 1, true, 9],
    ["PageDown", 0, false, 8],
    ["PageUp", 9, false, 1],
    ["a", 3, false, undefined],
  ])("%s from %i (ctrl %s) → %s", (key, from, ctrl, expected) => {
    expect(gridKeyTarget(key, from, 10, 4, 2, ctrl)).toBe(expected);
  });

  test("no tiles: no target", () => {
    expect(gridKeyTarget("ArrowDown", -1, 0, 4, 2, false)).toBeUndefined();
  });
});
