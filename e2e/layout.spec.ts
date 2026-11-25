import { expect, test, type Page } from "@playwright/test";

// The layout system (steps 19D–19F) in a real browser: the spacing demo
// (playground/src/layouts/spacing.gui, served as layouts.html?layout=spacing)
// sets no gap and no padding. Measured, not looked at: every stack's actual
// gap (from the children's boxes) and every surface's padding against the
// ladder, at desktop and phone widths and at three values of space-base; then
// sizing and wrapping. Project: playground (dev server).

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 800 };

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/layouts.html?layout=spacing");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await expect(page.getByRole("heading", { name: "Automatic spacing" })).toBeVisible();
  return errors;
}

/**
 * Every stack's measured gaps and every surface's padding that differ from the
 * ladder: `steps` are space-level0…3 in space-base units (24/16/12/8 at 4px;
 * level 0 is 4 units on phones). Returns the differences (none expected) and
 * how many gaps were measured (so an empty page can't pass).
 */
function ladderMismatches(page: Page, base: number, phone: boolean) {
  return page.evaluate(
    ({ base, phone }) => {
      const steps = [phone ? 4 : 6, 4, 3, 2].map((units) => units * base);
      const problems: string[] = [];
      let measured = 0;
      const close = (a: number, b: number) => Math.abs(a - b) < 0.6;
      // Children as laid out: through display:contents wrappers (Theme).
      const items = (parent: Element): HTMLElement[] =>
        [...parent.children].flatMap((child) =>
          getComputedStyle(child).display === "contents" ? items(child) : getComputedStyle(child).display === "none" ? [] : [child as HTMLElement],
        );
      for (const stack of document.querySelectorAll<HTMLElement>(".gfui-AppContent .gfui-Stack")) {
        const level = Number(stack.dataset.level);
        const horizontal = stack.dataset.orientation === "horizontal";
        const children = items(stack);
        const columns = children.some((child) => child.classList.contains("gfui-Stack"));
        const explicit = stack.style.getPropertyValue("--gfui-gap");
        const flat = stack.closest("[style*='--gfui-gap-Stack']") !== null;
        const gap = explicit !== "" ? Number.parseFloat(explicit) || 0 : flat ? 4 * base : steps[horizontal && !columns ? Math.min(level + 1, 3) : level]!;
        const name = `${stack.dataset.level}${horizontal ? "h" : "v"} "${(stack.textContent ?? "").trim().slice(0, 24)}"`;
        const wrap = stack.hasAttribute("data-wrap");
        // In a flow, a SpaceFiller is a line break of its own (zero height): a row gap on each side.
        const boxes = children
          .map((child, index) => ({ child, rect: child.getBoundingClientRect(), afterBreak: wrap && index > 0 && children[index - 1]!.classList.contains("gfui-SpaceFiller") }))
          .filter(({ child }) => !wrap || !child.classList.contains("gfui-SpaceFiller"));
        let rowStart = 0;
        for (let i = 1; i < boxes.length; i++) {
          const previous = boxes[i - 1]!;
          const current = boxes[i]!;
          let actual: number;
          let expected = gap;
          if (!horizontal) {
            actual = current.rect.top - previous.rect.bottom;
            // A heading gets the gap again above it.
            if (current.child.classList.contains("gfui-Heading")) expected = 2 * gap;
          } else if (!wrap || current.rect.left > previous.rect.left) {
            actual = current.rect.left - previous.rect.right;
          } else {
            // A new row of a flow: from the bottom of the previous row.
            const rowBottom = Math.max(...boxes.slice(rowStart, i).map((b) => b.rect.bottom));
            actual = current.rect.top - rowBottom;
            if (current.afterBreak) expected = 2 * gap;
            rowStart = i;
          }
          measured++;
          if (!close(actual, expected)) problems.push(`gap ${name} #${i}: ${actual} ≠ ${expected}`);
        }
        if (stack.hasAttribute("data-surface")) {
          const padding = Number.parseFloat(getComputedStyle(stack).paddingTop);
          const expected = steps[level]!;
          measured++;
          if (!close(padding, expected)) problems.push(`padding ${name}: ${padding} ≠ ${expected}`);
        }
      }
      return { problems, measured };
    },
    { base, phone },
  );
}

