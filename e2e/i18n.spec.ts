import { expect, test, type Locator, type Page } from "@playwright/test";

// Step 34 in the playground (project "playground"): the "Languages and formats"
// scenario with the locale files in playground/src/locales; persistence across a
// reload; an RTL locale mirroring the layout, measured (the nav panel, a Splitter
// drag, pinned Table columns, no horizontal overflow).
// Design: .ai/plan/poc-34-i18n.md § Verification.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
// Rendered text only: the page also shows its own source.
const shown = (page: Page, value: RegExp) => page.locator(".gfui-Text").filter({ hasText: value });
const box = async (locator: Locator) => (await locator.boundingBox())!;
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).last();

test("switching the locale: messages, a plural, formats, the Form's own strings; a locale file loads only when needed", async ({ page }) => {
  const localeRequests: string[] = [];
  page.on("request", (request) => {
    // de.json and ar.json load for the page's own Locale scopes (de-CH, ar); pl.json only when chosen.
    if (/locales\/pl\.json/.test(request.url())) localeRequests.push(request.url());
  });
  await open(page, "/languages");
  await expect(shown(page, /^Greeting: Hello, Ada!$/)).toBeVisible();
  await expect(shown(page, /^Inbox: You have 3 messages$/)).toBeVisible();
  await expect(shown(page, /^Place: You finished 2nd$/)).toBeVisible();
  await expect(shown(page, /^Missing: demo\.missing$/)).toBeVisible();
  expect(localeRequests).toEqual([]);

  await button(page, "Deutsch").click();
  await expect(shown(page, /^Greeting: Hallo, Ada!$/)).toBeVisible();
  expect(localeRequests).toEqual([]);
  await expect(shown(page, /^Inbox: Sie haben 3 Nachrichten$/)).toBeVisible();
  await expect(shown(page, /^Number: 1\.234\.567,891$/)).toBeVisible();
  await expect(shown(page, /^Currency: 1\.234,50 €$/)).toBeVisible();
  await expect(shown(page, /^List: red, green und blue$/)).toBeVisible();
  await expect(shown(page, /^Relative: vor 3 Tagen$/)).toBeVisible();
  await expect(page.locator(".gfui-Value").first()).toHaveText("9.876,5");
  // The Form's Save and its required message come from de.json.
  const form = card(page, "The framework's own strings");
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(form.getByText("Dieses Feld ist erforderlich").first()).toBeVisible();
  // A slot inside a message: the link keeps the translated text.
  await expect(card(page, "Messages").getByRole("link", { name: "Nutzungsbedingungen" })).toBeVisible();

  await button(page, "Polski").click();
  await expect(shown(page, /^Greeting: Cześć, Ada!$/)).toBeVisible();
  expect(localeRequests.length).toBe(1);
  const messages = card(page, "Messages").getByRole("textbox", { name: "Messages" });
  await messages.fill("1");
  await expect(shown(page, /^Inbox: Masz 1 wiadomość$/)).toBeVisible();
  await messages.fill("5");
  await expect(shown(page, /^Inbox: Masz 5 wiadomości$/)).toBeVisible();
});

test("the choice is stored: after a reload the app starts in German; <html lang> follows", async ({ page }) => {
  await open(page, "/languages");
  await button(page, "Deutsch").click();
  await expect(shown(page, /^Greeting: Hallo, Ada!$/)).toBeVisible();
  await page.reload();
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await expect(shown(page, /^Greeting: Hallo, Ada!$/)).toBeVisible();
  await expect(shown(page, /^Locale: de · direction: ltr · from: persisted$/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("de");
});

test("Locale scopes: Swiss separators and an Arabic block in RTL inside an English page", async ({ page }) => {
  await open(page, "/languages");
  const scopes = card(page, "Locale scopes");
  await expect(scopes.getByText(/^Swiss German: de-CH · 1’234’567\.5 · Hallo, Ada!$/)).toBeVisible();
  await expect(scopes.locator('.gfui-Locale[lang="ar"]')).toHaveAttribute("dir", "rtl");
});

test.describe("right to left (Arabic)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await open(page, "/languages");
    await button(page, "العربية").click();
    await expect(page.locator(".gfui-App")).toHaveAttribute("dir", "rtl");
  });

  test("the whole app mirrors: <html dir>, the nav panel on the right, no horizontal overflow", async ({ page }) => {
    expect(await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang])).toEqual(["rtl", "ar"]);
    const nav = await box(page.locator(".gfui-NavPanel"));
    expect(Math.round(nav.x + nav.width)).toBe(1200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(shown(page, /^Greeting: مرحبا يا Ada!$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "حفظ" })).toBeVisible();
  });

  test("a Splitter: the primary pane is on the right, and dragging the bar left widens it", async ({ page }) => {
    await open(page, "/splitters");
    const splitter = card(page, "HSplitter").locator(".gfui-Splitter");
    const s = await box(splitter);
    const primary = splitter.locator('.gfui-Splitter-pane[data-pane="primary"]');
    const p = await box(primary);
    expect(Math.round(p.x + p.width)).toBe(Math.round(s.x + s.width));
    const bar = splitter.getByRole("separator");
    const b = await box(bar);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + s.width / 2, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Math.round(((await box(primary)).width / s.width) * 100)).toBe(50);
    const moved = await box(bar);
    expect(Math.abs(moved.x + moved.width / 2 - (s.x + s.width / 2))).toBeLessThan(1);
  });

  test("pinned Table columns stick to the start (right) and end (left) while it scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await open(page, "/tables");
    const table = page.getByRole("table");
    await expect.poll(() => table.evaluate((t) => t.scrollWidth > t.clientWidth)).toBe(true);
    // RTL scrolls with a negative scrollLeft.
    await table.evaluate((t) => (t.scrollLeft = -250));
    const frame = await box(table);
    const clientWidth = await table.evaluate((t) => t.clientWidth);
    const row = table.locator(".gfui-Table-body > [role=row]").first();
    const select = await box(row.locator(".gfui-Table-selectCell"));
    const id = await box(row.locator('[data-col="0"]'));
    const status = await box(row.locator('[data-col="5"]'));
    // The content box: in RTL the vertical scrollbar is on the left.
    const contentLeft = frame.x + frame.width - clientWidth;
    expect(Math.round(frame.x + frame.width - (select.x + select.width))).toBe(0);
    expect(Math.round(select.x - (id.x + id.width))).toBe(0);
    expect(Math.round(status.x - contentLeft)).toBe(0);
  });
});
