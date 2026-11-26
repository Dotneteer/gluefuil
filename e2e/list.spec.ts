import { expect, test, type Locator, type Page } from "@playwright/test";

// Step 29 in a real browser (project "playground"): what needs layout. 10,000
// rows of different heights (only those in view mounted, no blank viewport
// while scrolling fast, scrollToIndex lands exactly), a List scrolling with the
// page, a chat List anchored to the bottom (follows appends and a growing
// message, stops after a user scroll, keeps its place when older messages are
// prepended), groups that fold, selection by mouse, keys and checkboxes,
// actions and a context menu. Scenarios:
// playground/src/components/{LongLists,ChatFeed,GroupedLists}Scenario.gui.

const open = async (page: Page, path: string) => {
  // XMLUI's isolation test (virtua-isolation.spec.ts): a capture-phase listener installed first,
  // since the dev client's handler would hide the error from "pageerror".
  await page.addInitScript(() => {
    (window as unknown as { __ro: string[] }).__ro = [];
    window.addEventListener("error", (e) => {
      if (/ResizeObserver loop/i.test(String(e.message))) (window as unknown as { __ro: string[] }).__ro.push(e.message);
    }, true);
  });
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).last();
const resizeLoopErrors = (page: Page) => page.evaluate(() => (window as unknown as { __ro: string[] }).__ro.length);
/** A row's top relative to its List's box (own scroll) or to the viewport (page scroll). */
const rowTop = (list: Locator, text: string) =>
  list.evaluate((l, t) => {
    const row = [...l.querySelectorAll(".gfui-List-row")].find((r) => r.textContent?.includes(t));
    return row ? Math.round(row.getBoundingClientRect().top - l.getBoundingClientRect().top) : null;
  }, text);
const distanceFromEnd = (list: Locator) => list.evaluate((l) => Math.round(l.scrollHeight - l.scrollTop - l.clientHeight));
const mounted = (list: Locator) => list.locator(".gfui-List-row").count();

