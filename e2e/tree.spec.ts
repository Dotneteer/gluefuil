import { expect, test, type Locator, type Page } from "@playwright/test";

// Step 31 in a real browser (project "playground"): what needs layout. A Tree of
// 50,000 nodes (expand all, a fast scroll with no blank viewport, scrollIntoView,
// the time a toggle takes), keys and the focused row kept mounted, lazy loading
// with the spinner delay, a saved state, preserve-state; a TileGrid of 10,000
// tiles (columns from the width, the place kept when they change, 2-D keys,
// selection shared through a variable). Scenarios:
// playground/src/components/{Trees,LazyTrees,TileGrids}Scenario.gui.

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
const resizeLoopErrors = (page: Page) => page.evaluate(() => (window as unknown as { __ro: string[] }).__ro.length);

/** Frames of a fast scroll (60 at `step` px) in which the box's viewport is not covered by `selector` elements. */
const blankFrames = (box: Locator, selector: string, step: number) =>
  box.evaluate(
    (l, [sel, dy]) =>
      new Promise<number>((done) => {
        let frames = 0;
        let blank = 0;
        const frame = () => {
          if (frames > 0) {
            const v = l.getBoundingClientRect();
            const bottom = v.top + l.clientHeight;
            const boxes = [...l.querySelectorAll(sel as string)].map((r) => r.getBoundingClientRect()).filter((b) => b.bottom > v.top && b.top < bottom).sort((a, b) => a.top - b.top);
            let y = v.top;
            for (const b of boxes) {
              if (b.top > y + 9) break;
              y = Math.max(y, b.bottom);
            }
            if (y < bottom - 9) blank++;
          }
          if (frames++ < 60) {
            l.scrollTop += dy as number;
            requestAnimationFrame(frame);
          } else done(blank);
        };
        requestAnimationFrame(frame);
      }),
    [selector, step] as const,
  );

test.describe("Trees", () => {
  const bigTree = (page: Page) => card(page, "50,000 nodes").locator(".gfui-Tree-scroll");

  test("50,000 nodes: expand all; few rows mounted; a fast scroll never shows a blank viewport; a toggle's time", async ({ page }) => {
    await open(page, "/trees");
    const section = card(page, "50,000 nodes");
    const tree = bigTree(page);
    await tree.scrollIntoViewIfNeeded();
    await expect(tree.getByRole("treeitem")).toHaveCount(10);
    await section.getByRole("button", { name: "Expand all (big)" }).click();
    await expect(tree.getByRole("treeitem", { name: "Node 10", exact: true })).toBeVisible();
    expect(await tree.getByRole("treeitem").count()).toBeLessThan(40);
    expect(await blankFrames(tree, ".gfui-Tree-row", 600)).toBe(0);
    // A collapse of a node with 40,000 visible descendants, timed to the next painted frame.
    await tree.evaluate((l) => (l.scrollTop = 0));
    const gutter = tree.getByRole("treeitem", { name: "Node 0", exact: true }).locator(".gfui-Tree-gutter");
    await expect(gutter).toBeVisible();
    const ms = await gutter.evaluate(
      (g) =>
        new Promise<number>((done) => {
          const t = performance.now();
          (g as HTMLElement).click();
          requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(performance.now() - t))));
        }),
    );
    test.info().annotations.push({ type: "toggle-ms", description: `collapsing Node 0 with all 50,000 nodes expanded: ${ms} ms to the next frame` });
    console.log(`[tree] collapsing Node 0 with all 50,000 nodes expanded: ${ms} ms`);
    await expect(tree.getByRole("treeitem", { name: "Node 0", exact: true })).toHaveAttribute("aria-expanded", "false");
    expect(ms).toBeLessThan(1000);
    expect(await resizeLoopErrors(page)).toBe(0);
  });

  test("scrollIntoView opens the path and lands on a deep node, which is selected", async ({ page }) => {
    await open(page, "/trees");
    const tree = bigTree(page);
    await tree.scrollIntoViewIfNeeded();
    await card(page, "50,000 nodes").getByRole("button", { name: "Show node 49999" }).click();
    const target = tree.getByRole("treeitem", { name: "Node 49999", exact: true });
    await expect(target).toBeInViewport();
    await expect(target).toHaveAttribute("aria-selected", "true");
    await expect(target).toHaveAttribute("aria-level", "6");
  });

  test("keys: arrows, Right and Left, Enter; the focused row stays mounted after scrolling away", async ({ page }) => {
    await open(page, "/trees");
    const tree = bigTree(page);
    await tree.scrollIntoViewIfNeeded();
    await card(page, "50,000 nodes").getByRole("button", { name: "Expand all (big)" }).click();
    await tree.getByRole("treeitem", { name: "Node 0", exact: true }).locator(".gfui-Tree-label").click();
    await page.keyboard.press("ArrowDown");
    const node10 = tree.getByRole("treeitem", { name: "Node 10", exact: true });
    await expect(node10).toBeFocused();
    // Scroll far away: the focused row is still in the DOM, so the keys keep working from it.
    await tree.evaluate((l) => (l.scrollTop = 200_000));
    await expect(tree.getByRole("treeitem", { name: "Node 10", exact: true })).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await expect(tree.getByRole("treeitem", { name: "Node 70", exact: true })).toBeFocused();
    await expect(tree.getByRole("treeitem", { name: "Node 70", exact: true })).toBeInViewport();
    // Left collapses an expanded node first (Node 70 has children), then goes to the parent, then collapses it.
    await page.keyboard.press("ArrowLeft");
    await expect(tree.getByRole("treeitem", { name: "Node 70", exact: true })).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowLeft");
    await expect(node10).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(node10).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(node10).toHaveAttribute("aria-expanded", "true");
    await expect(node10).toHaveAttribute("aria-selected", "true");
  });

  test("the file tree: the selection follows the variable; Delete reports the focused node; edits", async ({ page }) => {
    await open(page, "/trees");
    const section = card(page, "Files");
    const tree = section.locator(".gfui-Tree-scroll");
    await expect(tree.getByRole("treeitem", { name: "Q1 report.pdf" })).toHaveAttribute("aria-selected", "true");
    await section.getByRole("button", { name: "Select Invoice 001" }).click();
    await expect(tree.getByRole("treeitem", { name: "Invoice 001.pdf" })).toHaveAttribute("aria-selected", "true");
    await tree.getByRole("treeitem", { name: "Projects" }).click();
    await expect(section.getByText("Selected: code")).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(section.getByText("Log: Delete on Projects")).toBeVisible();
    await section.getByRole("button", { name: "Add a file here" }).click();
    await expect(tree.getByRole("treeitem", { name: "New file 1.txt" })).toBeVisible();
    await tree.getByRole("treeitem", { name: "System (not selectable)" }).click();
    await expect(section.getByText("Selected: code")).toBeVisible();
  });
});

