import { expect, test, type Locator, type Page } from "@playwright/test";

// Step 28 in a real browser (project "playground"): what needs layout. Tabs by
// keyboard; dragging a splitter, its limits, keys, resize modes and a hidden
// pane; ScrollViewer styles and fades; sticky sections and boxes; a
// ResponsiveBar at several widths. Scenarios:
// playground/src/components/{Tabs,Splitters,ResponsiveBar}Scenario.gui.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const box = async (locator: Locator) => (await locator.boundingBox())!;
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).last();

test.describe("Tabs and steppers", () => {
  test("tabs by keyboard (arrows, Home, End); IDs inside a tab read outside; an added project gets a tab", async ({ page }) => {
    await open(page, "/tabs");
    const section = card(page, "Tabs");
    const tab = (name: string) => section.getByRole("tab", { name, exact: true });
    await tab("Account").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab("Settings")).toHaveAttribute("aria-selected", "true");
    await expect(section.getByLabel("Notifications")).toBeVisible();
    await page.keyboard.press("End");
    await expect(tab("Gemini")).toHaveAttribute("aria-selected", "true");
    await expect(section.getByText("The Gemini project.")).toBeVisible();
    await expect(page.getByText(/^log: tab 3 \(Gemini\)$/)).toBeVisible();
    await page.keyboard.press("Home");
    await section.getByLabel("Name").fill("Grace");
    await expect(section.getByText("Name from the first tab: Grace; active tab: 0")).toBeVisible();
    await section.getByRole("button", { name: "Add a project" }).click();
    await tab("Project 3").click();
    await expect(section.getByText("The Project 3 project.")).toBeVisible();
  });

  test("a vertical stepper shows the active step's content under its header; nonLinear headers are buttons", async ({ page }) => {
    await open(page, "/tabs");
    const packed = page.locator(".gfui-Step-content", { hasText: "In a box, under its header." });
    const header = page.locator(".gfui-Step-header", { hasText: "Packed" });
    const [h, c] = [await box(header), await box(packed)];
    expect(c.y).toBeGreaterThan(h.y + h.height - 1);
    await page.locator("button.gfui-Step-header", { hasText: "Done" }).click();
    await expect(page.locator(".gfui-Step-content", { hasText: "All set." })).toBeVisible();
  });
});

