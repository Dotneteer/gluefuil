import { expect, test } from "@playwright/test";

// test-apps/hello (step 18): behaviors in a real browser, on the dev server
// and the prerendered build.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
});

test("tooltip: appears while the pointer is over the button", async ({ page }) => {
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveCount(0);
  await page.getByRole("button", { name: "Hover me" }).hover();
  await expect(tooltip).toHaveText("A tooltip from the tooltip behavior");
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});

test("label: the input is found by its label, and typing works", async ({ page }) => {
  const input = page.getByLabel("Labeled input");
  await input.fill("hello");
  await expect(input).toHaveValue("hello");
});

test("variant: a variant Button takes its color from the enclosing Theme; an undefined variant falls back", async ({ page }) => {
  const background = (name: string) => page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background("Danger variant")).toBe("rgb(185, 28, 28)");
  expect(await background("Unknown variant")).toBe("rgb(37, 99, 235)");
});
