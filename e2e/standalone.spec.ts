import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Standalone mode (step 11): e2e/fixtures/standalone-site served by
// tools/static-server.mjs from a temp copy (.tmp/standalone-site), with the
// built dist/pfui.js. The tests edit that copy; they run serially.
test.describe.configure({ mode: "serial" });

const URL = "http://localhost:5175/";
const MAIN = ".tmp/standalone-site/Main.pfui";
const original = readFileSync("e2e/fixtures/standalone-site/Main.pfui", "utf8");

test.afterEach(() => writeFileSync(MAIN, original));

const loadSource = (page: Page) => page.evaluate(() => (window as unknown as { pfui: { current(): { status: { source: string } } } }).pfui.current().status.source);

test("the first load compiles in the browser; a reload takes the cache", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  expect(await loadSource(page)).toBe("compiled");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((key) => key.startsWith("pfui:") && key.endsWith(":Main.pfui"))).toBe(true);

  await page.reload();
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  expect(await loadSource(page)).toBe("cache");

  // The app works either way.
  await page.getByRole("button", { name: "Increment" }).click();
  await expect(page.getByText("Standalone: count = 1")).toBeVisible();
});

test("editing Main.pfui on the server updates the open app", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  writeFileSync(MAIN, original.replace("Standalone: count", "Edited: count"));
  await expect(page.getByText("Edited: count = 0")).toBeVisible();
});

test("an error in the file shows the overlay; fixing it recovers", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  writeFileSync(MAIN, original.replace("{count}", "{cuont}"));
  const overlay = page.getByRole("alert");
  await expect(overlay).toContainText("Main.pfui:2:30: error C001: Cannot find name 'cuont'");
  writeFileSync(MAIN, original);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  await expect(overlay).toHaveCount(0);
});
