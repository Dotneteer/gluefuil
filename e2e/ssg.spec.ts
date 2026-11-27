import { expect, test, type Page } from "@playwright/test";

// Static generation and takeover (step 13), against the production build of
// test-apps/hello (prerendered at xs; project hello-build).

/**
 * Before any script runs, the page watches #root: when parsing ends
 * (readyState "interactive", before module scripts execute) it remembers every
 * prerendered node and records each later addition, removal and text change.
 */
async function watchTakeover(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { ssg: { nodes: Element[]; changes: string[] } };
    w.ssg = { nodes: [], changes: [] };
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      const root = document.getElementById("root")!;
      // Step 31: a TileGrid's prerender is a CSS grid that becomes rows of tiles once it has a width
      // (its nodes are replaced, by design); its own test measures that the tiles don't move.
      const ownNodes = (node: Node) => !(node instanceof Element ? node : node.parentElement)?.closest(".gfui-TileGrid");
      w.ssg.nodes = [...root.querySelectorAll("*")].filter(ownNodes);
      new MutationObserver((records) => {
        for (const record of records) {
          if (!ownNodes(record.target)) continue;
          if (record.type === "characterData") w.ssg.changes.push(`text: ${record.target.textContent}`);
          for (const node of record.addedNodes) w.ssg.changes.push(`+ ${node.textContent}`);
          for (const node of record.removedNodes) w.ssg.changes.push(`- ${node.textContent}`);
        }
      }).observe(root, { subtree: true, childList: true, characterData: true });
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  return {
    errors,
    changes: () => page.evaluate(() => (window as unknown as { ssg: { changes: string[] } }).ssg.changes),
    /** How many prerendered nodes are gone from the document, of how many. */
    replaced: () =>
      page.evaluate(() => {
        const { nodes } = (window as unknown as { ssg: { nodes: Element[] } }).ssg;
        return { gone: nodes.filter((node) => !node.isConnected).length, of: nodes.length };
      }),
  };
}

const ready = (page: Page) => expect(page.locator("#root[data-gfui-ready]")).toBeAttached();