test.describe("Lazy trees", () => {
  test("children load on expand, with the spinner after its delay; Reload loads them again", async ({ page }) => {
    await open(page, "/lazy-trees");
    const section = card(page, "Loading on expand");
    const tree = section.locator(".gfui-Tree-scroll");
    const projects = tree.getByRole("treeitem", { name: "Projects", exact: true });
    await projects.locator(".gfui-Tree-gutter").click();
    await expect(projects).toHaveAttribute("aria-busy", "true");
    await expect(projects.getByRole("status", { name: "Loading" })).toBeVisible();
    await expect(tree.getByRole("treeitem", { name: "Projects item 1 (load 1)" })).toBeVisible();
    await expect(projects).not.toHaveAttribute("aria-busy", "true");
    await section.getByRole("button", { name: "Reload Projects" }).click();
    await expect(projects).toHaveAttribute("aria-expanded", "false");
    await projects.locator(".gfui-Tree-gutter").click();
    await expect(tree.getByRole("treeitem", { name: "Projects item 1 (load 2)" })).toBeVisible();
  });

  test("a saved state restores expansion and selection", async ({ page }) => {
    await open(page, "/lazy-trees");
    const section = card(page, "Loading on expand");
    const tree = section.locator(".gfui-Tree-scroll");
    await tree.getByRole("treeitem", { name: "Static folder" }).locator(".gfui-Tree-gutter").click();
    await tree.getByRole("treeitem", { name: "A static child" }).click();
    await section.getByRole("button", { name: "Save state" }).click();
    await section.getByRole("button", { name: "Collapse all" }).click();
    await expect(tree.getByRole("treeitem", { name: "A static child" })).toHaveCount(0);
    await section.getByRole("button", { name: "Restore state" }).click();
    await expect(tree.getByRole("treeitem", { name: "A static child" })).toHaveAttribute("aria-selected", "true");
  });

  test("new data: reset starts over, preserve-state keeps the open root", async ({ page }) => {
    await open(page, "/lazy-trees");
    const section = card(page, "New data: reset and preserve-state");
    for (const tree of await section.locator(".gfui-Tree-scroll").all()) await tree.getByRole("treeitem", { name: "Root" }).locator(".gfui-Tree-gutter").click();
    await section.getByRole("button", { name: "Add an item", exact: true }).click();
    const [reset, kept] = await section.locator(".gfui-Tree-scroll").all();
    await expect(kept!.getByRole("treeitem", { name: "Inserted 4" })).toBeVisible();
    await expect(reset!.getByRole("treeitem")).toHaveCount(1);
    await reset!.getByRole("treeitem", { name: "Root" }).locator(".gfui-Tree-gutter").click();
    await section.getByRole("button", { name: "Add, keeping the left tree" }).click();
    await expect(reset!.getByRole("treeitem", { name: "Inserted 5" })).toBeVisible();
  });
});

