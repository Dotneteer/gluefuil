// Step 29 in jsdom: the List through markup. jsdom has no layout, so the List
// stays in its static window (the first STATIC_ROWS rows, the last with
// scrollAnchor="bottom"), which is also what the prerender shows. Scrolling,
// measuring and anchoring are E2E tests (e2e/list.spec.ts).
import { compileModule } from "@gluefuil/compiler";
import { loadModule, resetRouter, setDiagnosticReporter, setErrorReporter } from "@gluefuil/runtime";
import { renderStatic } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { STATIC_ROWS } from "../src/list";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  // Step 33: developer diagnostics (duplicate ids, an unbound input) go to their own reporter.
  const restoreErrors = setErrorReporter((error) => errors.push(error));
  const restoreDiagnostics = setDiagnosticReporter((problem) => errors.push(problem));
  restore = () => {
    restoreErrors();
    restoreDiagnostics();
  };
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
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const rows = () => [...document.querySelectorAll(".gfui-List-row")].map((r) => r.textContent);
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent;
const row = (name: string) => [...document.querySelectorAll(".gfui-List-row")].find((r) => r.textContent?.includes(name))!;
const FRUITS = `[{ id: 1, name: 'apple', kind: 'fruit' }, { id: 2, name: 'kale', kind: 'veg' }, { id: 3, name: 'pear', kind: 'fruit' }, { id: 4, name: 'leek', kind: 'veg' }]`;

describe("rows and templates", () => {
  test("children are the item template, with $item, $itemIndex, $isFirst, $isLast", () => {
    show(`<App><List data="{${FRUITS}}"><Text>{$itemIndex}:{$item.name}{$isFirst ? '^' : ''}{$isLast ? '$' : ''}</Text></List></App>`);
    expect(rows()).toEqual(["0:apple^", "1:kale", "2:pear", "3:leek$"]);
    expect(screen.getByRole("list")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((r) => r.getAttribute("aria-posinset"))).toEqual(["1", "2", "3", "4"]);
  });

  test("orderBy and limit; items wins over data", () => {
    show(`<App><List data="{[]}" items="{${FRUITS}}" orderBy="{{ field: 'name', direction: 'desc' }}" limit="3"><Text>{$item.name}</Text></List></App>`);
    expect(rows()).toEqual(["pear", "leek", "kale"]);
  });

  test("the static window: the first rows, or the last with scrollAnchor=bottom", () => {
    const data = `{Array.from({ length: 50 }, (_, i) => ({ id: i, n: 'r' + i }))}`;
    show(`<App><List data="${data}"><Text>{$item.n}</Text></List><List scrollAnchor="bottom" data="${data}"><Text>{$item.n}</Text></List></App>`);
    const [top, bottom] = [...document.querySelectorAll(".gfui-List")].map((l) => [...l.querySelectorAll(".gfui-List-row")].map((r) => r.textContent));
    expect(top).toHaveLength(STATIC_ROWS);
    expect(top![0]).toBe("r0");
    expect(bottom![0]).toBe(`r${50 - STATIC_ROWS}`);
    expect(bottom!.at(-1)).toBe("r49");
  });

  test("empty: the default text, emptyListTemplate, or a spinner while loading", async () => {
    show(`<App>
      <List data="{[]}"/>
      <List data="{[]}"><property name="emptyListTemplate"><Text>Nothing here</Text></property></List>
      <List data="{[]}" loading="true" loadingDelay="0"/>
    </App>`);
    expect(screen.getByText("No data available")).toBeTruthy();
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  test("row state survives a reorder (keys by idKey); a duplicate id is reported", async () => {
    show(`<App var.list="{${FRUITS}}">
      <List data="{list}"><TextBox initialValue="{$item.name}"/></List>
      <Button label="reverse" onClick="list = [...list].reverse()"/>
      <Button label="dup" onClick="list = [...list, { id: 1, name: 'again' }]"/>
    </App>`);
    fireEvent.change(row("").querySelector("input")!, { target: { value: "APPLE!" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "reverse" })));
    const values = [...document.querySelectorAll(".gfui-List-row input")].map((i) => (i as HTMLInputElement).value);
    expect(values).toEqual(["leek", "pear", "kale", "APPLE!"]);
    expect(errors).toEqual([]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "dup" })));
    await settle();
    expect(String(errors[0])).toMatch(/List: the 'id' values must be unique.*\(1\)/);
  });
});

