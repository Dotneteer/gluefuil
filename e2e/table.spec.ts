import { expect, test, type Locator, type Page } from "@playwright/test";

// Step 30 in a real browser (project "playground"): what needs layout. 10,000
// rows (few mounted, no blank frames, scrollToId under the sticky header),
// sorting, resizing by drag and keys (measured), pinned columns while scrolling
// sideways (measured), selection, copying cells as tab-separated rows, typed
// columns and inference, editable cells, row details, paging, Pagination.
// Scenarios: playground/src/components/{Tables,TableTypes,EditableTables}Scenario.gui.

const open = async (page: Page, path: string) => {
  await page.addInitScript(() => {
    (window as unknown as { __ro: string[] }).__ro = [];
    window.addEventListener("error", (e) => {
      if (/ResizeObserver loop/i.test(String(e.message))) (window as unknown as { __ro: string[] }).__ro.push(e.message);
    }, true);
  });
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).last();
const box = async (locator: Locator) => (await locator.boundingBox())!;
const firstCells = (table: Locator, col: number) => table.locator(`.gfui-Table-body > [role=row] [role=cell][data-col="${col}"]`).allTextContents();
const header = (table: Locator, name: string) => table.getByRole("columnheader").filter({ hasText: name });

test.describe("Tables", () => {
  test("10,000 rows: few mounted, no blank frame while scrolling fast, scrollToId lands under the sticky header", async ({ page }) => {
    await open(page, "/tables");
    const table = page.getByRole("table");
    await expect(table.getByRole("row").nth(1)).toContainText("Ada 1");
    expect(await table.locator(".gfui-Table-body > [role=row]").count()).toBeLessThan(40);
    const blank = await table.evaluate(
      (t) =>
        new Promise<number>((done) => {
          let frames = 0;
          let blankFrames = 0;
          const head = t.querySelector(".gfui-Table-head")!;
          const frame = () => {
            if (frames > 0) {
              const top = head.getBoundingClientRect().bottom;
              const bottom = t.getBoundingClientRect().top + t.clientHeight;
              const boxes = [...t.querySelectorAll(".gfui-Table-body > [role=row]")].map((r) => r.getBoundingClientRect()).filter((b) => b.bottom > top && b.top < bottom).sort((a, b) => a.top - b.top);
              let y = top;
              for (const b of boxes) {
                if (b.top > y + 1) break;
                y = Math.max(y, b.bottom);
              }
              if (y < bottom - 1) blankFrames++;
            }
            if (frames++ < 60) {
              t.scrollTop += 300;
              requestAnimationFrame(frame);
            } else done(blankFrames);
          };
          requestAnimationFrame(frame);
        }),
    );
    expect(blank).toBe(0);
    await page.getByRole("button", { name: "Row 5000" }).click();
    const row = table.getByRole("row").filter({ hasText: "Ada 5000" }).or(table.getByRole("row").filter({ hasText: /^5,000/ }));
    await expect(table.locator('[role=row][aria-rowindex="5001"]')).toBeVisible();
    await expect.poll(async () => Math.round((await box(table.locator('[role=row][aria-rowindex="5001"]'))).y - (await box(table.locator(".gfui-Table-head"))).y - (await box(table.locator(".gfui-Table-head"))).height)).toBe(0);
    expect(row).toBeTruthy();
    expect(await page.evaluate(() => (window as unknown as { __ro: string[] }).__ro.length)).toBe(0);
  });

  test("sorting: a click on Customer sorts ascending; Total's first click is descending; Enter on a header sorts", async ({ page }) => {
    await open(page, "/tables");
    const table = page.getByRole("table");
    await header(table, "Customer").getByRole("button").click();
    await expect(header(table, "Customer")).toHaveAttribute("aria-sort", "ascending");
    // The locale's collation, not numeric: Ada's rows are 1, 6, 11, … so 1001 follows 1.
    expect((await firstCells(table, 1)).slice(0, 3)).toEqual(["Ada 1", "Ada 1001", "Ada 1006"]);
    await expect(page.getByText("Sorting: customer ascending")).toBeVisible();
    await header(table, "Total").getByRole("button").focus();
    await page.keyboard.press("Enter");
    await expect(header(table, "Total")).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByText("Sorting: total descending")).toBeVisible();
    const totals = (await firstCells(table, 4)).slice(0, 5).map((t) => Number(t.replace(/[^\d.]/g, "")));
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    expect(totals[0]).toBeGreaterThan(999);
  });

  test("resizing: dragging a header's edge (measured), the arrow keys; every row follows", async ({ page }) => {
    await open(page, "/tables");
    const table = page.getByRole("table");
    const city = header(table, "City");
    const before = (await box(city)).width;
    const handle = city.getByRole("separator");
    const h = await box(handle);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 80, h.y + h.height / 2, { steps: 5 });
    await page.mouse.up();
    const after = (await box(city)).width;
    expect(Math.abs(after - before - 80)).toBeLessThanOrEqual(2);
    const cells = await table.locator('.gfui-Table-body [role=cell][data-col="2"]').evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().width)));
    expect(new Set(cells)).toEqual(new Set([Math.round(after)]));
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => Math.round((await box(city)).width)).toBe(Math.round(after) + 10);
  });

  test("pinned columns stay at the edges while the table scrolls sideways (measured)", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await open(page, "/tables");
    const table = page.getByRole("table");
    await expect.poll(() => table.evaluate((t) => t.scrollWidth > t.clientWidth)).toBe(true);
    await table.evaluate((t) => (t.scrollLeft = 250));
    const frame = await box(table);
    const clientWidth = await table.evaluate((t) => t.clientWidth);
    const row = table.locator(".gfui-Table-body > [role=row]").first();
    const select = await box(row.locator(".gfui-Table-selectCell"));
    const id = await box(row.locator('[data-col="0"]'));
    const status = await box(row.locator('[data-col="5"]'));
    expect(Math.round(select.x - frame.x)).toBe(0);
    expect(Math.round(id.x - (select.x + select.width))).toBe(0);
    expect(Math.round(frame.x + clientWidth - (status.x + status.width))).toBe(0);
    const customer = await box(row.locator('[data-col="1"]'));
    expect(customer.x).toBeLessThan(id.x + id.width);
  });

  test("selection: a click, Shift click, the arrow keys, the header checkbox selects all 10,000", async ({ page }) => {
    await open(page, "/tables");
    const table = page.getByRole("table");
    const row = (text: string) => table.getByRole("row").filter({ hasText: text }).first();
    await row("Grace 2").click();
    await row("Alan 5").click({ modifiers: ["Shift"] });
    await expect(page.getByText("Selected: 4 (2, 3, 4, 5)")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Selected: 1 (6)")).toBeVisible();
    await expect(row("Ada 6")).toHaveAttribute("aria-selected", "true");
    await table.getByRole("checkbox", { name: "Select all rows" }).check();
    await expect(page.getByText(/^Selected: 10000 /)).toBeVisible();
    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(page.getByText("Selected: 0 ()")).toBeVisible();
  });

  test("copying a selection across cells gives tab-separated cells, a line per row", async ({ page }) => {
    await open(page, "/tables");
    const copied = await page.getByRole("table").evaluate((t) => {
      const from = t.querySelector('.gfui-Table-body [aria-rowindex="2"] [data-col="1"]')!;
      const to = t.querySelector('.gfui-Table-body [aria-rowindex="3"] [data-col="2"]')!;
      const range = document.createRange();
      range.setStart(from.firstChild!, 0);
      range.setEnd(to.firstChild!.firstChild ?? to.firstChild!, 1);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
      from.dispatchEvent(event);
      return event.clipboardData!.getData("text/plain");
    });
    // As in a native table, the second row starts at its first cell (the checkbox column isn't copied).
    expect(copied.split("\n").map((line) => line.split("\t"))).toEqual([
      ["Ada 1", "Oslo", "lorem ipsum dolor", "€0.00", "open"],
      ["2", "Grace 2", "Lima"],
    ]);
  });
});

