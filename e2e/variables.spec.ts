import { expect, test } from "@playwright/test";

// test-apps/hello (step 6): variables and handlers in a real browser.
test.beforeEach(async ({ page }) => {
  await page.goto("http://localhost:5174/");
});

test("counter", async ({ page }) => {
  const count = page.getByText(/^Count: \d+$/);
  await expect(count).toHaveText("Count: 0");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(count).toHaveText("Count: 3");
});

test("a variable follows its expression until assigned", async ({ page }) => {
  const source = page.getByText(/^source = /);
  const mirror = page.getByText(/^mirror = /);
  await page.getByRole("button", { name: "Increment source" }).click();
  await expect(source).toHaveText("source = 1");
  await expect(mirror).toHaveText("mirror = 1");
  await page.getByRole("button", { name: "Override mirror" }).click();
  await page.getByRole("button", { name: "Increment source" }).click();
  await expect(source).toHaveText("source = 2");
  await expect(mirror).toHaveText("mirror = 999");
});
