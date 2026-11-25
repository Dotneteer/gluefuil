import { expect, test, type Page } from "@playwright/test";

// The App shell (steps 19A–19C) in a real browser: each XMLUI layout,
// expressed with the new settings (playground/src/layouts/*.gui, served as
// layouts.html?layout=…). Measured, not looked at: where each region is,
// and what moved after scrolling. Project: playground (dev server).

type Rect = { x: number; y: number; width: number; height: number; bottom: number; right: number };
interface Measured {
  header: Rect;
  nav: Rect | null;
  main: Rect;
  footer: Rect;
  scrollY: number;
  mainScrollTop: number;
}

const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 760 };

async function open(page: Page, layout: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`/layouts.html?layout=${layout}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  return errors;
}

function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    return {
      header: rect(".gfui-AppHeader")!,
      nav: rect(".gfui-NavPanel"),
      main: rect(".gfui-AppMain")!,
      footer: rect(".gfui-Footer")!,
      scrollY: window.scrollY,
      mainScrollTop: document.querySelector(".gfui-AppMain")!.scrollTop,
    };
  });
}

/** Scrolls the way a user would: the wheel over the content. */
async function scroll(page: Page) {
  await page.mouse.move(DESKTOP.width - 100, DESKTOP.height / 2);
  await page.mouse.wheel(0, 1500);
  await expect.poll(async () => {
    const m = await measure(page);
    return m.scrollY + m.mainScrollTop;
  }).toBeGreaterThan(1200);
}

type NavPlace = "header" | "below-header" | "side" | "side-full" | "none";
interface Expected {
  nav: NavPlace;
  scroll: "page" | "content";
  headerSticks: boolean;
  navSticks: boolean;
  footerSticks: boolean;
}

/** XMLUI's eight layouts, plus a combination XMLUI has no name for. */
const LAYOUTS: Record<string, Expected> = {
  "condensed-sticky": { nav: "header", scroll: "page", headerSticks: true, navSticks: true, footerSticks: true },
  condensed: { nav: "header", scroll: "page", headerSticks: false, navSticks: false, footerSticks: false },
  "horizontal-sticky": { nav: "below-header", scroll: "page", headerSticks: true, navSticks: true, footerSticks: true },
  horizontal: { nav: "below-header", scroll: "page", headerSticks: false, navSticks: false, footerSticks: false },
  "vertical-full-header": { nav: "side", scroll: "page", headerSticks: true, navSticks: true, footerSticks: true },
  "vertical-sticky": { nav: "side-full", scroll: "page", headerSticks: true, navSticks: true, footerSticks: true },
  vertical: { nav: "side-full", scroll: "page", headerSticks: false, navSticks: false, footerSticks: false },
  desktop: { nav: "none", scroll: "content", headerSticks: true, navSticks: true, footerSticks: true },
  "condensed-content": { nav: "header", scroll: "content", headerSticks: true, navSticks: true, footerSticks: true },
};

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

for (const [layout, expected] of Object.entries(LAYOUTS)) {
  test.describe(layout, () => {
    test("desktop: where the regions are, and what stays in view while scrolling", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      const errors = await open(page, layout);
      const before = await measure(page);
      const { header, nav, main, footer } = before;

      // Placement.
      switch (expected.nav) {
        case "none":
          expect(nav).toBeNull();
          near(header.x, 0);
          break;
        case "header":
          expect(nav!.y).toBeGreaterThanOrEqual(header.y);
          expect(nav!.bottom).toBeLessThanOrEqual(header.bottom);
          break;
        case "below-header":
          near(nav!.y, header.bottom);
          near(nav!.width, DESKTOP.width);
          near(main.y, nav!.bottom);
          break;
        case "side":
          near(header.x, 0);
          near(header.width, DESKTOP.width);
          near(nav!.x, 0);
          near(nav!.y, header.bottom);
          near(main.x, nav!.right);
          break;
        case "side-full":
          near(nav!.x, 0);
          near(nav!.y, 0);
          near(header.x, nav!.right);
          near(main.x, nav!.right);
          break;
      }
      // The footer, before scrolling: at the bottom of the window, or after the (long) content.
      if (expected.footerSticks) near(footer.bottom, DESKTOP.height);
      else expect(footer.y).toBeGreaterThan(DESKTOP.height);

      await scroll(page);
      const after = await measure(page);

      // What scrolled: the window, or only the content area.
      if (expected.scroll === "content") {
        expect(after.scrollY).toBe(0);
        expect(after.mainScrollTop).toBeGreaterThan(1200);
      } else {
        expect(after.scrollY).toBeGreaterThan(1200);
      }
      // What stayed.
      if (expected.headerSticks) near(after.header.y, 0);
      else expect(after.header.bottom).toBeLessThanOrEqual(0);
      if (expected.footerSticks) near(after.footer.bottom, DESKTOP.height);
      if (expected.nav === "below-header") {
        if (expected.navSticks) near(after.nav!.y, expected.headerSticks ? after.header.bottom : 0);
        else expect(after.nav!.bottom).toBeLessThanOrEqual(0);
      }
      if (expected.nav === "side" || expected.nav === "side-full") {
        if (expected.navSticks) {
          near(after.nav!.y, expected.nav === "side-full" ? 0 : after.header.bottom);
          // The nav ends where the sticky footer starts (or at the window's bottom).
          near(after.nav!.bottom, expected.nav === "side-full" ? DESKTOP.height : after.footer.y);
        } else {
          expect(after.nav!.y).toBeLessThan(-1200);
        }
      }
      expect(errors).toEqual([]);
    });

    if (expected.nav === "none") return;

    test("phone: the nav is a drawer, opened from the header", async ({ page }) => {
      await page.setViewportSize(PHONE);
      const errors = await open(page, layout);
      const nav = page.getByRole("navigation", { name: "Main" });
      const toggle = page.getByRole("button", { name: "Open navigation" });
      await expect(nav).toBeHidden();
      await expect(toggle).toBeVisible();

      await toggle.click();
      await expect(nav).toBeVisible();
      await expect(page.getByRole("button", { name: "Close navigation" })).toHaveAttribute("aria-expanded", "true");
      // A drawer on the left, over the content (once it has slid in); the focus moved into it.
      await expect.poll(async () => Math.round((await nav.boundingBox())!.x)).toBe(0);
      const box = (await nav.boundingBox())!;
      near(box.x, 0);
      near(box.y, 0);
      near(box.height, PHONE.height);
      await expect(page.getByRole("link", { name: "Home" })).toBeFocused();
      // Escape closes it and returns the focus.
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();

      // A link navigates and closes it.
      await toggle.click();
      await page.getByRole("link", { name: "Orders" }).click();
      await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
      await expect(nav).toBeHidden();
      // The overlay closes it too.
      await toggle.click();
      await expect(nav).toBeVisible();
      await page.mouse.click(PHONE.width - 10, PHONE.height / 2);
      await expect(nav).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}

test("a collapsible side nav collapses to icons and back", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page, "vertical-full-header");
  const nav = page.getByRole("navigation", { name: "Main" });
  expect((await nav.boundingBox())!.width).toBe(256);
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  expect((await nav.boundingBox())!.width).toBe(48);
  // The labels are gone, the links stay usable by name.
  await expect(page.locator(".gfui-NavLink-label").first()).toBeHidden();
  await page.getByRole("link", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation" }).click();
  expect((await nav.boundingBox())!.width).toBe(256);
});

test("in a bar, a NavGroup drops down, and closes on navigation and on a click elsewhere", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page, "condensed-sticky");
  const sales = page.getByRole("link", { name: "Sales" });
  await expect(sales).toBeHidden();
  await page.getByText("Reports", { exact: true }).click();
  await expect(sales).toBeVisible();
  // Over the content, below the header.
  const header = (await page.locator(".gfui-AppHeader").boundingBox())!;
  expect((await sales.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  await sales.click();
  await expect(page.getByRole("heading", { name: "Report: sales" })).toBeVisible();
  await expect(sales).toBeHidden();
  await page.getByText("Reports", { exact: true }).click();
  await expect(sales).toBeVisible();
  await page.getByRole("heading", { name: "Report: sales" }).click();
  await expect(sales).toBeHidden();
});

test("the active NavLink follows the route, also below it", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page, "vertical-sticky");
  await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await page.getByText("Reports", { exact: true }).click();
  await page.getByRole("link", { name: "Costs" }).click();
  await expect(page.getByRole("link", { name: "Costs" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", /.*/);
  // In a side nav the group stays open (it is not a dropdown).
  await expect(page.getByRole("link", { name: "Sales" })).toBeVisible();
});
