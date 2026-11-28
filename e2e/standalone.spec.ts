import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Standalone mode (steps 11, 14): e2e/fixtures/standalone-site served by
// tools/static-server.mjs from a temp copy (.tmp/standalone-site), with the
// built dist/gfui.js. The tests edit that copy; they run serially.
test.describe.configure({ mode: "serial" });

const URL = "http://localhost:5175/";
const MAIN = ".tmp/standalone-site/Main.gui";
const GREETING = ".tmp/standalone-site/components/Greeting.gui";
const original = readFileSync("e2e/fixtures/standalone-site/Main.gui", "utf8");
const greeting = readFileSync("e2e/fixtures/standalone-site/components/Greeting.gui", "utf8");

test.afterEach(() => {
  writeFileSync(MAIN, original);
  writeFileSync(GREETING, greeting);
});

const loadSource = (page: Page) => page.evaluate(() => (window as unknown as { gfui: { current(): { status: { source: string } } } }).gfui.current().status.source);

test("the first load compiles in the browser; a reload takes the cache", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  expect(await loadSource(page)).toBe("compiled");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((key) => key.startsWith("gfui:") && key.endsWith(":Main.gui"))).toBe(true);

  await page.reload();
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  expect(await loadSource(page)).toBe("cache");

  // The app works either way.
  await page.getByRole("button", { name: "Increment" }).click();
  await expect(page.getByText("Standalone: count = 1")).toBeVisible();
});

test("editing Main.gui on the server updates the open app", async ({ page }) => {
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
  await expect(overlay).toContainText("Main.gui:2:30: error C001: Cannot find name 'cuont'");
  writeFileSync(MAIN, original);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  await expect(overlay).toHaveCount(0);
});

test("a component file with code-behind is fetched, compiled and cached; its slot shows the caller's content", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Hello, gfui!")).toBeVisible();
  await page.getByRole("button", { name: "Waves: 0" }).click();
  await expect(page.getByRole("button", { name: "Waves: 1" })).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();
  await expect(page.getByText("slot content, count = 1")).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((key) => key.startsWith("gfui:") && key.endsWith(":components/Greeting.gui"))).toBe(true);
});

test("editing a component file on the server updates the open app", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("Hello, gfui!")).toBeVisible();
  writeFileSync(GREETING, greeting.replace("{greet($props.name)}", "Edited {greet($props.name)}"));
  await expect(page.getByText("Edited Hello, gfui!")).toBeVisible();
});

// Step 35: standalone mode traces with ?gfui-trace, and the same page with
// ?gfui-inspector is the Inspector (compiled in the browser from gfui.js).
test("?gfui-trace traces; gfui.trace.inspect() opens this page as the Inspector, which shows the entries", async ({ page, context }) => {
  await page.goto(`${URL}?gfui-trace`);
  await expect(page.getByText("Standalone: count = 0")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { gfui: { trace: { enabled: boolean } } }).gfui.trace.enabled)).toBe(true);
  await page.getByRole("button", { name: "Increment" }).click();
  const [inspector] = await Promise.all([
    context.waitForEvent("page"),
    page.evaluate(() => (window as unknown as { gfui: { trace: { inspect(): void } } }).gfui.trace.inspect()),
  ]);
  await inspector.waitForLoadState();
  expect(new globalThis.URL(inspector.url()).search).toBe("?gfui-inspector");
  const write = inspector.locator('[role="row"]').filter({ hasText: /count\s*0 → 1/ });
  await expect(write).toBeVisible();
  await expect(write).toContainText("Main.gui:1:6");
  // Off without the parameter (a new tab: nothing remembered).
  const plain = await context.newPage();
  await plain.goto(URL);
  await expect(plain.getByText("Standalone: count = 0")).toBeVisible();
  expect(await plain.evaluate(() => (window as unknown as { gfui: { trace: { enabled: boolean } } }).gfui.trace.enabled)).toBe(false);
});
