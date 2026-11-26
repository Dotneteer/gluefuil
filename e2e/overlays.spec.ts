import { expect, test, type Page } from "@playwright/test";

// Step 27 in a real browser (project "playground"): what jsdom can't show.
// Focus trapping and its return, Escape (only the topmost overlay), outside
// clicks, menus by keyboard, a context menu at the pointer, tooltip timing and
// placement, toasts timing out, and overlays taking the theme and the tone.
// The scenarios: playground/src/components/{Dialogs,Menus,Notifications}Scenario.gui.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const log = (page: Page) => page.getByText(/^log: /);
/** The element holding the keyboard focus: its text or aria-label. */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? "");

test.describe("ModalDialog", () => {
  test("open(...params): $param in the title and a Form; focus moves in, stays in (Tab and Shift+Tab), and returns to the trigger", async ({ page }) => {
    await open(page, "/dialogs");
    const trigger = button(page, "Edit Ann");
    await trigger.click();
    const editor = dialog(page, "Edit Ann");
    await expect(editor).toBeVisible();
    await expect(editor.getByText("Opened from the first button.")).toBeVisible();
    await expect(editor.getByLabel("Name")).toHaveValue("Ann");
    await expect(log(page)).toHaveText("log: opened for Ann");
    // In the App's overlay layer.
    expect(await editor.evaluate((el) => el.closest(".gfui-Overlays") !== null)).toBe(true);
    // The focus cycles inside the dialog, both ways.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await editor.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await editor.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    await expect(log(page)).toHaveText("log: opened for Ann, closed");
    await expect(trigger).toBeFocused();
  });

  test("a Form inside: Save submits and closes it; Cancel closes it", async ({ page }) => {
    await open(page, "/dialogs");
    await button(page, "Edit Bob").click();
    const editor = dialog(page, "Edit Bob");
    await editor.getByLabel("Name").fill("Robert");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toBeHidden();
    await expect(log(page)).toHaveText("log: saved Robert (27), closed");
    await button(page, "Edit Bob").click();
    await dialog(page, "Edit Bob").getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page, "Edit Bob")).toBeHidden();
  });

  test("declarative (when): a click outside closes it, and its close event resets the condition so it opens again", async ({ page }) => {
    await open(page, "/dialogs");
    await button(page, "Show help").click();
    const help = dialog(page, "Help");
    await expect(help).toBeVisible();
    // Outside the dialog: the top-left corner of the window.
    await page.mouse.click(5, 5);
    await expect(help).toBeHidden();
    await button(page, "Show help").click();
    await expect(help).toBeVisible();
    await help.getByRole("button", { name: "Close" }).click();
    await expect(help).toBeHidden();
  });

  test("unsaved changes: closing asks; Escape answers the question only (the topmost overlay), Keep editing keeps it, Discard closes it", async ({ page }) => {
    await open(page, "/dialogs");
    await button(page, "Open draft").click();
    const draft = dialog(page, "Draft");
    await draft.getByLabel("Title").fill("Annual plan");
    await expect(draft.getByText("dirty: true")).toBeVisible();
    await expect(log(page)).toHaveText("log: draft is dirty");
    await page.keyboard.press("Escape");
    const question = dialog(page, "Unsaved changes");
    await expect(question).toBeVisible();
    await expect(question.getByText("You have unsaved changes. Are you sure you want to close this dialog?")).toBeVisible();
    // Escape closes the question only: the draft stays.
    await page.keyboard.press("Escape");
    await expect(question).toBeHidden();
    await expect(draft).toBeVisible();
    await draft.getByRole("button", { name: "Close" }).click();
    await question.getByRole("button", { name: "Keep editing" }).click();
    await expect(draft).toBeVisible();
    await draft.getByRole("button", { name: "Close" }).click();
    await question.getByRole("button", { name: "Discard" }).click();
    await expect(draft).toBeHidden();
    await expect(log(page)).toHaveText("log: draft is clean");
  });

  test("willClose: closing is blocked until allowed; closeOnClickAway=false ignores outside clicks", async ({ page }) => {
    await open(page, "/dialogs");
    await button(page, "Open guarded").click();
    const guarded = dialog(page, "Guarded");
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await guarded.getByRole("button", { name: "Close" }).click();
    await expect(guarded).toBeVisible();
    await guarded.getByRole("button", { name: "Allow closing" }).click();
    await page.mouse.click(5, 5);
    await expect(guarded).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(guarded).toBeHidden();
  });

  test("the dialog takes the theme: its colors follow the tone", async ({ page }) => {
    await open(page, "/dialogs");
    const surface = async () => {
      await button(page, "Show help").click();
      const color = await dialog(page, "Help").evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.keyboard.press("Escape");
      await expect(dialog(page, "Help")).toBeHidden();
      return color;
    };
    expect(await surface()).toBe("rgb(255, 255, 255)");
    await page.getByRole("button", { name: /^Tone: / }).click();
    expect(await surface()).not.toBe("rgb(255, 255, 255)");
  });
});