test.describe("Long lists", () => {
  test("10,000 rows: few mounted; a fast scroll never shows a blank viewport", async ({ page }) => {
    await open(page, "/long-lists");
    const list = card(page, "Its own scroll box").locator(".gfui-List");
    await expect(list.locator(".gfui-List-row").first()).toContainText("Row 0");
    expect(await mounted(list)).toBeLessThan(40);
    // 60 frames at 300px per frame (a fast fling): the rows must cover the viewport in every frame.
    const blank = await list.evaluate(
      (l) =>
        new Promise<number>((done) => {
          let frames = 0;
          let blankFrames = 0;
          const frame = () => {
            if (frames > 0) {
              const v = l.getBoundingClientRect();
              const boxes = [...l.querySelectorAll(".gfui-List-row")].map((r) => r.getBoundingClientRect()).filter((b) => b.bottom > v.top && b.top < v.bottom).sort((a, b) => a.top - b.top);
              let y = v.top;
              for (const b of boxes) {
                if (b.top > y + 1) break;
                y = Math.max(y, b.bottom);
              }
              if (y < v.bottom - 1) blankFrames++;
            }
            if (frames++ < 60) {
              l.scrollTop += 300;
              requestAnimationFrame(frame);
            } else done(blankFrames);
          };
          requestAnimationFrame(frame);
        }),
    );
    expect(blank).toBe(0);
    expect(await mounted(list)).toBeLessThan(140); // the render cache keeps at most 80 seen rows
    expect(await resizeLoopErrors(page)).toBe(0);
  });

  test("scrollToIndex and scrollToId land exactly; Bottom shows the last row; the visible range and the user's scroll are reported", async ({ page }) => {
    await open(page, "/long-lists");
    const section = card(page, "Its own scroll box");
    const list = section.locator(".gfui-List");
    await section.getByRole("button", { name: "Row 5000" }).click();
    await expect.poll(() => rowTop(list, "Row 5000")).toBe(0);
    await expect(page.getByText(/^Visible rows: 5000–\d+$/)).toBeVisible();
    await section.getByRole("button", { name: "Id r9000" }).click();
    await expect.poll(() => rowTop(list, "Row 9000")).toBe(0);
    await section.getByRole("button", { name: "Bottom" }).click();
    await expect.poll(() => distanceFromEnd(list)).toBeLessThanOrEqual(1);
    await expect(list.getByText("Row 9999", { exact: true })).toBeInViewport();
    await expect(page.getByText(/^Visible rows: \d+–9999$/)).toBeVisible();
    // Programmatic scrolls don't fire `scroll`; the wheel does.
    await expect(page.getByText("Scroll: (no user scroll yet)")).toBeVisible();
    await list.hover();
    await page.mouse.wheel(0, -400);
    await expect(page.getByText(/^Scroll: top \d+$/)).toBeVisible();
    await section.getByRole("button", { name: "Top" }).click();
    await expect.poll(() => rowTop(list, "Row 0")).toBe(0);
  });

  test("ordering is applied to all rows (Descending starts at Row 9999)", async ({ page }) => {
    await open(page, "/long-lists");
    const section = card(page, "Its own scroll box");
    await section.getByRole("button", { name: "Descending" }).click();
    await expect(section.locator(".gfui-List-row").first()).toContainText("Row 9999");
  });

  test("a List without a height scrolls with the page and renders the rows in the window", async ({ page }) => {
    await open(page, "/long-lists");
    const list = card(page, "Scrolling with the page").locator(".gfui-List");
    await list.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 20_000);
    await expect
      .poll(() =>
        list.evaluate((l) => {
          const inView = [...l.querySelectorAll(".gfui-List-row")].filter((r) => {
            const b = r.getBoundingClientRect();
            return b.bottom > 0 && b.top < window.innerHeight;
          });
          return inView.length;
        }),
      )
      .toBeGreaterThan(2);
    // The window shows rows well past the start, and only a window's worth is mounted.
    const first = await list.evaluate((l) => {
      const visible = [...l.querySelectorAll(".gfui-List-row")].find((r) => r.getBoundingClientRect().bottom > 0);
      return Number(visible?.getAttribute("data-index"));
    });
    expect(first).toBeGreaterThan(50);
    expect(await mounted(list)).toBeLessThan(140);
  });
});

