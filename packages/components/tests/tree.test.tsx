// Step 31 in jsdom: Tree, TileGrid and Items through markup. jsdom has no layout,
// so Tree and TileGrid stay in their static windows (also what the prerender
// shows). Scrolling, measuring and resizing are E2E tests (e2e/tree.spec.ts).
// Design: .ai/plan/poc-31-tree-tilegrid.md
import { compileModule } from "@gluefuil/compiler";
import { loadModule, resetRouter, setErrorReporter } from "@gluefuil/runtime";
import { renderStatic } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as components from "../src/index";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  restore = setErrorReporter((error) => errors.push(error));
});
afterEach(() => {
  cleanup();
  restore();
  resetRouter();
});

function compiled(markup: string): ComponentType {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics.filter((d) => d.severity !== "warning")).toEqual([]);
  return loadModule(code, { components }) as ComponentType;
}
const show = (markup: string) => render(<>{(() => { const Main = compiled(markup); return <Main />; })()}</>);
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const rows = (scope: ParentNode = document) => [...scope.querySelectorAll(".gfui-Tree-row")].map((r) => r.textContent);
const row = (name: string) => [...document.querySelectorAll<HTMLElement>(".gfui-Tree-row")].find((r) => r.textContent === name)!;
const toggle = (name: string) => act(async () => fireEvent.click(row(name).querySelector(".gfui-Tree-gutter")!));
const pick = (name: string) => act(async () => fireEvent.mouseDown(row(name).querySelector(".gfui-Tree-label")!));
const click = (label: string) => act(async () => fireEvent.click(screen.getByRole("button", { name: label })));
/** headless-tree tracks pressed keys until keyup, as a browser sends it. */
const press = async (target: Element, key: string, init: object = {}) => {
  await act(async () => {
    fireEvent.keyDown(target, { key, ...init });
    fireEvent.keyUp(target, { key, ...init });
  });
  await settle(20);
};
const log = () => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith("log:"))?.textContent?.slice(4);

const FLAT = `[
  { id: 1, name: 'Docs', parentId: null },
  { id: 2, name: 'Reports', parentId: 1 },
  { id: 3, name: 'Q1', parentId: 2 },
  { id: 4, name: 'Invoices', parentId: 1 },
  { id: 5, name: 'Media', parentId: null, icon: 'folder' }
]`;

