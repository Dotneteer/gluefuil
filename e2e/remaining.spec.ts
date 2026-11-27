import { expect, test, type Locator, type Page } from "@playwright/test";
import jsQR from "jsqr";

// Step 32 in a real browser (project "playground"): a QR code decoded from a
// screenshot of the element; a frame that loads and answers postMessage
// (MessageListener); a video's events and state; the TableOfContents following
// the scroll and moving focus; the tab title; SkipLink and FocusScope by
// keyboard; LiveRegion in the accessibility tree; Timer, ChangeListener, Queue
// toasts; ToneSwitch; Redirect. Scenarios: playground/src/components/
// {Embeds,Contents,Timers,FocusTone}Scenario.gui.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).last();
const button = (scope: Page | Locator, name: string) => scope.getByRole("button", { name, exact: true });
/** A line of a Text that starts with `prefix` (the page also shows its source). */
const line = (scope: Page | Locator, prefix: string) => scope.locator(".gfui-Text").filter({ hasText: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first();

/** Decodes the QR code in a screenshot of the element (its padding is the quiet zone). */
async function decodeQr(page: Page, element: Locator): Promise<string | undefined> {
  const png = (await element.screenshot()).toString("base64");
  const image = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { pixels: Array.from(data.data), width: data.width, height: data.height };
  }, png);
  return jsQR(Uint8ClampedArray.from(image.pixels), image.width, image.height)?.data;
}

test.describe("Embeds and media", () => {
  test("the QR code on screen decodes to the text, at every level and after an edit", async ({ page }) => {
    await open(page, "/embeds");
    const qr = page.locator(".gfui-QRCode").first();
    expect(await decodeQr(page, qr)).toBe("https://example.com/orders/42");
    for (const level of ["L", "Q", "H"]) {
      await button(page, level).click();
      await expect(line(page, "Level: ")).toHaveText(`Level: ${level}`);
      expect(await decodeQr(page, qr)).toBe("https://example.com/orders/42");
    }
    const box = page.getByRole("textbox", { name: "Text" });
    await box.fill("Grüße 🎉 gfui");
    await expect(qr.locator("svg")).toBeVisible();
    await expect.poll(() => decodeQr(page, qr)).toBe("Grüße 🎉 gfui");
    // A rendered size of 200 px, as set.
    expect((await qr.boundingBox())!.width).toBeCloseTo(200, 0);
  });

  test("the frame loads, says it is ready, and echoes messages back (MessageListener)", async ({ page }) => {
    await open(page, "/embeds");
    const frameCard = card(page, "A frame and its messages");
    await expect(line(frameCard, "Loaded: ")).toHaveText("Loaded: true");
    // A sandboxed srcdoc frame without allow-same-origin has the opaque origin "null".
    await expect(line(frameCard, "Replies: ")).toHaveText("Replies: ready (from null);");
    await button(frameCard, "Send hello").click();
    await button(frameCard, "Send 42").click();
    await expect(line(frameCard, "Replies: ")).toHaveText("Replies: ready (from null); echo hello (from null); echo 42 (from null);");
    await expect(page.frameLocator("iframe[name=echo]").getByText("Got: 42")).toBeVisible();
  });

  test("the video plays to the end; its events and its reactive state follow; seek", async ({ page }) => {
    await open(page, "/embeds");
    const media = card(page, "Media");
    await expect(line(media, "Events: ")).toHaveText("Events: metadata 2.0 s;");
    await expect(line(media, "State: ")).toHaveText("State: paused, not ended, at 0.0 of 2.0 s");
    await button(media, "Play").click();
    await expect(line(media, "Events: ")).toHaveText("Events: metadata 2.0 s; play; pause at 2.0; ended;", { timeout: 8000 });
    await expect(line(media, "State: ")).toHaveText("State: paused, ended, at 2.0 of 2.0 s");
    await button(media, "To 1 s").click();
    await expect(line(media, "State: ")).toHaveText("State: paused, not ended, at 1.0 of 2.0 s");
  });
});

