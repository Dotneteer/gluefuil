import { expect, test, type Locator, type Page } from "@playwright/test";

// test-apps/hello (step 17): theme variables in a real browser, by computed
// style. Runs against the dev server and the prerendered build.

const style = (locator: Locator, property: string) => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
const app = (page: Page) => page.locator(".pfui-App");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root .pfui-App")).toBeVisible();
});

test("a Button's background follows its theme variable (default: the primary color)", async ({ page }) => {
  expect(await style(page.getByRole("button", { name: "First" }), "background-color")).toBe("rgb(37, 99, 235)");
  expect(await style(page.getByRole("button", { name: "First" }), "color")).toBe("rgb(255, 255, 255)");
});

test("a scoped <Theme> changes only its subtree", async ({ page }) => {
  expect(await style(page.getByRole("button", { name: "Themed button" }), "background-color")).toBe("rgb(220, 38, 38)");
  expect(await style(page.getByRole("button", { name: "Second" }), "background-color")).toBe("rgb(37, 99, 235)");
});

test("toggleThemeTone() switches the app; a <Theme tone=dark> region stays dark", async ({ page }) => {
  const darkRegion = page.getByText("Dark region");
  const lightText = await style(app(page), "color");
  const darkText = await style(darkRegion, "color");
  expect(await style(app(page), "background-color")).toBe("rgb(255, 255, 255)");
  expect(darkText).not.toBe(lightText);

  await page.getByRole("button", { name: "Toggle tone" }).click();
  await expect(page.getByText("Tone: dark")).toBeVisible();
  expect(await style(app(page), "background-color")).not.toBe("rgb(255, 255, 255)");
  // The app's text now has the dark tone's color: the same as the dark region's.
  expect(await style(app(page), "color")).toBe(darkText);
  expect(await style(darkRegion, "color")).toBe(darkText);

  await page.getByRole("button", { name: "Toggle tone" }).click();
  await expect(page.getByText("Tone: light")).toBeVisible();
  expect(await style(app(page), "background-color")).toBe("rgb(255, 255, 255)");
});