describe("Tree: data, rows and templates", () => {
  test("flat data; defaultExpanded all; tree items with their level, position and state", () => {
    show(`<App><Tree data="{${FLAT}}" defaultExpanded="all"/></App>`);
    expect(rows()).toEqual(["Docs", "Reports", "Q1", "Invoices", "Media"]);
    expect(screen.getByRole("tree")).toBeTruthy();
    const items = screen.getAllByRole("treeitem");
    expect(items.map((i) => [i.getAttribute("aria-level"), i.getAttribute("aria-posinset"), i.getAttribute("aria-setsize"), i.getAttribute("aria-expanded")])).toEqual([
      ["1", "1", "2", "true"],
      ["2", "1", "2", "true"],
      ["3", "1", "1", null],
      ["2", "2", "2", null],
      ["1", "2", "2", null],
    ]);
    // One tab stop (the first row until something is focused); the default template shows the icon.
    expect(items.map((i) => i.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(row("Media").querySelector('[data-icon-name="folder"]')).toBeTruthy();
  });

  test("hierarchy format with mapped fields; defaultExpanded ids open their paths", () => {
    show(`<App><Tree dataFormat="hierarchy" idField="uid" nameField="label" childrenField="kids" defaultExpanded="{['c']}"
      data="{[{ uid: 'a', label: 'A', kids: [{ uid: 'b', label: 'B', kids: [{ uid: 'c', label: 'C', kids: [{ uid: 'd', label: 'D' }] }] }] }, { uid: 'e', label: 'E' }]}"/></App>`);
    expect(rows()).toEqual(["A", "B", "C", "D", "E"]);
  });

  test("the template's $item: id, depth, hasChildren, path, parentIds and the source fields", () => {
    show(`<App><Tree data="{${FLAT}}" defaultExpanded="{[3]}">
      <property name="itemTemplate"><Text>{$item.id}/{$item.depth}/{$item.hasChildren}/{$item.path.join('>')}/{$item.parentIds.join(',')}/{$item.parentId}</Text></property>
    </Tree></App>`);
    expect(rows()).toEqual(["1/0/true/Docs//", "2/1/true/Docs>Reports/1/1", "3/2/false/Docs>Reports>Q1/1,2/2", "4/1/false/Docs>Invoices/1/1", "5/0/false/Media//"]);
  });

  test("first-level; the toggle expands and collapses, with nodeDidExpand and nodeDidCollapse", async () => {
    show(`<App var.log="">
      <Tree data="{${FLAT}}" defaultExpanded="first-level" onNodeDidExpand="n => log += '+' + n.name" onNodeDidCollapse="n => log += '-' + n.name"/>
      <Text>log:{log}</Text>
    </App>`);
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "Media"]);
    await toggle("Reports");
    expect(rows()).toEqual(["Docs", "Reports", "Q1", "Invoices", "Media"]);
    await toggle("Docs");
    expect(rows()).toEqual(["Docs", "Media"]);
    // A row click selects; it toggles only with itemClickExpands.
    await act(async () => fireEvent.click(row("Docs").querySelector(".gfui-Tree-label")!));
    expect(rows()).toEqual(["Docs", "Media"]);
    expect(log()).toBe("+Reports-Docs");
  });

  test("itemClickExpands: a click on the row toggles it", async () => {
    show(`<App><Tree data="{${FLAT}}" itemClickExpands="true"/></App>`);
    await act(async () => fireEvent.click(row("Docs").querySelector(".gfui-Tree-label")!));
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "Media"]);
  });

  test("the static window is the first visible rows; the prerender has them", () => {
    const data = `{Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: 'n' + (i + 1), parentId: i === 0 ? null : 1 }))}`;
    show(`<App><Tree data="${data}" defaultExpanded="all"/></App>`);
    expect(rows()).toHaveLength(components.STATIC_ROWS);
    cleanup();
    const { html } = renderStatic(compiled(`<App><Tree data="${data}" defaultExpanded="all" selectedValue="3"/></App>`));
    expect(html).toContain('role="tree"');
    expect(html).toContain(">n1<");
    expect(html).toContain(`>n${components.STATIC_ROWS}<`);
    expect(html).not.toContain(`>n${components.STATIC_ROWS + 1}<`);
    expect(html).toMatch(/aria-selected="true"[^>]*>(?:(?!treeitem).)*>n3</s);
  });

  test("a repeated id is reported; items whose parent is missing don't show", async () => {
    show(`<App><Tree data="{[{ id: 1, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'Orphan', parentId: 9 }]}"/></App>`);
    await settle();
    expect(rows()).toEqual(["A"]);
    expect(String(errors[0])).toMatch(/Tree: the ids must be unique; repeated: 1/);
  });
});

