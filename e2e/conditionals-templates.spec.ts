import { expect, test } from "@playwright/test";

// test-apps/hello (step 10): responsive `when` and Items.
test("a responsive when follows the viewport size", async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 900 });
  await page.goto("http://localhost:5174/");
  await expect(page.getByText(/^Layout: /)).toHaveText("Layout: compact");
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(page.getByText(/^Layout: /)).toHaveText("Layout: wide");
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByText(/^Layout: /)).toHaveText("Layout: compact");
});

test("Items renders, adds and removes items with $item and $itemIndex", async ({ page }) => {
  await page.goto("http://localhost:5174/");
  const todos = page.getByText(/^Todo #/);
  await expect(todos).toHaveText(["Todo #1: Write tests"]);
  await page.getByRole("button", { name: "Add todo" }).click();
  await page.getByRole("button", { name: "Add todo" }).click();
  await expect(todos).toHaveText(["Todo #1: Write tests", "Todo #2: Todo 2", "Todo #3: Todo 3"]);
  await page.getByRole("button", { name: "Remove Todo 2" }).click();
  await expect(todos).toHaveText(["Todo #1: Write tests", "Todo #2: Todo 3"]);
});