test.describe("Tile grids", () => {
  const grid = (page: Page) => card(page, "10,000 tiles").locator(".gfui-TileGrid");
  const perRow = (g: Locator) => g.locator(".gfui-TileGrid-row").first().locator(".gfui-TileGrid-tile").count();
  const tileTop = (g: Locator, index: number) =>
    g.evaluate((l, i) => {
      const t = l.querySelector(`[data-tile="${i}"]`);
      return t ? Math.round(t.getBoundingClientRect().top - l.getBoundingClientRect().top) : null;
    }, index);

  test("10,000 tiles: rows of tiles from the width; few mounted; a fast scroll never shows a blank viewport", async ({ page }) => {
    await open(page, "/tile-grids");
    const g = grid(page);
    await expect(g.locator(".gfui-TileGrid-row").first()).toBeVisible();
    // 860px wide, minus the scrollbar; tiles of 120px with an 8px gap.
    const width = await g.evaluate((l) => l.clientWidth);
    expect(await perRow(g)).toBe(Math.floor((width + 8) / 128));
    expect(await g.locator(".gfui-TileGrid-tile").count()).toBeLessThan(80);
    expect(await blankFrames(g, ".gfui-TileGrid-row", 600)).toBe(0);
    await expect(g.getByRole("row").first().getByRole("gridcell").first()).toBeVisible();
    expect(await resizeLoopErrors(page)).toBe(0);
  });

  test("narrowing keeps the first tile in view; stretch fills the row", async ({ page }) => {
    await open(page, "/tile-grids");
    const section = card(page, "10,000 tiles");
    const g = grid(page);
    await section.getByRole("button", { name: "Select p5000" }).click();
    await expect.poll(() => tileTop(g, 5000)).not.toBeNull();
    const first = await g.evaluate((l) => {
      const top = l.getBoundingClientRect().top;
      return Math.min(...[...l.querySelectorAll<HTMLElement>("[data-tile]")].filter((t) => t.getBoundingClientRect().top >= top - 1).map((t) => Number(t.dataset.tile)));
    });
    const before = await perRow(g);
    await section.getByRole("button", { name: "Narrow" }).click();
    await expect.poll(() => perRow(g)).toBeLessThan(before);
    await expect.poll(() => tileTop(g, first)).not.toBeNull();
    const top = await tileTop(g, first);
    const height = await g.evaluate((l) => l.clientHeight);
    test.info().annotations.push({ type: "resize", description: `tile ${first}: top ${top} after ${before} → ${await perRow(g)} columns` });
    expect(top!).toBeGreaterThanOrEqual(-100);
    expect(top!).toBeLessThan(height);
    await section.getByRole("button", { name: "Stretch" }).click();
    const fill = await g.evaluate((l) => {
      const row = l.querySelector(".gfui-TileGrid-row")!;
      const tiles = [...row.querySelectorAll(".gfui-TileGrid-tile")];
      return Math.round(tiles.at(-1)!.getBoundingClientRect().right - l.getBoundingClientRect().left - l.clientWidth);
    });
    expect(Math.abs(fill)).toBeLessThanOrEqual(1);
  });

  test("2-D keys, Shift extends, Space toggles; the small grid shares the selection; Ctrl/Cmd+A and Delete report", async ({ page }) => {
    await open(page, "/tile-grids");
    const section = card(page, "10,000 tiles");
    const g = grid(page);
    const cols = await perRow(g);
    await g.locator('[data-tile="0"]').click();
    await page.keyboard.press("ArrowDown");
    await expect(g.locator(`[data-tile="${cols}"]`)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(section.getByText(`Selected: 2 (p${cols}, p${cols + 1})`)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(section.getByText(`Selected: 1 (p${cols})`)).toBeVisible();
    const small = card(page, "The same selection (syncWithVar)").locator(".gfui-TileGrid");
    await small.locator('[data-tile="2"]').getByRole("checkbox").check();
    await expect(section.getByText(`Selected: 2 (p${cols}, p2)`)).toBeVisible();
    await expect(g.locator('[data-tile="2"]')).toHaveAttribute("aria-selected", "true");
    await g.locator('[data-tile="3"]').dblclick();
    await expect(section.getByText("Log: opened Photo 3 at 3")).toBeVisible();
    await g.focus();
    await page.keyboard.press("ControlOrMeta+a");
    await expect(section.getByText("Log: all 10000 selected")).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(section.getByText("Log: delete 10000 (focused Photo 3)")).toBeVisible();
  });
});
