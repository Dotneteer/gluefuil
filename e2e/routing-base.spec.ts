import { expect, test, type Page } from "@playwright/test";

// test-apps/routing-browser built with `--base /app/` (step 21, part 2): the
// router's basename comes from Vite's base. Every route lives under /app/, the
// prerendered files and their links included. Project routing-base-build.

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const ready = (page: Page) => expect(page.locator("#root[data-gfui-ready]")).toBeAttached();

test("with JavaScript disabled, each prerendered route under /app/ shows its content, with links under the base", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
  const page = await context.newPage();
  for (const [path, title, route] of [
    ["/app/", "Home", "/"],
    ["/app/about", "About", "/about"],
    ["/app/docs/intro", "Introduction", "/docs/intro"],
    ["/app/users/1", "User 1", "/users/1"],
  ]) {
    await page.goto(path!);
    await expect(heading(page)).toHaveText(title!);
    await expect(page.getByText(`Route: ${route}`)).toBeVisible();
    await expect(page.locator("#root")).toHaveAttribute("data-gfui-base", "/app");
  }
  await page.goto("/app/");
  expect(await page.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(["/app/about", "/app/docs/intro", "/app/users/7"]);
  await context.close();
});

test("takeover at /app/about reports no mismatch; links and navigate stay under the base", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.goto("/app/about");
  await ready(page);
  await expect(heading(page)).toHaveText("About");
  await expect(page.getByText("Log:")).toHaveText("Log:");

  await page.getByRole("link", { name: "Home" }).click();
  await expect(heading(page)).toHaveText("Home");
  await expect(page).toHaveURL(/\/app\/$/);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(heading(page)).toHaveText("Introduction");
  await expect(page).toHaveURL(/\/app\/docs\/intro\?q=a\+b&page=2$/);
  await page.goBack();
  await expect(heading(page)).toHaveText("Home");
  await page.getByRole("button", { name: "History back" }).click();
  await expect(heading(page)).toHaveText("About");
  await expect(page).toHaveURL(/\/app\/about$/);
  await expect(page.getByText(/^Log:/)).toHaveText("Log: / /docs/intro?q=a+b&page=2 / /about");
  expect(errors).toEqual([]);
});

test("a deep link under the base that was not prerendered renders after takeover", async ({ page }) => {
  await page.goto("/app/users/7");
  await ready(page);
  await expect(heading(page)).toHaveText("User 7");
});

test("a new tab opens the route under the base", async ({ page, context }) => {
  await page.goto("/app/");
  await ready(page);
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "About in a new tab" }).click()]);
  await expect(heading(tab)).toHaveText("About");
  expect(new URL(tab.url()).pathname).toBe("/app/about");
  await tab.close();
});