describe("Tree: selection (decision D)", () => {
  test("a click selects; selectionDidChange gets { newNode, previousNode }; unselectable nodes stay unselected", async () => {
    show(`<App var.log="">
      <Tree data="{[{ id: 1, name: 'A' }, { id: 2, name: 'B', selectable: false }, { id: 3, name: 'C' }]}"
        onSelectionDidChange="e => log += (e.previousNode?.name ?? '-') + '>' + e.newNode?.name + ';'"/>
      <Text>log:{log}</Text>
    </App>`);
    await pick("A");
    await pick("B");
    await pick("C");
    expect(log()).toBe("->A;A>C;");
    expect(screen.getAllByRole("treeitem").map((i) => i.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
  });

  test("selectedValue is the first selection and follows the variable (its path opens); no event for it", async () => {
    show(`<App var.sel="{3}" var.log="">
      <Tree data="{${FLAT}}" selectedValue="{sel}" onSelectionDidChange="e => log += e.newNode.name"/>
      <Button label="media" onClick="sel = 5"/>
      <Text>log:{log}</Text>
    </App>`);
    expect(rows()).toEqual(["Docs", "Reports", "Q1", "Invoices", "Media"]);
    expect(row("Q1").getAttribute("aria-selected")).toBe("true");
    await click("media");
    console.log("ROWS", JSON.stringify(rows()));
    expect(row("Media").getAttribute("aria-selected")).toBe("true");
    expect(row("Q1").getAttribute("aria-selected")).toBe("false");
    await pick("Docs");
    expect(log()).toBe("Docs");
  });

  test("autoExpandToSelection false leaves the path closed", () => {
    show(`<App><Tree data="{${FLAT}}" selectedValue="3" autoExpandToSelection="false"/></App>`);
    expect(rows()).toEqual(["Docs", "Media"]);
  });
});

describe("Tree: keys", () => {
  test("arrows move the focus (headless-tree); Right expands, then enters; Left goes to the parent, then collapses", async () => {
    show(`<App><Tree data="{${FLAT}}"/></App>`);
    const first = row("Docs");
    await press(first, "ArrowRight");
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "Media"]);
    await press(row("Docs"), "ArrowRight");
    expect(row("Reports").getAttribute("tabindex")).toBe("0");
    await press(row("Reports"), "ArrowDown");
    expect(row("Invoices").getAttribute("tabindex")).toBe("0");
    await press(row("Invoices"), "ArrowLeft");
    expect(row("Docs").getAttribute("tabindex")).toBe("0");
    await press(row("Docs"), "ArrowLeft");
    expect(rows()).toEqual(["Docs", "Media"]);
    await press(row("Docs"), "End");
    expect(row("Media").getAttribute("tabindex")).toBe("0");
  });

  test("Enter selects and toggles; Space selects; Delete fires deleteAction with the focused node", async () => {
    show(`<App var.log="">
      <Tree data="{${FLAT}}" onDeleteAction="n => log += 'del ' + n.name"/>
      <Text>log:{log}</Text>
    </App>`);
    await press(row("Docs"), "Enter");
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "Media"]);
    expect(row("Docs").getAttribute("aria-selected")).toBe("true");
    await press(row("Docs"), "ArrowDown");
    await press(row("Reports"), " ");
    expect(row("Reports").getAttribute("aria-selected")).toBe("true");
    await press(row("Reports"), "Delete");
    expect(log()).toBe("del Reports");
  });
});