for (const [name, viewport, phone] of [
  ["desktop", DESKTOP, false],
  ["phone", PHONE, true],
] as const) {
  test(`every gap and padding follows the ladder (${name}, space-base 3/4/5px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = await open(page);
    for (const base of [4, 3, 5]) {
      await page.getByRole("button", { name: `${base}px`, exact: true }).click();
      await expect(page.getByText(`space-base: ${base}px`)).toBeVisible();
      const { problems, measured } = await ladderMismatches(page, base, phone);
      expect(problems, `space-base ${base}px`).toEqual([]);
      expect(measured).toBeGreaterThan(80);
    }
    // The page gutter is level 0 too (outside the demo's Theme: space-base 4px).
    const gutter = await page.locator(".gfui-AppContent").evaluate((content) => getComputedStyle(content).paddingLeft);
    expect(gutter).toBe(phone ? "16px" : "24px");
    expect(errors).toEqual([]);
  });
}

/** The boxes of a stack's children: the stack is the `up`-th one around the element with exactly this text. */
function childBoxes(page: Page, text: string, up = 1) {
  return page.evaluate(({ text, up }) => {
    const element = [...document.querySelectorAll(".gfui-AppContent *")].find((e) => e.children.length === 0 && e.textContent === text)!;
    let stack = element.closest(".gfui-Stack")!;
    for (let i = 1; i < up; i++) stack = stack.parentElement!.closest(".gfui-Stack")!;
    const box = (element: Element) => {
      const { left, right, top, width } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      // The content width: star sizes share the space left after paddings (flexbox).
      const content = width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      return { left, right, top, width, content };
    };
    return { stack: box(stack), children: [...stack.children].map(box) };
  }, { text, up });
}

test("star sizes share the free space 1:2 (after paddings); percentages that add up to 100% fill the row", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  const star = await childBoxes(page, "Natural width");
  expect(star.children[2]!.content / star.children[0]!.content).toBeCloseTo(2, 2);
  expect(star.children[2]!.right).toBeCloseTo(star.stack.right, 0);
  const percent = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent === "Star sizes and percentages")!;
    const stack = heading.nextElementSibling!.nextElementSibling!;
    return { stack: stack.getBoundingClientRect().toJSON(), children: [...stack.children].map((c) => c.getBoundingClientRect().toJSON()) };
  });
  const [a, b, c] = percent.children as { left: number; right: number; width: number }[];
  expect(a!.left).toBeCloseTo(percent.stack.left, 0);
  expect(c!.right).toBeCloseTo(percent.stack.right, 0);
  expect(b!.width / a!.width).toBeCloseTo(2, 1);
});

for (const [name, viewport, phone] of [
  ["desktop", DESKTOP, false],
  ["phone", PHONE, true],
] as const) {
  test(`a flow wraps: itemWidth, percentages and a SpaceFiller line break (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    // Tiles: itemWidth="25%". Four per row, filling it exactly; one per row on a phone.
    const tiles = await childBoxes(page, "Tile 8", 2);
    const tops = [...new Set(tiles.children.map((t) => Math.round(t.top)))];
    expect(tops).toHaveLength(phone ? 8 : 2);
    if (phone) for (const tile of tiles.children) expect(tile.width).toBeCloseTo(tiles.stack.width, 0);
    else expect(tiles.children[3]!.right).toBeCloseTo(tiles.stack.right, 0);
    // width="50%" twice, a SpaceFiller, width="100%": two rows on a desktop; three on a phone.
    const inputs = await page.evaluate(() => {
      const box = (placeholder: string) => document.querySelector(`input[placeholder="${placeholder}"]`)!.closest(".gfui-TextBox")!.getBoundingClientRect().toJSON();
      const stack = document.querySelector('input[placeholder="Street"]')!.closest(".gfui-Stack")!.getBoundingClientRect().toJSON();
      return { first: box("First name"), last: box("Last name"), street: box("Street"), stack };
    });
    expect(inputs.street.width).toBeCloseTo(inputs.stack.width, 0);
    if (phone) {
      expect(inputs.first.width).toBeCloseTo(inputs.stack.width, 0);
      expect(inputs.last.top).toBeGreaterThan(inputs.first.top);
    } else {
      expect(inputs.last.top).toBeCloseTo(inputs.first.top, 0);
      expect(inputs.first.width).toBeCloseTo(inputs.last.width, 0);
      expect(inputs.last.right).toBeCloseTo(inputs.stack.right, 0);
      expect(inputs.street.top).toBeGreaterThan(inputs.first.top);
    }
  });
}

test("density shifts the level; the inspector labels each stack", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page);
  const levels = await page.evaluate(() =>
    ["Normal", "Compact", "Comfortable"].map((title) => [...document.querySelectorAll("h3")].find((h) => h.textContent === title)!.closest(".gfui-Stack")!.getAttribute("data-level")),
  );
  expect(levels).toEqual(["2", "3", "1"]);
  await page.getByRole("button", { name: "Spacing inspector: off" }).click();
  await expect(page.locator(".gfui-Stack[data-inspect]").first()).toBeAttached();
  expect(await page.locator(".gfui-AppContent > .gfui-Theme > .gfui-Stack").getAttribute("data-inspect")).toBe("L0 v · gap 24px");
});