test.describe("Table of contents", () => {
  test("lists the headings and the bookmark; follows the scroll; a click scrolls and focuses; the tab title", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await open(page, "/contents");
    const toc = page.getByRole("navigation", { name: "Table of Contents" });
    await expect(toc.getByRole("link")).toHaveText(["Getting started", "Installing", "Your first app", "Concepts", "Markup", "Reactivity", "Frequently asked", "Reference"]);
    await expect(page).toHaveTitle("Table of contents | gfui playground");

    // Scrolled to "Concepts": its item is marked.
    await page.getByRole("heading", { name: "Concepts", exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(toc.getByRole("link", { name: "Concepts" })).toHaveAttribute("aria-current", "location");

    // A click: smooth scrolling to the heading, focus on it.
    await toc.getByRole("link", { name: "Reference" }).click();
    const reference = page.getByRole("heading", { name: "Reference", exact: true });
    await expect(reference).toBeFocused();
    await expect.poll(async () => (await reference.boundingBox())!.y, { timeout: 3000 }).toBeLessThan(150);
    await expect(toc.getByRole("link", { name: "Reference" })).toHaveAttribute("aria-current", "location");
    // The bookmark is a target too.
    await toc.getByRole("link", { name: "Frequently asked" }).click();
    await expect(page.locator("#faq")).toBeFocused();

    // Leaving the page gives the tab its title back.
    await open(page, "/timers");
    await expect(page).not.toHaveTitle(/Table of contents/);
  });
});

test.describe("Focus, tone and announcements", () => {
  test("SkipLink: Tab reaches it, it shows, Enter moves focus to the target", async ({ page }) => {
    await open(page, "/focus-tone");
    const skip = page.getByRole("link", { name: "Skip to the focus demo" });
    await expect(skip).not.toBeInViewport();
    for (let i = 0; i < 60 && !(await skip.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#focus-demo")).toBeFocused();
    // The next Tab continues from the target: the box's button.
    await page.keyboard.press("Tab");
    await expect(button(page, "Open the box")).toBeFocused();
  });

  test("FocusScope keeps Tab inside, both ways, and gives focus back when it closes", async ({ page }) => {
    await open(page, "/focus-tone");
    const opener = button(page, "Open the box");
    await opener.click();
    const name = page.getByRole("textbox", { name: "Name" });
    await expect(name).toBeFocused();
    const inScope = () => page.evaluate(() => Boolean(document.activeElement?.closest(".gfui-FocusScope")));
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect(await inScope()).toBe(true);
    }
    await name.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(button(page, "Close the box")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".gfui-FocusScope")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("LiveRegion is a status in the accessibility tree, with the message", async ({ page }) => {
    await open(page, "/focus-tone");
    const region = page.locator(".gfui-LiveRegion");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await button(page, "Announce saving").click();
    await expect(region).toMatchAriaSnapshot(`- status: /Saved at .+/`);
    // Visually hidden: no box to see.
    const box = await region.boundingBox();
    expect(box!.width * box!.height).toBeLessThanOrEqual(1);
  });

  test("ToneSwitch switches the App's tone; Redirect navigates when it shows", async ({ page }) => {
    await open(page, "/focus-tone");
    const toggle = page.getByRole("switch", { name: "Dark mode" });
    await toggle.click();
    await expect(page.locator(".gfui-App")).toHaveAttribute("data-tone", "dark");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(page.locator(".gfui-App")).toHaveAttribute("data-tone", "light");
    await expect(page.getByText("No results yet", { exact: true })).toBeVisible();
    await button(page, "Find something").click();
    await expect(page.getByText("No results yet", { exact: true })).toHaveCount(0);
    await button(page, "Go to the table of contents").click();
    await expect(page).toHaveURL(/#\/contents$/);
    await expect(page.getByRole("navigation", { name: "Table of Contents" })).toBeVisible();
  });
});

test.describe("Timers, queues and listeners", () => {
  test("the timer ticks and pauses; the search waits until typing stops; named sources", async ({ page }) => {
    await open(page, "/timers");
    const ticks = async () => Number(/Ticks: (\d+)/.exec((await line(page, "Ticks: ").textContent()) ?? "")![1]);
    await expect.poll(ticks).toBeGreaterThan(1);
    await button(page, "Pause").click();
    await expect(line(page, "Ticks: ")).toHaveText(/\(paused\)$/);
    const paused = await ticks();
    await page.waitForTimeout(1200);
    expect(await ticks()).toBe(paused);
    await button(page, "Resume").click();
    await expect.poll(ticks).toBeGreaterThan(paused);

    await page.getByRole("textbox", { name: "Search" }).pressSequentially("gfui", { delay: 60 });
    await expect(line(page, "Searched ")).toHaveText("Searched 1 times; last: gfui");
    await button(page, "b + 1").click();
    await expect(line(page, "Changed: ")).toHaveText("Changed: b");
    await button(page, "Both + 1").click();
    await expect(line(page, "Changed: ")).toHaveText("Changed: a and b");
  });

  test("the queue processes one job at a time, with a progress toast, a result toast and a failure", async ({ page }) => {
    await open(page, "/timers");
    await button(page, "Add 5 jobs").click();
    const toasts = page.locator(".gfui-Toast");
    await expect(toasts.filter({ hasText: /^Processed \d of 5$/ })).toBeVisible();
    await expect(line(page, "Waiting or running: ")).not.toHaveText("Waiting or running: 0");
    await expect(toasts.filter({ hasText: "All done: 4 processed" })).toBeVisible({ timeout: 6000 });
    await expect(line(page, "Processed: ")).toHaveText("Processed: job 1, job 2, job 4, job 5");
    await expect(line(page, "Failures: ")).toHaveText("Failures: job 3: job 3 failed on purpose;");
    await expect(line(page, "Waiting or running: ")).toHaveText("Waiting or running: 0");
  });
});
