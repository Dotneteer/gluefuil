import { expect, test } from "@playwright/test";

test("the smoke app renders all workspace packages in a real browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Smoke test app" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Loaded packages" }).getByRole("listitem")).toHaveText([
    "@patchfuil/compiler",
    "@patchfuil/runtime",
    "@patchfuil/components",
  ]);
  expect(errors).toEqual([]);
});