describe("Tree: lazy loading", () => {
  test("loadChildren's result becomes the children; loadingState shows; markNodeUnloaded loads again", async () => {
    show(`<App var.count="{0}">
      <Tree id="t" data="{[{ id: 1, name: 'Projects', dynamic: true }, { id: 2, name: 'Plain' }]}"
        onLoadChildren="(node) => { count++; delay(30); return [{ id: 10 + count, name: 'P' + count }]; }">
        <property name="itemTemplate"><Text>{$item.name}:{$item.loadingState}</Text></property>
      </Tree>
      <Button label="unload" onClick="t.markNodeUnloaded(1)"/>
    </App>`);
    expect(rows()).toEqual(["Projects:unloaded", "Plain:loaded"]);
    expect(row("Projects:unloaded").getAttribute("aria-expanded")).toBe("false");
    await toggle("Projects:unloaded");
    expect(rows()).toEqual(["Projects:loading", "Plain:loaded"]);
    await settle(60);
    expect(rows()).toEqual(["Projects:loaded", "P1:loaded", "Plain:loaded"]);
    // Collapsing and expanding again does not reload.
    await toggle("Projects:loaded");
    await toggle("Projects:loaded");
    await settle(60);
    expect(rows()).toEqual(["Projects:loaded", "P1:loaded", "Plain:loaded"]);
    await click("unload");
    expect(rows()).toEqual(["Projects:unloaded", "Plain:loaded"]);
    await toggle("Projects:unloaded");
    await settle(60);
    expect(rows()).toEqual(["Projects:loaded", "P2:loaded", "Plain:loaded"]);
  });

  test("loaded: false marks a node to load; a failing load reports the error and collapses it", async () => {
    show(`<App><Tree data="{[{ id: 1, name: 'Bad', loaded: false }]}" onLoadChildren="() => { throw 'nope'; }"/></App>`);
    expect(row("Bad").getAttribute("aria-expanded")).toBe("false");
    await toggle("Bad");
    await settle(20);
    expect(row("Bad").getAttribute("aria-expanded")).toBe("false");
    expect(errors.length).toBeGreaterThan(0);
  });

  test("autoLoadAfter: a node collapsed that long loads again", async () => {
    show(`<App var.count="{0}">
      <Tree data="{[{ id: 1, name: 'Live', dynamic: true }]}" autoLoadAfter="30"
        onLoadChildren="() => { count++; return [{ id: 'k' + count, name: 'K' + count }]; }"/>
    </App>`);
    await toggle("Live");
    await settle(10);
    expect(rows()).toEqual(["Live", "K1"]);
    await toggle("Live");
    await settle(50);
    await toggle("Live");
    await settle(10);
    expect(rows()).toEqual(["Live", "K2"]);
  });
});

