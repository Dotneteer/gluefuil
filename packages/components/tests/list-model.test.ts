// Step 29: the List's row model and the selection rules as tables. jsdom isn't
// needed: both are pure (list-model.ts, selection.ts). XMLUI: ListReact.tsx
// 90–190, Table/useRowSelection.tsx 405–570. Design: .ai/plan/poc-29-list.md
import { describe, expect, test } from "vitest";
import { duplicateKeys, listModel, orderItems, type ListModelInput, type ListRow } from "../src/list-model";
import { EMPTY_SELECTION, keyTarget, pickRow, selectAllRows, selectKeys, type Modifiers, type SelectionState } from "../src/selection";
import { matchesKeyBinding } from "../src/list";

const people = [
  { id: 1, name: "Cy", dept: "ops", age: 30 },
  { id: 2, name: "Al", dept: "dev", age: 25 },
  { id: 3, name: "Bo", dept: "dev", age: null },
  { id: 4, name: "Di", dept: "ops", age: 25 },
];
/** Rows as short strings: an item's name, `[group]` headers, `/group` footers. */
const show = (rows: ListRow[]) =>
  rows.map((r) => (r.kind === "item" ? (r.item as { name: string }).name : r.kind === "header" ? `[${r.group.key}]` : `/${r.group.key}`));
const rowsOf = (input: Partial<ListModelInput>) => show(listModel({ data: people, ...input }).rows);

describe("ordering and limits", () => {
  test.each<[label: string, orderBy: unknown, expected: string[]]>([
    ["no orderBy keeps the data's order", undefined, ["Cy", "Al", "Bo", "Di"]],
    ["one field, ascending by default", { field: "name" }, ["Al", "Bo", "Cy", "Di"]],
    ["descending", { field: "name", direction: "desc" }, ["Di", "Cy", "Bo", "Al"]],
    ["null values last; ties keep their order", { field: "age" }, ["Al", "Di", "Cy", "Bo"]],
    ["several fields; descending puts null first (lodash, as XMLUI)", [{ field: "dept" }, { field: "age", direction: "desc" }], ["Bo", "Al", "Cy", "Di"]],
    ["a string is not an orderBy (XMLUI's docs: objects)", "name", ["Cy", "Al", "Bo", "Di"]],
  ])("%s", (_label, orderBy, expected) => {
    expect(rowsOf({ orderBy })).toEqual(expected);
  });

  test("a dotted field path", () => {
    expect(orderItems([{ a: { b: 2 } }, { a: { b: 1 } }], { field: "a.b" })).toEqual([{ a: { b: 1 } }, { a: { b: 2 } }]);
  });

  test.each<[limit: unknown, expected: number]>([
    [undefined, 4],
    [2, 2],
    ["3", 3],
    [0, 4],
    [10, 4],
  ])("limit %j shows %i items", (limit, expected) => {
    expect(listModel({ data: people, limit }).rows).toHaveLength(expected);
  });

  test("nullish items are dropped; data that isn't an array is no rows", () => {
    expect(show(listModel({ data: [null, people[0], undefined] }).rows)).toEqual(["Cy"]);
    expect(listModel({ data: "nope" }).rows).toEqual([]);
  });
});

describe("keys", () => {
  test("the idKey value, else the position; duplicates and empty ids are reported", () => {
    const data = [{ id: "a" }, { id: "a" }, { key: "x" }, { id: "" }];
    expect(listModel({ data }).rows.map((r) => r.key)).toEqual(["a", "$$index:1", "$$index:2", "$$index:3"]);
    expect(duplicateKeys(data, "id")).toEqual(["a", "(empty)"]);
    expect(listModel({ data, idKey: "key" }).rows.map((r) => r.key)).toEqual(["$$index:0", "$$index:1", "x", "$$index:3"]);
    expect(duplicateKeys(people, "id")).toEqual([]);
  });

  test("an item's index is its position among the shown items, in display order", () => {
    const model = listModel({ data: people, groupBy: "dept", hasHeader: true });
    expect(model.rows.filter((r) => r.kind === "item").map((r) => (r.kind === "item" ? r.index : -1))).toEqual([0, 1, 2, 3]);
    expect(model.items.map((i) => (i as { name: string }).name)).toEqual(["Cy", "Di", "Al", "Bo"]);
    expect(model.keys).toEqual(["1", "4", "2", "3"]);
  });
});

