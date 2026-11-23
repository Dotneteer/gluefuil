import { expect, test } from "@playwright/test";

// test-apps/hello: Main.pfui is compiled at build time (@patchfuil/vite-plugin)
// to an ES module, which renders with the runtime and the built-in components.
test("the first compiled pfui app renders in a real browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  const texts = page.locator(".pfui-Text");
  await expect(texts.first()).toHaveText("3");
  await expect(texts.nth(1)).toHaveText("Hello, PFUI!");
  await expect(texts.nth(2)).toHaveText("1 + 4 + 9 = 14");
  // The horizontal Stack lays its buttons out in a row.
  const [first, second] = await Promise.all([
    page.getByRole("button", { name: "First" }).boundingBox(),
    page.getByRole("button", { name: "Second" }).boundingBox(),
  ]);
  expect(second!.y).toBe(first!.y);
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(errors).toEqual([]);
});
