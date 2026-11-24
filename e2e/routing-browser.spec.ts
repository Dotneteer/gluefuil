import { expect, test, type Page } from "@playwright/test";

// test-apps/routing-browser (step 21): browser routing, every static route
// prerendered into its own file (about/index.html, …), a navigation guard
// (willNavigate) and a log (didNavigate). Project routing-browser-build: the
// production build on `vite preview`, which serves about/index.html for
// /about and index.html for any other unknown path.

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const ready = (page: Page) => expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
const log = (page: Page) => page.getByText(/^Log:/);

/** Records every h1 text that appears after the call (to prove a page never rendered). */
async function watchHeadings(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { headings: string[] };
    w.headings = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          for (const h1 of node.matches("h1") ? [node] : [...node.querySelectorAll("h1")]) w.headings.push(h1.textContent ?? "");
        }
      }
    }).observe(document.getElementById("root")!, { subtree: true, childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { headings: string[] }).headings);
}

test("with JavaScript disabled, each prerendered route shows its own content", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
  const page = await context.newPage();
  for (const [path, title] of [
    ["/", "Home"],
    ["/about", "About"],
    ["/docs/intro", "Introduction"],
    ["/users/1", "User 1"],
  ]) {
    await page.goto(path!);
    await expect(heading(page)).toHaveText(title!);
    await expect(page.getByText(`Route: ${path}`)).toBeVisible();
    await expect(page.locator("#root")).toHaveAttribute("data-pfui-path", path!);
  }
  await context.close();
});

test("takeover of a prerendered route changes nothing; then the app is live", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.addInitScript(() => {
    const w = window as unknown as { changes: string[] };
    w.changes = [];
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "interactive") return;
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "characterData") w.changes.push(`text: ${record.target.textContent}`);
          for (const node of record.addedNodes) w.changes.push(`+ ${node.textContent}`);
          for (const node of record.removedNodes) w.changes.push(`- ${node.textContent}`);
        }
      }).observe(document.getElementById("root")!, { subtree: true, childList: true, characterData: true });
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.goto("/about");
  await ready(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))));
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { changes: string[] }).changes)).toEqual([]);

  await page.getByRole("link", { name: "Home" }).click();
  await expect(heading(page)).toHaveText("Home");
  await expect(page).toHaveURL(/\/$/);
});

test("links and navigate() move without a page load; didNavigate logs each move, not the first load", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => ((window as unknown as { marker: boolean }).marker = true));
  await expect(log(page)).toHaveText("Log:");

  await page.getByRole("link", { name: "About" }).click();
  await expect(heading(page)).toHaveText("About");
  await expect(page).toHaveURL(/\/about$/);
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(heading(page)).toHaveText("Introduction");
  await expect(page.getByText('Query: {"q":"a b","page":"2"}')).toBeVisible();
  await expect(page).toHaveURL(/\/docs\/intro\?q=a\+b&page=2$/);
  await page.goBack();
  await expect(heading(page)).toHaveText("Home");
  await expect(log(page)).toHaveText("Log: /about / /docs/intro?q=a+b&page=2 /");
  // Still the same document.
  expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);
});

test("the guard blocks a link, a button and the back button; the blocked page never renders", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("link", { name: "About" }).click();
  await expect(heading(page)).toHaveText("About");
  const length = await page.evaluate(() => history.length);

  await page.getByRole("button", { name: "Navigation allowed" }).click();
  await expect(page.getByRole("button", { name: "Navigation blocked" })).toBeVisible();
  const headings = await watchHeadings(page);

  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("button", { name: "Go home" }).click();
  await page.goBack();
  // Let the guard decide and the URL be restored.
  await page.waitForTimeout(200);
  await expect(heading(page)).toHaveText("About");
  await expect(page).toHaveURL(/\/about$/);
  expect(await headings()).toEqual([]);
  expect(await page.evaluate(() => history.length)).toBe(length);

  // Allowed again: back and forward still work, with no extra entries.
  await page.getByRole("button", { name: "Navigation blocked" }).click();
  await page.goBack();
  await expect(heading(page)).toHaveText("Home");
  await page.goForward();
  await expect(heading(page)).toHaveText("About");
  expect(await page.evaluate(() => history.length)).toBe(length);
  await expect(log(page)).toHaveText("Log: /about / /about");
});

test("a deep link to a route that was not prerendered renders after takeover", async ({ page }) => {
  await page.goto("/users/7");
  await ready(page);
  await expect(heading(page)).toHaveText("User 7");
  await expect(log(page)).toHaveText("Log:");
});

// Step 21, part 2: navigate(-1) and a new tab, in browser mode.

test("navigate(-1) and a new tab, with browser routing", async ({ page, context }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("link", { name: "About" }).click();
  await expect(heading(page)).toHaveText("About");
  await page.getByRole("button", { name: "History back" }).click();
  await expect(heading(page)).toHaveText("Home");
  await expect(page).toHaveURL(/\/$/);

  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "About in a new tab" }).click()]);
  await expect(heading(tab)).toHaveText("About");
  expect(new URL(tab.url()).pathname).toBe("/about");
  await expect(heading(page)).toHaveText("Home");
  await tab.close();
});
