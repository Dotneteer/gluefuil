import { expect, test } from "@playwright/test";

// The manual-testing playground (playground/): a smoke test that the dashboard
// lists the scenarios and every one opens without errors and leads back.

test("every scenario on the dashboard opens its page, without errors, and leads back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("pfui playground");
  // Every button on the dashboard opens a scenario.
  const titles = await page.getByRole("button").allTextContents();
  expect(titles).toEqual(["Counter", "Async handlers", "Theming", "Inputs"]);
  for (const title of titles) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.getByRole("button", { name: "← Dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("pfui playground");
  }
  expect(errors).toEqual([]);
});