test.describe("Drawer", () => {
  test("slides in from its edge; focus is trapped; Escape closes it; a drawer without a backdrop leaves the page usable", async ({ page }) => {
    await open(page, "/dialogs");
    await button(page, "Left drawer").click();
    const left = page.locator(".gfui-Drawer-content", { hasText: "Navigation" });
    await expect(left).toBeVisible();
    await expect.poll(async () => (await left.boundingBox())?.x).toBe(0);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await left.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(left).toBeHidden();
    await expect(log(page)).toHaveText("log: left drawer closed");

    await button(page, "Right drawer").click();
    const right = page.locator(".gfui-Drawer-content", { hasText: "Filters" });
    await expect(right).toBeVisible();
    const viewport = page.viewportSize()!;
    await expect.poll(async () => {
      const box = await right.boundingBox();
      return box ? Math.round(box.x + box.width) : 0;
    }).toBe(viewport.width);
    // No backdrop: a button on the page still works.
    await button(page, "Edit Ann").click();
    await expect(dialog(page, "Edit Ann")).toBeVisible();
  });
});

test.describe("menus", () => {
  test("DropdownMenu by keyboard: Enter opens it, arrows move, ArrowRight opens the submenu, Enter chooses; Escape closes it", async ({ page }) => {
    await open(page, "/menus");
    const trigger = button(page, "Actions");
    // Mantine moves the focus into the dropdown (an empty placeholder) a moment after it
    // opens; a key pressed before that goes to the trigger. Wait for it under load.
    const focusInMenu = () => expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="menu"]') !== null)).toBe(true);
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu").first();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(page.getByText("opened 1 times")).toBeVisible();
    await focusInMenu();
    // The separator and the disabled item are skipped.
    for (const expected of ["Edit", "Duplicate", "Export"]) {
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => focused(page)).toBe(expected);
    }
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focused(page)).toBe("CSV");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focused(page)).toBe("JSON");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => focused(page)).toBe("Export");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focused(page)).toBe("CSV");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focused(page)).toBe("JSON");
    await page.keyboard.press("Enter");
    await expect(log(page)).toHaveText("log: export json");
    await expect(menu).toBeHidden();
    // Escape closes it, and an outside click does.
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await focusInMenu();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeHidden();
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    // Outside: the page's title (a corner of the window could be a side-nav link).
    await page.getByRole("heading", { level: 1 }).first().click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeHidden();
  });

  test("a disabled item does nothing; end alignment; a MenuItem's `to` navigates", async ({ page }) => {
    await open(page, "/menus");
    await button(page, "Actions").click();
    await page.getByRole("menuitem", { name: "Delete (disabled)" }).click({ force: true });
    await expect(log(page)).toHaveText("log: ");
    await page.keyboard.press("Escape");
    const endTrigger = button(page, "End-aligned");
    await endTrigger.click();
    const item = page.getByRole("menuitem", { name: "Go to Select" });
    await expect(item).toBeVisible();
    const [t, m] = [await endTrigger.boundingBox(), await page.locator(".gfui-DropdownMenu").last().boundingBox()];
    expect(Math.abs(t!.x + t!.width - (m!.x + m!.width))).toBeLessThan(2);
    await item.click();
    await expect(page).toHaveURL(/#\/select$/);
  });

  test("ContextMenu: a right click opens it at the pointer (not the browser's menu), with $context; an item acts on it", async ({ page }) => {
    await open(page, "/menus");
    // The file's own card (the section's card contains it too).
    const card = page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: "Theme.gui", exact: true }) }).last();
    // Mid-window, so the menu has room below the pointer (near the bottom it flips up).
    await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = (await card.boundingBox())!;
    const [x, y] = [Math.round(box.x + 40), Math.round(box.y + box.height / 2)];
    await page.mouse.click(x, y, { button: "right" });
    const rename = page.getByRole("menuitem", { name: "Rename Theme.gui" });
    await expect(rename).toBeVisible();
    const menu = (await page.locator(".gfui-DropdownMenu").filter({ has: rename }).boundingBox())!;
    expect(Math.abs(menu.x - x)).toBeLessThan(3);
    expect(Math.abs(menu.y - y)).toBeLessThan(3);
    expect(Math.round(menu.width)).toBe(220);
    await page.getByRole("menuitem", { name: "Where was I clicked?" }).click();
    await expect(log(page)).toHaveText(`log: opened at ${x}, ${y}`);
    await page.mouse.click(x, y, { button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Theme.gui", exact: true })).toHaveCount(0);
  });
});

