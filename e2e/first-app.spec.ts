import { expect, test } from "@playwright/test";

// test-apps/hello: Main.pfui is compiled at build time (a minimal Vite plugin)
// to an ES module, which renders with the runtime and the built-in components.
test("the first compiled pfui app renders in a real browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("http://localhost:5174/");

  const texts = page.locator(".pfui-Text");
  await expect(texts).toHaveText(["3", "Hello, PFUI!", "1 + 4 + 9 = 14"]);
  await expect(page.getByRole("button")).toHaveText(["First", "Second"]);
  // The horizontal Stack lays its buttons out in a row.
  const [first, second] = await Promise.all([
    page.getByRole("button", { name: "First" }).boundingBox(),
    page.getByRole("button", { name: "Second" }).boundingBox(),
  ]);
  expect(second!.y).toBe(first!.y);
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(errors).toEqual([]);
});
