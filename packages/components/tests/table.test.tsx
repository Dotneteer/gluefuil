// Step 30 in jsdom: Table, Column, Value and Pagination through markup. jsdom
// has no layout, so the Table stays in its static window (the first STATIC_ROWS
// rows), which is also what the prerender shows. Widths, pinning, resizing,
// scrolling and copying are E2E tests (e2e/table.spec.ts).
import { compileModule } from "@gluefuil/compiler";
import { loadModule, resetRouter, setErrorReporter } from "@gluefuil/runtime";
import { renderStatic } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent;
/** The body rows as arrays of cell texts (the first table, or the given one). */
const rows = (table: Element = document.querySelector(".gfui-Table")!) =>
  [...table.querySelectorAll(".gfui-Table-body > [role=row]")].map((r) => [...r.querySelectorAll("[role=cell]")].map((c) => c.textContent ?? ""));
const headers = (table: Element = document.querySelector(".gfui-Table")!) => [...table.querySelectorAll("[role=columnheader]")].map((h) => h.textContent ?? "");
const row = (name: string) => screen.getAllByRole("row").find((r) => r.textContent?.includes(name))!;
const click = (element: Element, init?: object) => act(async () => fireEvent.click(element, init));
const PEOPLE = `[{ id: 1, name: 'Cy', total: 30, paid: true }, { id: 2, name: 'Al', total: 125.5, paid: false }, { id: 3, name: 'Bo', total: null, paid: true }]`;

describe("columns and cells", () => {
  test("Column children: headers, bound cells, typed cells, a cell template with its context", () => {
    show(`<App><Table data="{${PEOPLE}}">
      <Column bindTo="name" header="Name"/>
      <Column bindTo="total" type="currency(EUR)" typeOptions="{{ locale: 'en-US' }}"/>
      <Column bindTo="paid" type="yes-no"/>
      <Column header="Info"><Text>{$item.name}/{$cell}/{$colIndex}/{$rowIndex}/{$rowId}</Text></Column>
    </Table></App>`);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(headers()).toEqual(["Name", "total", "paid", "Info"]);
    expect(rows()).toEqual([
      ["Cy", "€30.00", "Yes", "Cy//3/0/1"],
      ["Al", "€125.50", "No", "Al//3/1/2"],
      ["Bo", "", "Yes", "Bo//3/2/3"],
    ]);
    const total = document.querySelector('[data-col="1"][role=cell]')!;
    expect(total.getAttribute("data-align")).toBe("end");
    expect(total.querySelector('[data-number-part="fraction"]')?.textContent).toBe("00");
  });

  test("without Column children the columns are inferred from the data", () => {
    show(`<App><Table data="{[{ id: 'a1', customer: 'Ada', total: 1.5, paid: true }]}"/></App>`);
    expect(headers()).toEqual(["id", "customer", "total", "paid"]);
    expect(rows()).toEqual([["a1", "Ada", "1.5", "true"]]);
  });

  test("Columns from an Items; a Column with when", async () => {
    show(`<App var.fields="{['name', 'total']}" var.more="{false}"><Table data="{${PEOPLE}}">
      <Items data="{fields}"><Column bindTo="{$item}" header="{$item.toUpperCase()}"/></Items>
      <Column bindTo="paid" when="{more}"/>
    </Table><Button label="more" onClick="more = true"/></App>`);
    expect(headers()).toEqual(["NAME", "TOTAL"]);
    await click(screen.getByRole("button", { name: "more" }));
    expect(headers()).toEqual(["NAME", "TOTAL", "paid"]);
  });

  test("the grid: one template for the header and the rows; star widths are fr", () => {
    show(`<App><Table data="{${PEOPLE}}"><Column bindTo="name" width="2*"/><Column bindTo="total" width="100px" minWidth="50px"/></Table></App>`);
    // jsdom normalizes clamp(50px, 100px, 100px) to calc(100px); the browser keeps it (E2E measures the widths).
    const templates = [...document.querySelectorAll<HTMLElement>("[role=row]")].map((r) => r.style.gridTemplateColumns);
    expect(templates).toHaveLength(4);
    expect(new Set(templates).size).toBe(1);
    expect(templates[0]).toMatch(/^minmax\(0px, 2fr\) /);
  });

  test("empty: the default text, noDataTemplate, a spinner while loading", () => {
    show(`<App>
      <Table data="{[]}"/>
      <Table data="{[]}"><property name="noDataTemplate"><Text>Nothing yet</Text></property></Table>
      <Table data="{[]}" loading="true" loadingDelay="0"/>
    </App>`);
    expect(screen.getByText("No data available")).toBeTruthy();
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });
});