describe("groups", () => {
  test.each<[label: string, input: Partial<ListModelInput>, expected: string[]]>([
    ["by a field, in the order groups appear; header and footer rows", { groupBy: "dept", hasHeader: true, hasFooter: true }, ["[ops]", "Cy", "Di", "/ops", "[dev]", "Al", "Bo", "/dev"]],
    ["by a function", { groupBy: (p: { name: string }) => (p.name < "C" ? "A–B" : "C–D"), hasHeader: true }, ["[C–D]", "Cy", "Di", "[A–B]", "Al", "Bo"]],
    ["no header or footer template: no such rows", { groupBy: "dept" }, ["Cy", "Di", "Al", "Bo"]],
    ["ordered inside each group", { groupBy: "dept", orderBy: { field: "name" }, hasHeader: true }, ["[dev]", "Al", "Bo", "[ops]", "Cy", "Di"]],
    ["defaultGroups come first; an empty one is hidden by default", { groupBy: "dept", defaultGroups: ["qa", "dev"], hasHeader: true }, ["[dev]", "Al", "Bo", "[ops]", "Cy", "Di"]],
    ["hideEmptyGroups false shows an empty default group", { groupBy: "dept", defaultGroups: ["qa"], hideEmptyGroups: false, hasHeader: true }, ["[qa]", "[ops]", "Cy", "Di", "[dev]", "Al", "Bo"]],
    ["availableGroups filters and orders (decision 5)", { groupBy: "dept", availableGroups: ["dev"], hasHeader: true }, ["[dev]", "Al", "Bo"]],
    ["availableGroups with an empty group and hideEmptyGroups false", { groupBy: "dept", availableGroups: ["qa", "ops"], hideEmptyGroups: false, hasHeader: true }, ["[qa]", "[ops]", "Cy", "Di"]],
    ["folded groups keep their header only", { groupBy: "dept", expanded: { ops: false }, hasHeader: true, hasFooter: true }, ["[ops]", "[dev]", "Al", "Bo", "/dev"]],
    ["groupsInitiallyExpanded false; one unfolded", { groupBy: "dept", groupsInitiallyExpanded: false, expanded: { dev: true }, hasHeader: true }, ["[ops]", "[dev]", "Al", "Bo"]],
    ["without a header nothing folds", { groupBy: "dept", groupsInitiallyExpanded: false, hasFooter: true }, ["Cy", "Di", "/ops", "Al", "Bo", "/dev"]],
    ["limit applies before grouping", { groupBy: "dept", limit: 2, hasHeader: true }, ["[ops]", "Cy", "[dev]", "Al"]],
  ])("%s", (_label, input, expected) => {
    expect(rowsOf(input)).toEqual(expected);
  });

  test("a group row carries the group: key, id and its items", () => {
    const header = listModel({ data: people, groupBy: "dept", hasHeader: true }).rows[0]!;
    expect(header).toMatchObject({ kind: "header", key: "$$group:ops", group: { id: "ops", key: "ops", items: [people[0], people[3]] } });
  });
});