test.describe("Table columns and types", () => {
  test("inferred columns with their types; every type renders; the table scrolls sideways", async ({ page }) => {
    await open(page, "/table-types");
    const inferred = card(page, "Inferred columns").getByRole("table");
    await expect(inferred.getByRole("columnheader")).toHaveText(["id", "customer", "email", "website", "joined", "total", "paid", "tags", "status"]);
    await expect(inferred.getByRole("link", { name: "ada@example.com" })).toHaveAttribute("href", "mailto:ada@example.com");
    await expect(inferred.locator('[data-col="5"][role=cell]').first()).toHaveAttribute("data-align", "end");
    expect(await inferred.evaluate((t) => t.scrollWidth > t.clientWidth)).toBe(true);
    const types = card(page, "Every type (Value)").getByRole("table");
    // The table scrolls with the page: a row below the window is mounted once the page scrolls to it.
    const value = async (type: string) => {
      const cell = types.getByRole("row").filter({ has: page.getByRole("cell", { name: type, exact: true }) }).locator('[data-col="1"]');
      for (let i = 0; i < 40 && (await cell.count()) === 0; i++) await page.mouse.wheel(0, 300);
      await cell.scrollIntoViewIfNeeded();
      return cell;
    };
    await expect(await value("currency(EUR)")).toHaveText("€1,234.50");
    await expect(await value("percent")).toHaveText("13%"); // Intl's percent: no fraction digits by default (as XMLUI)
    await expect(await value("bytes")).toHaveText("1.5 MB");
    await expect((await value("avatar")).locator("img")).toHaveCSS("border-radius", "50%");
    await expect(await value("list")).toHaveText("one, two");
  });
});