describe("Tree: the API", () => {
  test("expandAll, collapseAll, expandToLevel, expandNode, getExpandedNodes", async () => {
    show(`<App var.log="">
      <Tree id="t" data="{${FLAT}}"/>
      <Button label="all" onClick="t.expandAll(); log = t.getExpandedNodes().join(',')"/>
      <Button label="none" onClick="t.collapseAll()"/>
      <Button label="level" onClick="t.expandToLevel(1)"/>
      <Button label="node" onClick="t.expandNode(2)"/>
      <Text>log:{log}</Text>
    </App>`);
    await click("all");
    expect(rows()).toEqual(["Docs", "Reports", "Q1", "Invoices", "Media"]);
    expect(log()).toBe("1,2");
    await click("none");
    expect(rows()).toEqual(["Docs", "Media"]);
    await click("level");
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "Media"]);
    await click("none");
    await click("node");
    expect(rows()).toEqual(["Docs", "Media"]);
    // expandToLevel replaces the expanded set (XMLUI too): Reports closes again.
    await click("level");
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "Media"]);
  });

  test("selectNode, selectNodeByIndex, getSelectedNode, getNodeById, clearSelection: writes are read at once", async () => {
    show(`<App var.log="">
      <Tree id="t" data="{${FLAT}}" defaultExpanded="all"/>
      <Button label="sel" onClick="t.selectNode(4); log = t.getSelectedNode().name + ',' + t.getNodeById(3).path.join('>')"/>
      <Button label="idx" onClick="t.selectNodeByIndex(2); log = t.getSelectedNode().name"/>
      <Button label="clear" onClick="t.clearSelection(); log = String(t.getSelectedNode())"/>
      <Text>log:{log}</Text>
    </App>`);
    await click("sel");
    expect(log()).toBe("Invoices,Docs>Reports>Q1");
    await click("idx");
    expect(log()).toBe("Q1");
    await click("clear");
    expect(log()).toBe("null");
  });

  test("edits: appendNode, insertNodeBefore/After, replaceNode, removeNode, removeChildren, replaceChildren", async () => {
    show(`<App>
      <Tree id="t" data="{${FLAT}}" defaultExpanded="all"/>
      <Button label="edit" onClick="
        t.appendNode(5, { id: 6, name: 'Photos' });
        t.appendNode(null, { id: 7, name: 'Root2' });
        t.insertNodeBefore(4, { id: 8, name: 'Before' });
        t.insertNodeAfter(4, { id: 9, name: 'After' });
        t.replaceNode(3, { name: 'Q1!' });
        t.expandNode(5);
      "/>
      <Button label="remove" onClick="t.removeNode(2); t.removeChildren(5); t.replaceChildren(7, [{ id: 10, name: 'New' }]); t.expandNode(7)"/>
    </App>`);
    await click("edit");
    expect(rows()).toEqual(["Docs", "Reports", "Q1!", "Before", "Invoices", "After", "Media", "Photos", "Root2"]);
    await click("remove");
    expect(rows()).toEqual(["Docs", "Before", "Invoices", "After", "Media", "Root2", "New"]);
  });

  test("getTreeState and setTreeState round-trip; initialTreeState applies on mount", async () => {
    show(`<App var.saved="{null}" var.log="">
      <Tree id="t" data="{${FLAT}}"/>
      <Button label="save" onClick="t.expandNode(1); t.selectNode(4); saved = t.getTreeState(); log = JSON.stringify(saved[1]) + JSON.stringify(saved[4])"/>
      <Button label="reset" onClick="t.collapseAll(); t.clearSelection()"/>
      <Button label="restore" onClick="t.setTreeState(saved)"/>
      <Text>log:{log}</Text>
      <Tree when="{saved}" data="{${FLAT}}" initialTreeState="{saved}"/>
    </App>`);
    await click("save");
    expect(log()).toBe('{"expanded":true,"collapsed":false,"expandedTimestamp":' + log()!.match(/"expandedTimestamp":(\d+)/)![1] + '}{"selected":true}');
    const [first, second] = [...document.querySelectorAll(".gfui-Tree")];
    expect(rows(second!)).toEqual(["Docs", "Reports", "Invoices", "Media"]);
    expect(second!.querySelector('[aria-selected="true"]')?.textContent).toBe("Invoices");
    await click("reset");
    expect(rows(first!)).toEqual(["Docs", "Media"]);
    await click("restore");
    expect(rows(first!)).toEqual(["Docs", "Reports", "Invoices", "Media"]);
    expect(first!.querySelector('[aria-selected="true"]')?.textContent).toBe("Invoices");
  });
});

describe("Tree: new data (decision C)", () => {
  test("reset (default) starts over; preserve-state keeps expansion and selection", async () => {
    show(`<App var.items="{${FLAT}}">
      <Tree id="a" data="{items}"/>
      <Tree id="b" data="{items}" dataRefreshMode="preserve-state"/>
      <Button label="open" onClick="a.expandNode(1); b.expandNode(1); a.selectNode(4); b.selectNode(4)"/>
      <Button label="add" onClick="items = [...items, { id: 9, name: 'New', parentId: 1 }]"/>
    </App>`);
    await click("open");
    await click("add");
    const [a, b] = [...document.querySelectorAll(".gfui-Tree")];
    expect(rows(a!)).toEqual(["Docs", "Media"]);
    expect(rows(b!)).toEqual(["Docs", "Reports", "Invoices", "New", "Media"]);
    expect(b!.querySelector('[aria-selected="true"]')?.textContent).toBe("Invoices");
  });

  test("preserveStateOnNextDataRefresh keeps the state once, even in reset mode", async () => {
    show(`<App var.items="{${FLAT}}">
      <Tree id="t" data="{items}"/>
      <Button label="once" onClick="t.expandNode(1); t.preserveStateOnNextDataRefresh({ operation: 'insert' }); items = [...items, { id: 9, name: 'New', parentId: 1 }]"/>
      <Button label="again" onClick="items = [...items]"/>
    </App>`);
    await click("once");
    expect(rows()).toEqual(["Docs", "Reports", "Invoices", "New", "Media"]);
    await click("again");
    expect(rows()).toEqual(["Docs", "Media"]);
  });

  test("edits live in the working copy: the variable is unchanged, and a new value replaces them", async () => {
    show(`<App var.items="{${FLAT}}" var.log="">
      <Tree id="t" data="{items}"/>
      <Button label="edit" onClick="t.appendNode(null, { id: 8, name: 'Added' }); log = String(items.length)"/>
      <Button label="replace" onClick="items = [{ id: 1, name: 'Only' }]"/>
      <Text>log:{log}</Text>
    </App>`);
    await click("edit");
    expect(rows()).toEqual(["Docs", "Media", "Added"]);
    expect(log()).toBe("5");
    await click("replace");
    expect(rows()).toEqual(["Only"]);
  });

  test("preserve-state keeps a dynamic node's loaded children when the new data has none", async () => {
    show(`<App var.items="{[{ id: 1, name: 'Lazy', dynamic: true }]}">
      <Tree data="{items}" dataRefreshMode="preserve-state" onLoadChildren="() => [{ id: 2, name: 'Kid' }]"/>
      <Button label="refresh" onClick="items = [{ id: 1, name: 'Lazy!', dynamic: true }]"/>
    </App>`);
    await toggle("Lazy");
    await settle();
    expect(rows()).toEqual(["Lazy", "Kid"]);
    await click("refresh");
    expect(rows()).toEqual(["Lazy!", "Kid"]);
  });
});