test("with JavaScript disabled, the prerendered content is there", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Hello, GFUI!")).toBeVisible();
  await expect(page.getByText("Count: 0")).toBeVisible();
  await expect(page.getByText("Todo #1: Write tests")).toBeVisible();
  await expect(page.getByText("Layout: compact")).toBeVisible();
  await expect(page.getByRole("button", { name: "Increment", exact: true })).toBeVisible();
  // Step 23: Markdown's renderer is a lazy chunk; the prerender waited for it.
  await expect(page.getByRole("heading", { name: "Markdown, prerendered" })).toBeVisible();
  await expect(page.locator(".gfui-Markdown strong")).toHaveText("0");
  // Step 32: the TableOfContents lists the headings after it too (a second pass) and Markdown's (a third,
  // after its chunk); the QR code is there; the PageMetaTitle is the document's <title>.
  const toc = page.getByRole("navigation", { name: "Table of Contents" });
  await expect(toc.getByRole("link", { name: "Markdown, prerendered" })).toHaveAttribute("href", "#markdown-prerendered");
  await expect(toc.getByRole("link", { name: "Step 32 · Contents" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Hello QR code" })).toBeVisible();
  await expect(page).toHaveTitle("Hello gfui, prerendered");
  // Not live: nothing took it over.
  await expect(page.locator("#root")).toHaveAttribute("data-gfui-prerendered", "xs");
  await expect(page.locator("#root")).not.toHaveAttribute("data-gfui-ready", /.*/);
  await context.close();
});

test("at the prerendered breakpoint (xs), takeover changes nothing; then the app is live", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const takeover = await watchTakeover(page);
  await page.goto("/");
  await ready(page);
  // Let anything scheduled by the commit run.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))));

  expect(takeover.errors).toEqual([]);
  expect(await takeover.changes()).toEqual([]);
  const { gone, of } = await takeover.replaced();
  expect(of).toBeGreaterThan(40);
  expect(gone).toBe(0);
  // Step 29: the List went virtual (rows placed at measured offsets) on the prerendered row nodes.
  const list = page.locator(".gfui-List");
  await expect(list.locator(".gfui-List-content[data-virtual]")).toBeAttached();
  await expect(list.getByRole("option")).toHaveText(["First row", "Second row", "Third row"]);
  await expect(list.getByRole("option", { selected: true })).toHaveText("Second row");
  // Step 30: the Table too, and its star widths were right before takeover (CSS fr).
  const table = page.getByRole("table");
  await expect(table.locator(".gfui-Table-body[data-virtual]")).toBeAttached();
  await expect(table.getByRole("row", { selected: true })).toContainText("Grace");
  // Step 31: the Tree went virtual on its prerendered rows; the TileGrid became rows of tiles.
  const tree = page.getByRole("tree");
  await expect(tree.locator(".gfui-Tree-content[data-virtual]")).toBeAttached();
  await expect(tree.getByRole("treeitem")).toHaveText(["Folder", "Sub folder", "A file", "Other"]);
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveText("A file");
  await expect(page.locator(".gfui-TileGrid-row").first()).toBeAttached();

  // Step 32: the prerendered TableOfContents is live: a click focuses Markdown's heading.
  await page.getByRole("navigation", { name: "Table of Contents" }).getByRole("link", { name: "Markdown, prerendered" }).click();
  await expect(page.getByRole("heading", { name: "Markdown, prerendered" })).toBeFocused();

  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(page.getByText(/^Count: \d+$/)).toHaveText("Count: 1");
  // The prerendered Markdown was taken over too: its @{count} follows the variable.
  await expect(page.locator(".gfui-Markdown strong")).toHaveText("1");
  await page.getByPlaceholder("Your name").fill("Ada");
  await expect(page.getByText(/^Greeting:/)).toHaveText("Greeting: Hello, Ada!");
  expect(takeover.errors).toEqual([]);
});

test("Markdown's renderer is a chunk of its own: hydration waits for it without touching the prerendered DOM", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  // Hold the chunk until the rest of the app is live, so the takeover happens without it.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const chunks: string[] = [];
  await page.route(/markdown-render-[\w-]+\.js$/, async (route) => {
    chunks.push(route.request().url());
    await held;
    await route.continue();
  });
  const takeover = await watchTakeover(page);
  await page.goto("/");
  await ready(page);
  await expect.poll(() => chunks.length).toBe(1);
  // Live, but the Markdown is still the prerendered HTML.
  await expect(page.getByRole("heading", { name: "Markdown, prerendered" })).toBeVisible();
  release();
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(page.locator(".gfui-Markdown strong")).toHaveText("1");
  expect(takeover.errors).toEqual([]);
  expect((await takeover.changes()).filter((change) => !change.startsWith("text: "))).toEqual([]);
  expect((await takeover.replaced()).gone).toBe(0);
});

test("at desktop width, only the responsive text switches after takeover", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const takeover = await watchTakeover(page);
  await page.goto("/");
  await ready(page);
  await expect(page.getByText("Layout: wide")).toBeVisible();
  await expect(page.getByText("Layout: compact")).toHaveCount(0);

  expect(takeover.errors).toEqual([]);
  expect((await takeover.changes()).sort()).toEqual(["+ Layout: wide", "- Layout: compact"]);
  // Exactly one prerendered node (the compact Text's span) left the document.
  expect((await takeover.replaced()).gone).toBe(1);
});

test("the TileGrid's takeover: the prerendered tiles are where the virtual rows put them", async ({ browser, baseURL }) => {
  const positions = async (javaScriptEnabled: boolean) => {
    const context = await browser.newContext({ javaScriptEnabled, baseURL: baseURL!, viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    await page.goto("/");
    if (javaScriptEnabled) await expect(page.locator(".gfui-TileGrid-row").first()).toBeAttached();
    const grid = page.locator(".gfui-TileGrid");
    await grid.scrollIntoViewIfNeeded();
    const result = await grid.evaluate((g) => {
      const box = g.getBoundingClientRect();
      return [...g.querySelectorAll<HTMLElement>("[data-tile]")].slice(0, 6).map((t) => {
        const r = t.getBoundingClientRect();
        return [Number(t.dataset.tile), Math.round(r.left - box.left), Math.round(r.top - box.top), Math.round(r.width)];
      });
    });
    await context.close();
    return result;
  };
  const before = await positions(false);
  const after = await positions(true);
  expect(before).toHaveLength(6);
  expect(after).toEqual(before);
});