test.describe("Chat feed", () => {
  test("starts at the newest message, follows a sent and a growing message, and stops following after the user scrolls up", async ({ page }) => {
    await open(page, "/chat-feed");
    const list = page.locator(".gfui-List");
    await expect(list.getByText("Message 129", { exact: true })).toBeInViewport();
    await expect.poll(() => distanceFromEnd(list)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(list.getByText("Message 130", { exact: true })).toBeInViewport();
    await expect.poll(() => distanceFromEnd(list)).toBeLessThanOrEqual(1);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Stream into the last" }).click();
    await expect(list.getByText(/Message 130( and more words arriving){4}/)).toBeInViewport();
    await expect.poll(() => distanceFromEnd(list)).toBeLessThanOrEqual(1);
    // The user scrolls up: new messages don't pull the view down.
    await list.hover();
    await page.mouse.wheel(0, -300);
    await expect.poll(() => distanceFromEnd(list)).toBeGreaterThan(200);
    const before = await distanceFromEnd(list);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Messages: 32")).toBeVisible();
    await expect.poll(() => distanceFromEnd(list)).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Jump to latest" }).click();
    await expect.poll(() => distanceFromEnd(list)).toBeLessThanOrEqual(1);
    expect(await resizeLoopErrors(page)).toBe(0);
  });

  test("older messages loaded above don't move what is on screen", async ({ page }) => {
    await open(page, "/chat-feed");
    const list = page.locator(".gfui-List");
    await expect(list.getByText("Message 129", { exact: true })).toBeInViewport();
    await list.hover();
    await page.mouse.wheel(0, -250);
    await expect.poll(() => distanceFromEnd(list)).toBeGreaterThan(150);
    const anchor = "Message 120";
    await list.evaluate((l) => l.scrollBy(0, 0));
    const before = await rowTop(list, anchor);
    expect(before).not.toBeNull();
    await page.getByRole("button", { name: "Load 10 older" }).click();
    await expect(page.getByText("Messages: 40")).toBeVisible();
    await expect.poll(() => rowTop(list, anchor)).toBe(before);
    // At the very top, loading more keeps the first message in place too.
    await list.evaluate((l) => (l.scrollTop = 0));
    await expect(list.getByText("Older message 90", { exact: true })).toBeVisible();
    const top = await rowTop(list, "Older message 90");
    await page.getByRole("button", { name: "Load 10 older" }).click();
    await expect(page.getByText("Messages: 50")).toBeVisible();
    await expect.poll(() => rowTop(list, "Older message 90")).toBe(top);
  });
});

test.describe("Grouped and selectable lists", () => {
  test("a group folds and unfolds from its header", async ({ page }) => {
    await open(page, "/grouped-lists");
    const section = card(page, "Grouped");
    await expect(section.getByText("Ada (Lead)")).toBeVisible();
    await section.getByRole("button", { name: "Fold Engineering" }).click();
    await expect(section.getByText("Ada (Lead)")).toHaveCount(0);
    await expect(section.getByText("3 in Engineering")).toHaveCount(0);
    await expect(section.getByText("Margaret (Designer)")).toBeVisible();
    await section.getByRole("button", { name: "Unfold Engineering" }).click();
    await expect(section.getByText("Ada (Lead)")).toBeVisible();
  });

  test("click, Shift click and keys select; contractors can't be; the variable follows; Ctrl/Cmd+C; select all", async ({ page }) => {
    await open(page, "/grouped-lists");
    const section = card(page, "Selectable");
    // The List scrolls with the page: its rows below the window aren't mounted until it scrolls there.
    await section.locator(".gfui-List").scrollIntoViewIfNeeded();
    const option = (name: string) => section.getByRole("option").filter({ hasText: name });
    await option("Ada").click();
    await option("Margaret").click({ modifiers: ["Shift"] });
    await expect(section.getByText("Selected ids: 1, 2, 3, 4")).toBeVisible();
    await option("Alan").click();
    await expect(section.getByText("Selected ids: 1, 2, 3, 4")).toBeVisible();
    await expect(option("Alan").getByRole("checkbox")).toBeDisabled();
    // The click on the contractor moved the focus there without selecting; the next row is Barbara.
    await page.keyboard.press("ArrowDown");
    await expect(section.getByText("Selected ids: 6")).toBeVisible();
    await expect(option("Barbara")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ControlOrMeta+c");
    await expect(section.getByText("Log: copied Barbara")).toBeVisible();
    await option("Dennis").getByRole("checkbox").click();
    await expect(section.getByText("Selected ids: 6, 7")).toBeVisible();
    await section.getByRole("button", { name: "Pick Ada and Linus" }).click();
    await expect(section.getByRole("option", { selected: true })).toHaveText([/Ada/, /Linus/]);
    await section.getByRole("button", { name: "Select all" }).click();
    await expect(section.getByText("Selected ids: 1, 2, 3, 4, 6, 7")).toBeVisible();
  });

  test("a right-click opens a context menu for the row's item", async ({ page }) => {
    await open(page, "/grouped-lists");
    const section = card(page, "Selectable");
    await section.locator(".gfui-List").scrollIntoViewIfNeeded();
    await section.getByRole("option").filter({ hasText: "Dennis" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Log Dennis" }).click();
    await expect(section.getByText("Log: menu Dennis")).toBeVisible();
  });
});