describe("groups", () => {
  test("headers and footers with $group; toggle() folds a group; availableGroups filters", async () => {
    show(`<App>
      <List data="{${FRUITS}}" groupBy="kind">
        <property name="groupHeaderTemplate">
          <Button label="{$group.key} ({$group.items.length}){$group.isExpanded ? '' : ' +'}" onClick="$group.toggle()"/>
        </property>
        <property name="groupFooterTemplate"><Text>end {$group.key}</Text></property>
        <Text>{$item.name}</Text>
      </List>
      <List data="{${FRUITS}}" groupBy="{(item) => item.name.length}" availableGroups="{['4']}">
        <property name="groupHeaderTemplate"><Text>len {$group.key}</Text></property>
        <Text>{$item.name}</Text>
      </List>
    </App>`);
    const [first, second] = [...document.querySelectorAll(".gfui-List")].map((l) => () => [...l.querySelectorAll(".gfui-List-row")].map((r) => r.textContent));
    expect(first!()).toEqual(["fruit (2)", "apple", "pear", "end fruit", "veg (2)", "kale", "leek", "end veg"]);
    expect(second!()).toEqual(["len 4", "kale", "pear", "leek"]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "fruit (2)" })));
    expect(first!()).toEqual(["fruit (2) +", "veg (2)", "kale", "leek", "end veg"]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "fruit (2) +" })));
    expect(first!()).toHaveLength(8);
  });
});