describe("TileGrid", () => {
  const TILES = `{Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, title: 'Photo ' + i }))}`;
  const tiles = () => [...document.querySelectorAll(".gfui-TileGrid-tile")];

  test("the static window: a CSS grid of tiles with $item, $itemIndex, $isFirst, $isLast", () => {
    show(`<App><TileGrid data="${TILES}" itemWidth="100px" itemHeight="80px"><Text>{$itemIndex}:{$item.title}{$isFirst ? '^' : ''}{$isLast ? '$' : ''}</Text></TileGrid></App>`);
    expect(tiles().map((t) => t.textContent)).toEqual(["0:Photo 0^", "1:Photo 1", "2:Photo 2", "3:Photo 3", "4:Photo 4", "5:Photo 5", "6:Photo 6", "7:Photo 7$"]);
    expect(screen.getByRole("grid")).toBeTruthy();
    expect((document.querySelector(".gfui-TileGrid-static") as HTMLElement).style.gridTemplateColumns).toBe("repeat(auto-fill, 100px)");
  });

  test("selection: click, Ctrl-click, Shift-click, checkboxes; $selected; selectionDidChange(items, ids)", async () => {
    show(`<App var.log="">
      <TileGrid data="${TILES}" itemsSelectable="true" onSelectionDidChange="(items, ids) => log = ids.join(',')">
        <Text>{$item.title}{$selected ? '*' : ''}</Text>
      </TileGrid>
      <Text>log:{log}</Text>
    </App>`);
    await act(async () => fireEvent.click(tiles()[1]!));
    await act(async () => fireEvent.click(tiles()[3]!, { ctrlKey: true }));
    expect(log()).toBe("p1,p3");
    await act(async () => fireEvent.click(tiles()[5]!, { shiftKey: true }));
    expect(log()).toBe("p1,p3,p4,p5");
    expect(tiles()[4]!.textContent).toBe("Photo 4*");
    await act(async () => fireEvent.click(tiles()[0]!.querySelector("input")!));
    expect(log()).toBe("p1,p3,p4,p5,p0");
  });

  test("keys move in two dimensions; Space toggles; Ctrl+A fires selectAllAction; Delete gets the focused item", async () => {
    show(`<App var.log="">
      <TileGrid data="${TILES}" itemsSelectable="true" onSelectAllAction="(items, ids) => log = 'all ' + ids.length" onDeleteAction="(item, items) => log = 'del ' + item.id + '/' + items.length">
        <Text>{$item.title}</Text>
      </TileGrid>
      <Text>log:{log}</Text>
    </App>`);
    const grid = screen.getByRole("grid");
    // No width in jsdom: one column, so Down moves one tile.
    await act(async () => fireEvent.keyDown(grid, { key: "ArrowRight" }));
    await act(async () => fireEvent.keyDown(grid, { key: "ArrowDown" }));
    expect(tiles()[1]!.getAttribute("aria-selected")).toBe("true");
    await act(async () => fireEvent.keyDown(grid, { key: " " }));
    expect(tiles()[1]!.getAttribute("aria-selected")).toBe("false");
    await act(async () => fireEvent.keyDown(grid, { key: "Delete" }));
    expect(log()).toBe("del p1/0");
    await act(async () => fireEvent.keyDown(grid, { key: "a", ctrlKey: true }));
    expect(log()).toBe("all 8");
  });

  test("syncWithVar across two grids; the API", async () => {
    show(`<App var.picked="{{ selectedIds: ['p2'] }}" var.log="">
      <TileGrid id="g" data="${TILES}" itemsSelectable="true" syncWithVar="picked"><Text>{$item.title}</Text></TileGrid>
      <TileGrid data="${TILES}" itemsSelectable="true" syncWithVar="picked"><Text>{$item.title}</Text></TileGrid>
      <Button label="api" onClick="g.selectId(['p4', 'p6']); log = g.getSelectedIds().join(',')"/>
      <Text>log:{log}</Text>
    </App>`);
    const selected = () => [...document.querySelectorAll(".gfui-TileGrid")].map((g) => [...g.querySelectorAll('[aria-selected="true"]')].map((t) => t.textContent).join(","));
    expect(selected()).toEqual(["Photo 2", "Photo 2"]);
    await act(async () => fireEvent.click(document.querySelectorAll(".gfui-TileGrid")[1]!.querySelectorAll(".gfui-TileGrid-tile")[5]!));
    await settle();
    expect(selected()).toEqual(["Photo 5", "Photo 5"]);
    await click("api");
    await settle();
    expect(selected()).toEqual(["Photo 4,Photo 5,Photo 6", "Photo 4,Photo 5,Photo 6"]);
  });

  test("the prerender has the static tiles; loading shows a spinner", () => {
    const { html } = renderStatic(compiled(`<App><TileGrid data="${TILES}"><Text>{$item.title}</Text></TileGrid></App>`));
    expect(html).toContain('role="grid"');
    expect(html).toContain(">Photo 7<");
    cleanup();
    show(`<App><TileGrid data="${TILES}" loading="true"><Text>{$item.title}</Text></TileGrid></App>`);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });
});

describe("Items (decision F)", () => {
  test("an object's values: integer keys ascending first", () => {
    show(`<App><Items data="{{ b: 'second', 10: 'ten', a: 'first', 2: 'two' }}"><Text>{$item}</Text></Items></App>`);
    expect([...document.querySelectorAll(".gfui-Text")].map((t) => t.textContent)).toEqual(["two", "ten", "second", "first"]);
  });

  test("an instance stays with its item's id through an insert; a new id remounts", async () => {
    show(`<App var.list="{[{ id: 'a' }, { id: 'b' }]}">
      <Items data="{list}"><TextBox initialValue="{$item.id}"/></Items>
      <Button label="prepend" onClick="list = [{ id: 'z' }, ...list]"/>
      <Button label="swap" onClick="list = [{ id: 'q' }, ...list.slice(1)]"/>
    </App>`);
    const inputs = () => [...document.querySelectorAll("input")].map((i) => i.value);
    fireEvent.change(document.querySelectorAll("input")[0]!, { target: { value: "A!" } });
    await click("prepend");
    expect(inputs()).toEqual(["z", "A!", "b"]);
    await click("swap");
    expect(inputs()).toEqual(["q", "A!", "b"]);
  });
});