test.describe("tooltips", () => {
  test("the default waits 700 ms; a tooltip goes on leave; options place it; the focus shows it too", async ({ page }) => {
    await open(page, "/menus");
    const tooltip = page.getByRole("tooltip");
    await button(page, "Default (700 ms)").hover();
    await page.waitForTimeout(300);
    await expect(tooltip).toBeHidden();
    await expect(tooltip).toHaveText("A plain tooltip");
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();

    const right = button(page, "Right, fast");
    await right.hover();
    await expect(tooltip).toHaveText("On the right");
    const [b, t] = [(await right.boundingBox())!, (await tooltip.boundingBox())!];
    expect(t.x).toBeGreaterThan(b.x + b.width);
    expect(await tooltip.locator(".gfui-Tooltip-arrow").count()).toBe(1);
    await page.mouse.move(0, 0);

    await button(page, "Markdown").focus();
    await expect(tooltip.locator("strong")).toHaveText("Bold");
  });

  test("without room on its side, a tooltip flips to the other side (avoidCollisions)", async ({ page }) => {
    await open(page, "/menus");
    const target = button(page, "At the right edge");
    await target.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toHaveText("No room on the right: this tooltip flips to the left");
    const [b, t] = [(await target.boundingBox())!, (await tooltip.boundingBox())!];
    expect(t.x + t.width).toBeLessThanOrEqual(b.x);
    expect(t.x).toBeGreaterThanOrEqual(0);
  });
});

test.describe("toast() and confirm()", () => {
  test("toasts appear and leave after their duration; a loading toast becomes a success by its id", async ({ page }) => {
    await open(page, "/notifications");
    await button(page, "Top left, 1 s").click();
    const quick = page.locator(".gfui-Toast", { hasText: "Quick one" });
    await expect(quick).toBeVisible();
    const box = (await quick.boundingBox())!;
    expect(box.x).toBeLessThan(100);
    await expect(quick).toBeHidden({ timeout: 3000 });

    await button(page, "Start loading").click();
    const upload = page.locator(".gfui-Toast", { hasText: "Uploading" });
    await expect(upload).toHaveAttribute("data-kind", "loading");
    await button(page, "Finish loading").click();
    await expect(page.locator(".gfui-Toast", { hasText: "Uploaded" })).toHaveAttribute("data-kind", "success");
    await expect(page.locator(".gfui-Toast", { hasText: "Uploaded" })).toBeHidden({ timeout: 4000 });
  });

  test("confirm(): the action's label, Escape answers false; two confirmations come one after the other", async ({ page }) => {
    await open(page, "/notifications");
    await button(page, "Ask (positional)").click();
    const question = dialog(page, "Delete the file");
    await expect(question.getByText("This cannot be undone.")).toBeVisible();
    await expect(question.getByRole("button", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByText("answer: cancelled")).toBeVisible();
    await button(page, "Ask (options)").click();
    await dialog(page, "Publish").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("answer: published")).toBeVisible();
    await button(page, "Ask twice").click();
    await dialog(page, "First").getByRole("button", { name: "Yes" }).click();
    await dialog(page, "Second").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("answer: true then false")).toBeVisible();
  });

  test("APICall: asks first, then a loading toast and the result's; a failure's message has $error", async ({ page }) => {
    await open(page, "/notifications");
    await button(page, "Add Zoe").click();
    await dialog(page, "Add a person").getByRole("button", { name: "Add" }).click();
    await expect(page.locator(".gfui-Toast", { hasText: "Added Zoe" })).toBeVisible();
    await button(page, "Load a missing person").click();
    await expect(page.locator(".gfui-Toast[data-kind=error]", { hasText: "Couldn't load it: 404" })).toBeVisible();
  });
});
