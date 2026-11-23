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
      w.ssg.nodes = [...root.querySelectorAll("*")];
      new MutationObserver((records) => {
        for (const record of records) {
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

const ready = (page: Page) => expect(page.locator("#root[data-pfui-ready]")).toBeAttached();

test("with JavaScript disabled, the prerendered content is there", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Hello, PFUI!")).toBeVisible();
  await expect(page.getByText("Count: 0")).toBeVisible();
  await expect(page.getByText("Todo #1: Write tests")).toBeVisible();
  await expect(page.getByText("Layout: compact")).toBeVisible();
  await expect(page.getByRole("button", { name: "Increment", exact: true })).toBeVisible();
  // Not live: nothing took it over.
  await expect(page.locator("#root")).toHaveAttribute("data-pfui-prerendered", "xs");
  await expect(page.locator("#root")).not.toHaveAttribute("data-pfui-ready", /.*/);
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

  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(page.getByText(/^Count: \d+$/)).toHaveText("Count: 1");
  await page.getByPlaceholder("Your name").fill("Ada");
  await expect(page.getByText(/^Greeting:/)).toHaveText("Greeting: Hello, Ada!");
  expect(takeover.errors).toEqual([]);
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
