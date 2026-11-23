import { expect, test, type Page } from "@playwright/test";

// test-apps/hello (step 14): the examples of XMLUI's user-defined-components.md,
// as component files (src/components/*.pfui, Counter with code-behind) and one
// inline component in Main.pfui. Runs against the dev server and the build.

const text = (page: Page, value: string | RegExp) => page.locator(".pfui-Text").filter({ hasText: value });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#root .pfui-App")).toBeVisible();
  expect(errors).toEqual([]);
});

test("$props, with a default (an inline component)", async ({ page }) => {
  await expect(text(page, /^Name: /)).toHaveText(["Name: Mary", "Name: Joe"]);
  await expect(text(page, /^Value: /)).toHaveText(["Value: 123", "Value: [no value]"]);
});

test("events: emitEvent reaches the caller's arrow handler with its argument", async ({ page }) => {
  await page.getByRole("button", { name: "Click to increment: 0" }).click();
  await page.getByRole("button", { name: "Click to increment: 1" }).click();
  await expect(page.getByRole("button", { name: "Click to increment: 2" })).toBeVisible();
  await expect(text(page, /^Increments:/)).toHaveText("Increments: 1 2");
});

test("methods: $self.reset() inside, counter1.reset() from the caller; state from code-behind", async ({ page }) => {
  const counter = text(page, /^Counter: \d+$/);
  await expect(counter).toHaveText("Counter: 0");
  await page.getByRole("button", { name: "Counter +1" }).click();
  await page.getByRole("button", { name: "Counter +1" }).click();
  await expect(counter).toHaveText("Counter: 2");
  await page.getByRole("button", { name: "Counter reset" }).click();
  await expect(counter).toHaveText("Counter: 0");
  await page.getByRole("button", { name: "Counter +1" }).click();
  await page.getByRole("button", { name: "Reset counter (external)" }).click();
  await expect(counter).toHaveText("Counter: 0");
});

test("slots: a named slot with $item, its fallback; the default slot in the caller's scope, and its fallback", async ({ page }) => {
  await expect(text(page, /^(passed|failed): /)).toHaveText(["passed: Build", "failed: Tests"]);
  await expect(text(page, /^Deploy$/)).toBeVisible();
  const content = text(page, /^Panel content:/);
  await expect(content).toHaveText("Panel content: count is 0");
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(content).toHaveText("Panel content: count is 1");
  await expect(text(page, /^Panel: /)).toHaveText(["Panel: with content", "Panel: empty"]);
  await expect(text(page, "(empty panel)")).toBeVisible();
});

test("code-behind of Main.pfui", async ({ page }) => {
  await expect(text(page, "CODE-BEHIND!")).toBeVisible();
});
