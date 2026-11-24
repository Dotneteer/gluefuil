import { expect, test, type Page } from "@playwright/test";

// The App shell prerendered (steps 19A–19C): the playground's production
// build (index.html prerendered at xs; project playground-build). The shell
// decides nothing in JavaScript from the window's width, so the same HTML is
// right at every width, and the takeover changes no node.

const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 760 };

/** Remembers the prerendered nodes before any script runs; reports how many the takeover replaced. */
async function watchTakeover(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { ssg: Element[] };
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") w.ssg = [...document.getElementById("root")!.querySelectorAll("*")];
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  return {
    errors,
    replaced: () =>
      page.evaluate(() => {
        const nodes = (window as unknown as { ssg: Element[] }).ssg;
        return { gone: nodes.filter((node) => !node.isConnected).length, of: nodes.length };
      }),
  };
}

for (const [name, viewport] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
  test(`${name}: without JavaScript the prerendered shell is laid out for the width`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL!, viewport });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("#root")).toHaveAttribute("data-pfui-prerendered", "xs");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("pfui playground");
    // The layout levels (steps 19D–19F) are in the HTML, so the spacing is right before any script:
    // the dashboard's root stack is the page (level 0, 24px; 16px on a phone), its rows level 2.
    const dashboard = page.locator(".pfui-AppContent > .pfui-Stack");
    await expect(dashboard).toHaveAttribute("data-level", "0");
    await expect(dashboard).toHaveCSS("row-gap", name === "desktop" ? "24px" : "16px");
    await expect(dashboard.locator("> .pfui-Stack > .pfui-Stack").first()).toHaveAttribute("data-level", "2");
    const nav = page.getByRole("navigation", { name: "Main" });
    if (name === "desktop") {
      await expect(nav).toBeVisible();
      expect((await nav.boundingBox())!.width).toBe(256);
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeHidden();
    } else {
      await expect(nav).toBeHidden();
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    }
    await context.close();
  });

  test(`${name}: the takeover reuses every prerendered node, and the shell is live`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const watch = await watchTakeover(page);
    await page.goto("/");
    await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
    expect(await watch.replaced()).toEqual({ gone: 0, of: expect.any(Number) });
    const nav = page.getByRole("navigation", { name: "Main" });
    if (name === "phone") {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(nav).toBeVisible();
    }
    await nav.getByRole("link", { name: "Counter" }).click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText("Counter");
    await expect(nav.getByRole("link", { name: "Counter" })).toHaveAttribute("aria-current", "page");
    if (name === "phone") await expect(nav).toBeHidden();
    expect(watch.errors).toEqual([]);
  });
}

test("the layout demos page is a page of its own, not prerendered", async ({ page }) => {
  await page.goto("/layouts.html?layout=vertical-sticky");
  await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
  await expect(page.locator("#root")).not.toHaveAttribute("data-pfui-prerendered", /.*/);
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
});