describe("selection", () => {
  const rows = ["a", "b", "c", "d", "e"];
  const multi = { multi: true };
  const state = (selected: string[], anchor?: string, focused = -1): SelectionState => ({ selected, anchor, focused });
  const after = (start: SelectionState, steps: [index: number, modifiers?: Modifiers][], options = multi) =>
    steps.reduce((s, [index, modifiers]) => pickRow(s, rows, index, modifiers ?? {}, options), start).selected;

  test.each<[label: string, steps: [number, Modifiers?][], expected: string[]]>([
    ["a click selects one row", [[1], [3]], ["d"]],
    ["Ctrl/Cmd adds and removes", [[1], [3, { ctrl: true }], [0, { meta: true }], [1, { ctrl: true }]], ["d", "a"]],
    ["a checkbox toggles", [[1, { toggle: true }], [2, { toggle: true }], [1, { toggle: true }]], ["c"]],
    ["Shift extends from the anchor", [[1], [3, { shift: true }]], ["b", "c", "d"]],
    ["Shift again replaces the extension", [[2], [4, { shift: true }], [0, { shift: true }]], ["a", "b", "c"]],
    ["Shift keeps a Ctrl selection elsewhere", [[0], [3, { ctrl: true }], [4, { shift: true }]], ["a", "d", "e"]],
  ])("%s", (_label, steps, expected) => {
    expect(after(EMPTY_SELECTION, steps)).toEqual(expected);
  });

  test("without multi, modifiers select one row; a checkbox on the selected row clears it", () => {
    expect(after(EMPTY_SELECTION, [[1], [3, { shift: true }]], { multi: false })).toEqual(["d"]);
    expect(after(EMPTY_SELECTION, [[1], [3, { ctrl: true }]], { multi: false })).toEqual(["d"]);
    expect(after(EMPTY_SELECTION, [[1, { toggle: true }], [1, { toggle: true }]], { multi: false })).toEqual([]);
  });

  test("unselectable rows: a click is ignored (the focus moves), a Shift range skips them", () => {
    const options = { multi: true, unselectable: (i: number) => i === 2 };
    expect(pickRow(state(["a"], "a", 0), rows, 2, {}, options)).toEqual(state(["a"], "a", 2));
    expect(after(EMPTY_SELECTION, [[1], [3, { shift: true }]], options)).toEqual(["b", "d"]);
    expect(selectAllRows(EMPTY_SELECTION, rows, options).selected).toEqual(["a", "b", "d", "e"]);
  });

  test("select all needs multi; selectKeys adds known ids (one without multi)", () => {
    expect(selectAllRows(EMPTY_SELECTION, rows, { multi: false })).toBe(EMPTY_SELECTION);
    expect(selectKeys(state(["a"]), rows, ["c", 4, "zz"], multi).selected).toEqual(["a", "c"]);
    expect(selectKeys(state(["a"]), rows, ["c", "d"], { multi: false }).selected).toEqual(["d"]);
    expect(selectKeys(state(["a"]), rows, ["zz"], multi).selected).toEqual(["a"]);
  });

  test.each<[key: string, focused: number, expected: number | undefined]>([
    ["ArrowDown", -1, 0],
    ["ArrowDown", 2, 3],
    ["ArrowDown", 4, 4],
    ["ArrowUp", -1, 0],
    ["ArrowUp", 3, 2],
    ["ArrowUp", 0, 0],
    ["PageDown", 0, 4],
    ["PageUp", 4, 0],
    ["Home", 3, 0],
    ["End", 0, 4],
    ["Enter", 1, undefined],
  ])("%s from %i moves to %j", (key, focused, expected) => {
    expect(keyTarget(key, focused, rows.length)).toBe(expected);
  });
});

describe("key bindings", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
  test.each<[binding: string, event: ReturnType<typeof key>, expected: boolean]>([
    ["CmdOrCtrl+A", key("a", { ctrlKey: true }), true],
    ["CmdOrCtrl+A", key("a", { metaKey: true }), true],
    ["CmdOrCtrl+A", key("a"), false],
    ["CmdOrCtrl+A", key("a", { ctrlKey: true, shiftKey: true }), false],
    ["Ctrl+Shift+X", key("X", { ctrlKey: true, shiftKey: true }), true],
    ["Ctrl+Shift+X", key("x", { metaKey: true, shiftKey: true }), false],
    ["Delete", key("Delete"), true],
    ["Del", key("Delete"), true],
    ["Delete", key("Backspace"), false],
    ["Alt+Space", key(" ", { altKey: true }), true],
    ["Hyper+A", key("a"), false],
  ])("%s on %j is %s", (binding, event, expected) => {
    expect(matchesKeyBinding(binding, event)).toBe(expected);
  });
});