describe("selection", () => {
  const SELECTABLE = (extra = "") => `<App var.log="">
    <List id="list" data="{${FRUITS}}" rowsSelectable="true" ${extra}
      onSelectionDidChange="items => log = items.map(i => i.name).join(',')">
      <Text>{$item.name}{$isSelected ? '*' : ''}</Text>
    </List>
    <Text>log: {log}</Text>
  </App>`;

  test("click, Ctrl and Shift clicks; $isSelected; selectionDidChange with the items", async () => {
    show(SELECTABLE());
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
    await act(async () => fireEvent.click(row("kale")));
    expect(rows()).toEqual(["apple", "kale*", "pear", "leek"]);
    expect(text("log:")).toBe("log: kale");
    await act(async () => fireEvent.click(row("leek"), { ctrlKey: true }));
    expect(text("log:")).toBe("log: kale,leek");
    // Shift extends from the anchor, the last row clicked without Shift (leek).
    await act(async () => fireEvent.click(row("apple"), { shiftKey: true }));
    expect(text("log:")).toBe("log: kale,apple,pear,leek");
    await act(async () => fireEvent.click(row("pear")));
    expect(screen.getAllByRole("option", { selected: true }).map((o) => o.textContent)).toEqual(["pear*"]);
  });

  test("checkboxes toggle; an unselectable row can't be selected; hideSelectionCheckboxes", async () => {
    show(SELECTABLE(`rowUnselectablePredicate="{(item) => item.name === 'pear'}"`));
    const boxes = screen.getAllByRole("checkbox", { name: "Select row" });
    expect(boxes).toHaveLength(4);
    expect((boxes[2] as HTMLInputElement).disabled).toBe(true);
    await act(async () => fireEvent.click(boxes[0]!));
    await act(async () => fireEvent.click(boxes[3]!));
    expect(text("log:")).toBe("log: apple,leek");
    await act(async () => fireEvent.click(row("pear")));
    expect(text("log:")).toBe("log: apple,leek");
    cleanup();
    show(SELECTABLE(`hideSelectionCheckboxes="true"`));
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
  });

  test("keys move and select; Shift+arrows extend; enableMultiRowSelection=false keeps one", async () => {
    show(SELECTABLE());
    const list = screen.getByRole("listbox");
    await act(async () => fireEvent.keyDown(list, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(list, { key: "ArrowDown" }));
    expect(text("log:")).toBe("log: kale");
    await act(async () => fireEvent.keyDown(list, { key: "ArrowDown", shiftKey: true }));
    expect(text("log:")).toBe("log: kale,pear");
    await act(async () => fireEvent.keyDown(list, { key: "End" }));
    expect(text("log:")).toBe("log: leek");
    cleanup();
    show(SELECTABLE(`enableMultiRowSelection="false"`));
    await act(async () => fireEvent.click(row("kale")));
    await act(async () => fireEvent.click(row("leek"), { ctrlKey: true }));
    expect(text("log:")).toBe("log: leek");
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBeNull();
  });

  test("the API: selectId, selectAll, getSelectedIds, getSelectedItems, clearSelection, getItemCount, getVisibleRange", async () => {
    show(`<App var.out="">
      <List id="list" data="{${FRUITS}}" rowsSelectable="true" initiallySelected="{[3]}"><Text>{$item.name}</Text></List>
      <Button label="ids" onClick="out = list.getSelectedIds().join(',') + '|' + list.getSelectedItems().map(i => i.name).join(',')"/>
      <Button label="pick" onClick="list.selectId([1, 2])"/>
      <Button label="all" onClick="list.selectAll()"/>
      <Button label="none" onClick="list.clearSelection()"/>
      <Button label="count" onClick="out = list.getItemCount() + ':' + JSON.stringify(list.getVisibleRange())"/>
      <Text>out: {out}</Text>
    </App>`);
    const press = (name: string) => act(async () => fireEvent.click(screen.getByRole("button", { name })));
    await press("ids");
    expect(text("out:")).toBe("out: 3|pear");
    await press("pick");
    await press("ids");
    expect(text("out:")).toBe("out: 3,1,2|pear,apple,kale");
    await press("none");
    await press("ids");
    expect(text("out:")).toBe("out: |");
    await press("all");
    await press("ids");
    expect(text("out:")).toBe("out: 1,2,3,4|apple,kale,pear,leek");
    await press("count");
    expect(text("out:")).toBe('out: 4:{"startIndex":0,"endIndex":3}');
  });

  test("syncWithVar: the variable's selectedIds select rows, and the List writes them back", async () => {
    show(`<App var.sel="{{ selectedIds: ['2'], other: 'kept' }}">
      <List data="{${FRUITS}}" rowsSelectable="true" syncWithVar="sel"><Text>{$item.name}{$isSelected ? '*' : ''}</Text></List>
      <Button label="from outside" onClick="sel = { selectedIds: ['4'] }"/>
      <Text>sel: {JSON.stringify(sel)}</Text>
    </App>`);
    expect(rows()).toEqual(["apple", "kale*", "pear", "leek"]);
    await act(async () => fireEvent.click(row("pear"), { ctrlKey: true }));
    expect(text("sel:")).toBe('sel: {"selectedIds":["2","3"],"other":"kept"}');
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "from outside" })));
    expect(rows()).toEqual(["apple", "kale", "pear", "leek*"]);
  });

  test("keyboard actions: select all, copy and delete with (row, items, ids); keyBindings", async () => {
    show(`<App var.log="">
      <List data="{${FRUITS}}" rowsSelectable="true" keyBindings="{{ delete: 'Backspace' }}"
        onCopyAction="(row, items, ids) => log += 'copy ' + (row ? row.item.name + '@' + row.rowIndex : 'none') + ' ' + ids.join(',') + ';'"
        onDeleteAction="(row, items, ids) => log += 'delete ' + items.map(i => i.name).join(',') + ';'"
        onSelectAllAction="(row, items, ids) => log += 'all ' + ids.length + ';'">
        <Text>{$item.name}</Text>
      </List>
      <Text>log: {log}</Text>
    </App>`);
    const list = screen.getByRole("listbox");
    await act(async () => fireEvent.click(row("kale")));
    await act(async () => fireEvent.keyDown(list, { key: "c", ctrlKey: true }));
    await act(async () => fireEvent.keyDown(list, { key: "Delete" }));
    await act(async () => fireEvent.keyDown(list, { key: "Backspace" }));
    await act(async () => fireEvent.keyDown(list, { key: "a", metaKey: true }));
    expect(text("log:")).toBe("log: copy kale@1 2;delete kale;all 4;");
  });

  test("rowDoubleClick and contextMenu receive the item (contextMenu: the pointer first)", async () => {
    show(`<App var.log="">
      <List data="{${FRUITS}}" onRowDoubleClick="item => log += 'dbl ' + item.name + ';'" onContextMenu="(ev, item) => log += 'ctx ' + item.name + ' ' + typeof ev.clientX + ';'">
        <Text>{$item.name}</Text>
      </List>
      <Text>log: {log}</Text>
    </App>`);
    await act(async () => fireEvent.doubleClick(row("pear")));
    await act(async () => fireEvent.contextMenu(row("leek"), { clientX: 5, clientY: 6 }));
    expect(text("log:")).toBe("log: dbl pear;ctx leek number;");
  });
});

describe("the prerender", () => {
  test("the static window is in the server HTML, with the selection", () => {
    const { html } = renderStatic(
      compiled(`<App><List data="{Array.from({ length: 40 }, (_, i) => ({ id: i, n: 'row' + i }))}" rowsSelectable="true" initiallySelected="{[1]}"><Text>{$item.n}</Text></List></App>`),
    );
    expect(html).toContain(">row0<");
    expect(html).toContain(`>row${STATIC_ROWS - 1}<`);
    expect(html).not.toContain(`>row${STATIC_ROWS}<`);
    expect(html).toMatch(/aria-selected="true"[^>]*>.*?row1</s);
  });
});