describe("sorting", () => {
  const TABLE = (extra = "") => `<App var.log=""><Table data="{${PEOPLE}}" ${extra}
      onSortingDidChange="(by, dir) => log += (by ?? '-') + ':' + dir + ';'">
      <Column bindTo="name"/><Column bindTo="total"/><Column header="Fixed"><Text>x</Text></Column>
    </Table><Text>log: {log}</Text></App>`;
  const names = () => rows().map((r) => r[0]);
  const header = (name: string) => screen.getAllByRole("columnheader").find((h) => h.textContent?.startsWith(name))!;

  test("a header click cycles ascending, descending, unsorted; aria-sort; a column without bindTo doesn't sort", async () => {
    show(TABLE());
    await click(within(header("name")).getByRole("button"));
    expect(names()).toEqual(["Al", "Bo", "Cy"]);
    expect(header("name").getAttribute("aria-sort")).toBe("ascending");
    await click(within(header("name")).getByRole("button"));
    expect(names()).toEqual(["Cy", "Bo", "Al"]);
    await click(within(header("name")).getByRole("button"));
    expect(names()).toEqual(["Cy", "Al", "Bo"]);
    expect(text("log:")).toBe("log: name:ascending;name:descending;-:descending;");
    expect(within(header("Fixed")).queryByRole("button")).toBeNull();
  });

  test("sortBy, defaultSortDirection; willSort returning false cancels", async () => {
    show(TABLE(`sortBy="total" defaultSortDirection="descending" onWillSort="(by, dir) => by !== 'name'"`));
    expect(names()).toEqual(["Bo", "Al", "Cy"]);
    await click(within(header("name")).getByRole("button"));
    expect(names()).toEqual(["Bo", "Al", "Cy"]);
    expect(text("log:")).toBe("log: ");
  });
});

