import { expect, test } from "@playwright/test";

test("the smoke app loads all workspace packages and runs the markup parser in a real browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Smoke test app" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Loaded packages" }).getByRole("listitem")).toHaveText([
    "@gluefuil/compiler",
    "@gluefuil/runtime",
    "@gluefuil/components",
  ]);
  await expect(page.getByLabel("Parser output")).toHaveText(
    "root <App> with 2 child elements, 0 diagnostics",
  );
  expect(errors).toEqual([]);
});