test.describe("Editable and paged tables", () => {
  test("a switch, a checkbox and a color save through the variable; willChange keeps a locked row on", async ({ page }) => {
    await open(page, "/editable-tables");
    const table = card(page, "Editable cells").getByRole("table");
    const row = (name: string) => table.getByRole("row").filter({ hasText: name });
    // Mantine draws the switch as a track over a hidden input: a user clicks the track.
    const toggle = (name: string) => row(name).locator(".mantine-Switch-track").click();
    await toggle("Search");
    await expect(page.getByText("Last change: enabled of Search: false")).toBeVisible();
    await expect(row("Search").getByRole("switch", { name: "Enabled" })).not.toBeChecked();
    await toggle("Export");
    await expect(row("Export").getByRole("switch", { name: "Enabled" })).toBeChecked();
    await toggle("Export");
    await expect(page.getByText("Last change: enabled of Export: true")).toBeVisible();
    await expect(row("Export").getByRole("switch", { name: "Enabled" })).toBeChecked();
    await row("Search").getByRole("checkbox", { name: "Reviewed" }).check();
    await expect(page.getByText("Last change: reviewed of Search: true")).toBeVisible();
    await row("Sharing").getByLabel("Accent").fill("#000000");
    await expect(page.getByText("Last change: accent of Sharing: #000000")).toBeVisible();
  });

  test("a row's details open under it and push the next row down", async ({ page }) => {
    await open(page, "/editable-tables");
    const table = card(page, "Editable cells").getByRole("table");
    const next = table.getByRole("row").filter({ hasText: "Export" });
    const before = (await box(next)).y;
    await table.getByRole("row").filter({ hasText: "Search" }).getByRole("button", { name: "Expand row" }).click();
    await expect(table.getByText("Search is on.")).toBeVisible();
    await expect.poll(async () => (await box(next)).y).toBeGreaterThan(before + 10);
  });

  test("paging: next, the page size; Pagination on its own", async ({ page }) => {
    await open(page, "/editable-tables");
    const paged = card(page, "Paged");
    await expect(paged.getByText("Page 1 of 6 (57 items)")).toBeVisible();
    await paged.getByRole("button", { name: "Next page" }).click();
    await expect(paged.getByRole("row").nth(1)).toContainText("11");
    await paged.getByLabel("Items per page").selectOption("25");
    await expect(paged.getByText("Page 1 of 3 (57 items)")).toBeVisible();
    const pagination = card(page, "Pagination");
    await pagination.getByRole("button", { name: "Page 3" }).click();
    await expect(pagination.getByText("Page: 3")).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Page 3 (current)" })).toBeVisible();
  });
});