describe("selection", () => {
  const TABLE = (extra = "") => `<App var.log="" var.sel="{{ selectedIds: [] }}"><Table id="t" data="{${PEOPLE}}" rowsSelectable="true" syncWithVar="sel" ${extra}
      onSelectionDidChange="items => log = items.map(i => i.name).join(',')"><Column bindTo="name"/></Table>
      <Text>log: {log}</Text><Text>sel: {sel.selectedIds.join(',')}</Text></App>`;

  test("row clicks, the header checkbox (all, indeterminate), the variable", async () => {
    show(TABLE());
    await click(row("Al"));
    expect(text("log:")).toBe("log: Al");
    expect(text("sel:")).toBe("sel: 2");
    const all = screen.getByRole("checkbox", { name: "Select all rows" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await click(all);
    expect(text("log:")).toBe("log: Cy,Al,Bo");
    expect(all.checked).toBe(true);
    await click(all);
    expect(text("log:")).toBe("log: ");
  });

  test("a checkbox cell toggles; toggleSelectionOnClick; disabled rows can't be selected", async () => {
    show(TABLE(`toggleSelectionOnClick="true" rowDisabledPredicate="{(r) => r.name === 'Bo'}"`));
    await click(row("Cy"));
    await click(row("Al"));
    expect(text("log:")).toBe("log: Cy,Al");
    await click(row("Bo"));
    expect(text("log:")).toBe("log: Cy,Al");
    expect(row("Bo").getAttribute("aria-disabled")).toBe("true");
    await click(row("Cy").querySelector(".gfui-Table-selectCell")!);
    expect(text("log:")).toBe("log: Al");
  });

  test("keys and actions: arrows select, Ctrl+C runs copyAction with (row, items, ids)", async () => {
    show(`<App var.log=""><Table data="{${PEOPLE}}" rowsSelectable="true" onCopyAction="(row, items, ids) => log = row.item.name + ':' + ids.join(',')"><Column bindTo="name"/></Table><Text>log: {log}</Text></App>`);
    const table = screen.getByRole("table");
    await act(async () => fireEvent.keyDown(table, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true }));
    await act(async () => fireEvent.keyDown(table, { key: "c", ctrlKey: true }));
    expect(text("log:")).toBe("log: Al:1,2");
  });
});

describe("editable cells", () => {
  test("a switch saves through the variable; willChange false cancels; XMLUI's row.x = value gets a clear error", async () => {
    show(`<App var.rows="{${PEOPLE}}" var.log="">
      <Table data="{rows}">
        <Column bindTo="name"/>
        <Column bindTo="paid" header="Paid" type="switch" onWillChange="(v, row) => row.name !== 'Bo'"
          onDidChange="(v, row, index, column) => { rows = rows.map(r => r.id === row.id ? { ...r, paid: v } : r); log += column + index + v + ';' }"/>
        <Column bindTo="paid" header="Mutate" type="checkbox" onDidChange="(v, row) => row.paid = v"/>
      </Table><Text>log: {log}</Text></App>`);
    const paid = screen.getAllByRole("switch", { name: "Paid" }) as HTMLInputElement[];
    expect(paid.map((s) => s.checked)).toEqual([true, false, true]);
    await click(paid[1]!);
    await settle();
    expect((screen.getAllByRole("switch", { name: "Paid" })[1] as HTMLInputElement).checked).toBe(true);
    expect(text("log:")).toBe("log: paid1true;");
    await click(screen.getAllByRole("switch", { name: "Paid" })[2]!);
    await settle();
    expect((screen.getAllByRole("switch", { name: "Paid" })[2] as HTMLInputElement).checked).toBe(true);
    await click(screen.getAllByRole("checkbox", { name: "Mutate" })[0]!);
    await settle();
    expect(String(errors[0])).toMatch(/table rows are read-only. Assign the variable instead/);
  });
});

describe("row details, paging, styling, events, the API", () => {
  test("rowDetailTemplate: the expand button, the detail row, the API, rowExpansionDidChange", async () => {
    show(`<App var.log=""><Table id="t" data="{${PEOPLE}}" initiallyExpandedRowIds="{[3]}" onRowExpansionDidChange="(ids, id, open) => log = ids.join(',') + ':' + id + open">
      <Column bindTo="name"/><property name="rowDetailTemplate"><Text>Details of {$item.name} {$isExpanded}</Text></property>
    </Table><Button label="api" onClick="t.expandRow(1); log += '|' + t.getExpandedRowIds().join(',') + t.isRowExpanded(1)"/><Text>log: {log}</Text></App>`);
    expect(screen.getByText("Details of Bo true")).toBeTruthy();
    await click(screen.getAllByRole("button", { name: "Expand row" })[1]!);
    expect(screen.getByText("Details of Al true")).toBeTruthy();
    expect(text("log:")).toBe("log: 3,2:2true");
    await click(screen.getByRole("button", { name: "api" }));
    expect(text("log:")).toBe("log: 3,2,1:1true|3,2,1true");
  });

  test("pageSize pages when the rows don't fit; the pager moves pages and changes the size", async () => {
    const data = `{Array.from({ length: 25 }, (_, i) => ({ id: i, n: 'r' + i }))}`;
    show(`<App><Table data="${data}" pageSize="10" pageSizeOptions="{[10, 20]}"><Column bindTo="n"/></Table></App>`);
    expect(rows().map((r) => r[0])).toEqual(Array.from({ length: 10 }, (_, i) => `r${i}`));
    expect(screen.getByText("Page 1 of 3 (25 items)")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Next page" }));
    expect(rows()[0]).toEqual(["r10"]);
    await click(screen.getByRole("button", { name: "Last page" }));
    expect(rows().map((r) => r[0])).toEqual(["r20", "r21", "r22", "r23", "r24"]);
    await act(async () => fireEvent.change(screen.getByLabelText("Items per page"), { target: { value: "20" } }));
    expect(screen.getByText("Page 1 of 2 (25 items)")).toBeTruthy();
    expect(rows()).toHaveLength(20);
  });

  test("rowVariant, striped, row events and the context menu get the item", async () => {
    show(`<App var.log=""><Table data="{${PEOPLE}}" striped="true" rowVariant="{(r) => r.paid ? 'paid' : null}"
        onRowClick="r => log += 'c' + r.id" onRowDoubleClick="r => log += 'd' + r.id" onContextMenu="(ev, r) => log += 'm' + r.id + typeof ev.clientX">
      <Column bindTo="name"/></Table><Text>log: {log}</Text></App>`);
    expect(row("Cy").getAttribute("data-variant")).toBe("paid");
    expect(row("Al").getAttribute("data-variant")).toBeNull();
    expect(row("Cy").getAttribute("style")).toContain("--gfui-row-variant-bg: var(--gfui-backgroundColor-row-paid-Table)");
    expect(row("Al").getAttribute("data-parity")).toBe("odd");
    await click(row("Al"));
    await act(async () => fireEvent.doubleClick(row("Bo")));
    await act(async () => fireEvent.contextMenu(row("Cy"), { clientX: 3, clientY: 4 }));
    expect(text("log:")).toBe("log: c2d3m1number");
  });

  test("the API: getItemCount, selectId, getSelectedIds, getVisibleRange, scrollToId", async () => {
    show(`<App var.out=""><Table id="t" data="{${PEOPLE}}" rowsSelectable="true"><Column bindTo="name"/></Table>
      <Button label="go" onClick="t.selectId([3, 1]); t.scrollToId(3); out = t.getItemCount() + '|' + JSON.stringify(t.getVisibleRange())"/>
      <Button label="ids" onClick="out = t.getSelectedIds().join(',') + '|' + t.getSelectedItems().map(i => i.name).join(',')"/>
      <Text>out: {out}</Text></App>`);
    await click(screen.getByRole("button", { name: "go" }));
    expect(text("out:")).toBe('out: 3|{"startIndex":0,"endIndex":2}');
    await click(screen.getByRole("button", { name: "ids" }));
    expect(text("out:")).toBe("out: 3,1|Bo,Cy");
  });
});

describe("Value and Pagination", () => {
  test("Value: typed, read-only", () => {
    show(`<App><Value value="{1234.5}" type="currency(USD)" typeOptions="{{ locale: 'en-US' }}"/><Value value="ada@x.org" type="email"/><Value value="{null}" type="json"/><Value value="**b** and *i*" type="markdown"/></App>`);
    expect(screen.getByText("ada@x.org").getAttribute("href")).toBe("mailto:ada@x.org");
    expect(document.querySelector('[data-value-kind="number"]')?.textContent).toBe("$1,234.50");
    expect(screen.getByText("null")).toBeTruthy();
    expect(document.querySelector('[data-value-kind="markdown"] strong')?.textContent).toBe("b");
  });

  test("Pagination: pages, events, the API; without itemCount only previous and next", async () => {
    show(`<App var.log=""><Pagination id="p" itemCount="95" pageSize="10" maxVisiblePages="3" onPageDidChange="(i, size, count) => log += i + '/' + size + '/' + count + ';'"/>
      <Button label="last" onClick="p.moveLast(); log += 'now ' + p.currentPage + ';'"/>
      <Pagination hasNextPage="true"/><Text>log: {log}</Text></App>`);
    const [first] = screen.getAllByRole("navigation", { name: "Pagination" });
    expect(within(first!).getAllByRole("button", { name: /^Page \d/ }).map((b) => b.textContent)).toEqual(["1", "2", "3"]);
    await click(within(first!).getByRole("button", { name: "Page 2" }));
    expect(within(first!).getByRole("button", { name: "Page 2 (current)" })).toBeTruthy();
    await click(screen.getByRole("button", { name: "last" }));
    expect(text("log:")).toBe("log: 1/10/95;9/10/95;now 10;");
    expect(within(first!).getByText("Page 10 of 10 (95 items)")).toBeTruthy();
    const second = screen.getAllByRole("navigation", { name: "Pagination" })[1]!;
    expect(within(second).getAllByRole("button").map((b) => [b.getAttribute("aria-label"), (b as HTMLButtonElement).disabled])).toEqual([
      ["Previous page", true],
      ["Next page", false],
    ]);
  });
});

test("the prerender: the header, the cells and the grid", () => {
  const { html } = renderStatic(compiled(`<App><Table data="{${PEOPLE}}" rowsSelectable="true" initiallySelected="{[2]}"><Column bindTo="name" header="Name" width="2*"/><Column bindTo="total" type="number"/></Table></App>`));
  expect(html).toContain('role="columnheader"');
  expect(html).toContain(">Name<");
  expect(html).toContain("minmax(0px, 2fr)");
  expect(html).toMatch(/aria-selected="true"[^>]*>.*?Al</s);
});
