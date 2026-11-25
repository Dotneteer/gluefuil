import { expect, test } from "@playwright/test";

// test-apps/hello (step 16): the Mantine-based components in a real browser,
// on the dev server and the prerendered build.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
});

test("a typed value round-trips through the Mantine TextInput into a variable", async ({ page }) => {
  const input = page.getByPlaceholder("Type into Mantine");
  await expect(input).toHaveClass(/mantine-Input-input/);
  await input.fill("hello mantine");
  await expect(page.getByText("Typed: hello mantine")).toBeVisible();
});

test("Select: the option template renders the options; picking updates a variable; clearing resets it", async ({ page }) => {
  await page.getByPlaceholder("Pick a fruit").click();
  await expect(page.getByText("Fruit option: Apple")).toBeVisible();
  await page.getByText("Fruit option: Cherry").click();
  await expect(page.getByText("Fruit: cherry")).toBeVisible();
  await expect(page.getByPlaceholder("Pick a fruit")).toHaveValue("Cherry");
  await page.locator(".gfui-Select button").click(); // the clear button
  await expect(page.getByText("Fruit: none")).toBeVisible();
});

test("Checkbox: clicking its label updates a variable", async ({ page }) => {
  await expect(page.getByText("Agreed: false")).toBeVisible();
  await page.getByLabel("I agree").check();
  await expect(page.getByText("Agreed: true")).toBeVisible();
});

test("Button: enabled=false disables it; the theme still controls Mantine's colors", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Disabled button" })).toBeDisabled();
  const first = page.getByRole("button", { name: "First" });
  await expect(first).toHaveClass(/mantine-Button-root/);
  expect(await first.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(37, 99, 235)");
});

test("Text variants and headings render their semantic elements", async ({ page }) => {
  await expect(page.locator("strong.gfui-Text")).toHaveText("strong");
  await expect(page.locator("kbd.gfui-Text")).toHaveText("Ctrl+C");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("gfui demo app");
  await expect(page.getByRole("heading", { level: 3, name: "A level 3 heading" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "A level 4 heading" })).toBeVisible();
});
