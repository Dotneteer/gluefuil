import { expect, test } from "@playwright/test";

// test-apps/routing (step 19): a dashboard of buttons and links, each opening
// a page. Runs on the dev server and the prerendered build (hash routing:
// the static server needs no configuration).

const heading = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 1 });

test("buttons and links navigate; route parameters and query show; back and forward work", async ({ page }) => {
  await page.goto("/");
  await expect(heading(page)).toHaveText("Dashboard");

  await page.getByRole("button", { name: "Greeting scenario" }).click();
  await expect(heading(page)).toHaveText("Scenario: greeting");
  await expect(page).toHaveURL(/#\/scenarios\/greeting$/);
  await expect(page.getByText("Route: /scenarios/greeting")).toBeVisible();

  await page.goBack();
  await expect(heading(page)).toHaveText("Dashboard");
  await page.goForward();
  await expect(heading(page)).toHaveText("Scenario: greeting");

  await page.getByRole("link", { name: "Back to the dashboard" }).click();
  await page.getByRole("link", { name: "A link to an unknown scenario" }).click();
  await expect(heading(page)).toHaveText("Scenario: unknown");
  await expect(page.getByText('Query: {"from":"link"}')).toBeVisible();
});

test("a static route wins over the parameterized one listed after it; its page starts fresh each visit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Counter scenario" }).click();
  await expect(heading(page)).toHaveText("Counter scenario");
  await page.getByRole("button", { name: "Clicked 0 times" }).click();
  await expect(page.getByRole("button", { name: "Clicked 1 times" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the dashboard" }).click();
  await page.getByRole("button", { name: "Counter scenario" }).click();
  await expect(page.getByRole("button", { name: "Clicked 0 times" })).toBeVisible();
});

test("a deep link opens its page (after takeover, in the prerendered build)", async ({ page }) => {
  await page.goto("/#/scenarios/deep");
  await expect(heading(page)).toHaveText("Scenario: deep");
});

test("an unknown route falls back to the dashboard", async ({ page }) => {
  await page.goto("/#/no/such/route");
  await expect(heading(page)).toHaveText("Dashboard");
  await expect(page).toHaveURL(/#\/$/);
});

// Step 21: navigation events in hash mode (the fixture's guard and log).

test("didNavigate logs every navigation, not the first load; the fallback redirect is logged too", async ({ page }) => {
  await page.goto("/#/no/such/route");
  await expect(heading(page)).toHaveText("Dashboard");
  await page.getByRole("button", { name: "Greeting scenario" }).click();
  await page.goBack();
  await expect(heading(page)).toHaveText("Dashboard");
  await expect(page.getByText(/^Log:/)).toHaveText("Log: / /scenarios/greeting /");
});

test("the guard blocks a button, a link, the back button and a typed hash; nothing renders, no history entry is added", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Greeting scenario" }).click();
  await expect(heading(page)).toHaveText("Scenario: greeting");
  const length = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Navigation allowed" }).click();
  await page.evaluate(() => {
    const w = window as unknown as { headings: string[] };
    w.headings = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof Element) for (const h1 of node.matches("h1") ? [node] : [...node.querySelectorAll("h1")]) w.headings.push(h1.textContent ?? "");
    }).observe(document.getElementById("root")!, { subtree: true, childList: true });
  });

  await page.getByRole("link", { name: "Back to the dashboard" }).click();
  await page.goBack();
  await page.evaluate(() => (location.hash = "#/scenarios/typed"));
  await page.waitForTimeout(200);
  await expect(heading(page)).toHaveText("Scenario: greeting");
  await expect(page).toHaveURL(/#\/scenarios\/greeting$/);
  expect(await page.evaluate(() => (window as unknown as { headings: string[] }).headings)).toEqual([]);

  await page.getByRole("button", { name: "Navigation blocked" }).click();
  await page.goBack();
  await expect(heading(page)).toHaveText("Dashboard");
  await page.goForward();
  await expect(heading(page)).toHaveText("Scenario: greeting");
  // The refused typed hash stays as a forward entry (the browser added it); nothing else was added.
  expect(await page.evaluate(() => history.length)).toBe(length + 1);
});

// Step 21, part 2: navigate(-1) and navigate(to, { target: "_blank" }).

test("navigate(-1) goes back as the back button does, and the guard holds it", async ({ page }) => {
  await page.goto("/");
  await expect(heading(page)).toHaveText("Dashboard");
  await page.getByRole("button", { name: "Counter scenario" }).click();
  await expect(heading(page)).toHaveText("Counter scenario");
  await page.getByRole("button", { name: "History back" }).click();
  await expect(heading(page)).toHaveText("Dashboard");
  await page.goForward();
  await expect(heading(page)).toHaveText("Counter scenario");
  const length = await page.evaluate(() => history.length);

  await page.getByRole("button", { name: "Navigation allowed" }).click();
  await page.getByRole("button", { name: "History back" }).click();
  await page.waitForTimeout(200);
  await expect(heading(page)).toHaveText("Counter scenario");
  await expect(page).toHaveURL(/#\/scenarios\/counter$/);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await expect(page.getByText(/^Log:/)).toHaveText("Log: /scenarios/counter / /scenarios/counter");
});

test("navigate(to, { target: '_blank' }) opens the route's hash URL in a new tab, without an opener; this page stays", async ({ page, context }) => {
  await page.goto("/");
  await expect(heading(page)).toHaveText("Dashboard");
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Counter in a new tab" }).click()]);
  await expect(heading(tab)).toHaveText("Counter scenario");
  expect(new URL(tab.url()).hash).toBe("#/scenarios/counter");
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  await expect(heading(page)).toHaveText("Dashboard");
  await expect(page.getByText(/^Log:/)).toHaveText("Log:");
  await tab.close();
});