test.describe("Splitter", () => {
  const primaryWidth = (page: Page) => card(page, "HSplitter").locator('.gfui-Splitter-pane[data-pane="primary"]').evaluate((el) => el.getBoundingClientRect().width);

  test("dragging the bar resizes the primary pane, within its limits; resize reports the size", async ({ page }) => {
    await open(page, "/splitters");
    const splitter = card(page, "HSplitter").locator(".gfui-Splitter");
    const s = await box(splitter);
    const bar = splitter.getByRole("separator");
    const b = await box(bar);
    expect(Math.round((await primaryWidth(page)) / s.width * 100)).toBe(30);
    // Drag to 50%.
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + s.width / 2, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    // The bar stays where it was grabbed: its center under the pointer.
    const moved = await box(bar);
    expect(Math.abs(moved.x + moved.width / 2 - (s.x + s.width / 2))).toBeLessThan(1);
    await expect(page.getByText(new RegExp(`^Primary size: ${Math.round(await primaryWidth(page))}px$`))).toBeVisible();
    // Past the limits: at least 120px, at most the width minus 120px (and the bar).
    await page.mouse.move(s.x + s.width / 2, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(s.x + 10, b.y + 5, { steps: 5 });
    await page.mouse.up();
    expect(Math.round(await primaryWidth(page))).toBe(120);
    const after = await box(bar);
    await page.mouse.move(after.x + after.width / 2, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(s.x + s.width - 5, b.y + 5, { steps: 5 });
    await page.mouse.up();
    expect(Math.round(await primaryWidth(page))).toBe(Math.round(s.width - 120));
  });

  test("the arrow keys move a focused bar by 10px (50px with Shift)", async ({ page }) => {
    await open(page, "/splitters");
    const bar = card(page, "HSplitter").getByRole("separator");
    await bar.focus();
    const start = await primaryWidth(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => Math.round((await primaryWidth(page)) - start)).toBe(10);
    await page.keyboard.press("Shift+ArrowLeft");
    await expect.poll(async () => Math.round((await primaryWidth(page)) - start)).toBe(-40);
  });

  test("a hidden pane: no bar, the other fills the splitter", async ({ page }) => {
    await open(page, "/splitters");
    const section = card(page, "HSplitter");
    await section.getByRole("button", { name: "Hide the second pane" }).click();
    await expect(section.getByRole("separator")).toBeHidden();
    const [s, p] = [await box(section.locator(".gfui-Splitter")), await box(section.locator('.gfui-Splitter-pane[data-pane="primary"]'))];
    expect(Math.round(p.width)).toBe(Math.round(s.width));
  });

  test("resizeMode preservePrimary keeps the primary pane's size when the splitter resizes; preserveRatio keeps the ratio", async ({ page }) => {
    await open(page, "/splitters");
    const vertical = card(page, "VSplitter, preservePrimary, floating, swapped").locator(".gfui-Splitter").first();
    await vertical.scrollIntoViewIfNeeded();
    const top = vertical.locator('.gfui-Splitter-pane[data-pane="primary"]');
    expect(Math.round((await box(top)).height)).toBe(80);
    // Drag it to 100px: preservePrimary stores px.
    const bar = vertical.getByRole("separator");
    const b = await box(bar);
    await page.mouse.move(b.x + 20, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 20, b.y + b.height / 2 + 20, { steps: 3 });
    await page.mouse.up();
    const height = Math.round((await box(top)).height);
    expect(Math.abs(height - 100)).toBeLessThan(3);
    expect(await top.evaluate((el) => el.style.flex)).toBe(`0 0 ${height}px`);
    // The HSplitter (preserveRatio, the default): a percentage after a drag.
    const horizontal = card(page, "HSplitter").getByRole("separator");
    await horizontal.focus();
    await page.keyboard.press("ArrowRight");
    expect(await card(page, "HSplitter").locator('.gfui-Splitter-pane[data-pane="primary"]').evaluate((el) => el.style.flex)).toMatch(/^0 0 [\d.]+%$/);
  });

  test("swapped: the primary pane on the right; floating: the bar is invisible until hovered", async ({ page }) => {
    await open(page, "/splitters");
    const section = card(page, "VSplitter, preservePrimary, floating, swapped");
    const swapped = section.locator(".gfui-Splitter").nth(1);
    const [primary, secondary] = [await box(swapped.locator('[data-pane="primary"]')), await box(swapped.locator('[data-pane="secondary"]'))];
    expect(primary.x).toBeGreaterThan(secondary.x);
    const floating = section.locator(".gfui-Splitter").first().getByRole("separator");
    await floating.scrollIntoViewIfNeeded();
    expect(await floating.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await floating.hover();
    expect(await floating.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("scrolling and sticking", () => {
  test("ScrollViewer: normal scrolls natively; overlay shows a themed scrollbar; the fades follow the scroll position", async ({ page }) => {
    await open(page, "/splitters");
    const viewers = card(page, "ScrollViewer").locator(".gfui-ScrollViewer");
    await expect(viewers).toHaveCount(4);
    expect(await viewers.nth(0).locator(".mantine-ScrollArea-scrollbar").count()).toBe(0);
    const overlay = viewers.nth(1);
    await expect(overlay.locator(".mantine-ScrollArea-scrollbar").first()).toBeVisible();
    const body = overlay.locator(".gfui-ScrollViewer-body");
    await expect(body).toHaveAttribute("data-fade-bottom", "");
    await expect(body).not.toHaveAttribute("data-fade-top", "");
    await overlay.locator(".gfui-ScrollViewer-viewport").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(body).toHaveAttribute("data-fade-top", "");
    await expect(body).not.toHaveAttribute("data-fade-bottom", "");
  });

  test("StickySection: a section header stays at the top of its ScrollViewer; a later one covers it", async ({ page }) => {
    await open(page, "/splitters");
    const section = card(page, "StickySection in a ScrollViewer");
    const viewport = section.locator(".gfui-ScrollViewer-viewport");
    await viewport.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const top = (await box(viewport)).y;
    const header = (name: string) => section.locator(".gfui-StickySection", { hasText: name });
    await viewport.evaluate((el) => el.scrollTo({ top: 120 }));
    await expect.poll(async () => Math.round((await box(header("Section A"))).y - top)).toBe(0);
    // Past B's place: B sticks too; it is later, so it covers A.
    await viewport.evaluate((el) => {
      const b = [...el.querySelectorAll<HTMLElement>(".gfui-StickySection")].find((s) => s.textContent === "Section B")!;
      el.scrollTo({ top: el.scrollTop + b.getBoundingClientRect().top - el.getBoundingClientRect().top + 60 });
    });
    await expect.poll(async () => Math.round((await box(header("Section B"))).y - top)).toBe(0);
    expect(Math.round((await box(header("Section A"))).y - top)).toBe(0);
    const covering = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest(".gfui-StickySection")?.textContent;
    }, { x: (await box(header("Section B"))).x + 5, y: top + 5 });
    expect(covering).toBe("Section B");
  });

  test("StickyBox: at the bottom of the window while the page scrolls", async ({ page }) => {
    await open(page, "/splitters");
    const sticky = page.locator(".gfui-StickyBox");
    const height = page.viewportSize()!.height;
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => Math.round((await box(sticky)).y + (await box(sticky)).height)).toBe(height);
  });
});

test.describe("ResponsiveBar", () => {
  test("children that don't fit move into the menu, which says so through $overflow; widening brings them back", async ({ page }) => {
    await open(page, "/responsive-bar");
    const bar = page.locator(".gfui-ResponsiveBar").first();
    const items = bar.locator(":scope > .gfui-ResponsiveBar-item");
    await expect(items).toHaveCount(8);
    await expect(page.getByText("Overflow: false")).toBeVisible();
    // Narrow it to 20% (the slider's minimum).
    const slider = page.getByRole("slider");
    await slider.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => items.count()).toBeLessThan(8);
    const inBar = await items.count();
    await expect(page.getByText("Overflow: true")).toBeVisible();
    const b = await box(bar);
    for (let i = 0; i < inBar; i++) expect((await box(items.nth(i))).x + (await box(items.nth(i))).width).toBeLessThanOrEqual(b.x + b.width + 1);
    await bar.getByRole("button", { name: "More options" }).click();
    await page.getByRole("button", { name: "Help (in the menu)" }).click();
    await expect(page.getByText("log: clicked Help")).toBeVisible();
    // Back to 100%: all in the bar again.
    await slider.focus();
    await page.keyboard.press("End");
    await expect(items).toHaveCount(8);
    await expect(page.getByText("Overflow: false")).toBeVisible();
  });

  test("vertical: by height", async ({ page }) => {
    await open(page, "/responsive-bar");
    const bar = page.locator(".gfui-ResponsiveBar").nth(1);
    await expect.poll(() => bar.locator(":scope > .gfui-ResponsiveBar-item").count()).toBeLessThan(6);
    await expect(bar.getByRole("button", { name: "More options" })).toBeVisible();
  });
});
