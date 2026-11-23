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
