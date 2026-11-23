import { expect, test } from "@playwright/test";

// The manual-testing playground (playground/): a smoke test that the dashboard
// lists the scenarios and every one opens without errors, shows its source,
// and leads back.

test("every scenario on the dashboard opens its page, without errors, shows its source, and leads back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("pfui playground");
  // Every button on the dashboard opens a scenario.
  const titles = await page.getByRole("button").allTextContents();
  expect(titles).toEqual([
    "Markup",
    "Expressions",
    "Reactivity",
    "Counter",
    "Variables",
    "Async handlers",
    "Component IDs",
    "Source maps",
    "Conditionals",
    "Items and templates",
    "User-defined components",
    "Live compiler",
    "Inputs",
    "Text and headings",
    "Theming",
    "Behaviors",
    "Routing",
  ]);
  for (const title of titles) {
    await page.getByRole("button", { name: title, exact: true }).click();
    // The page title is the first h1 (a scenario may show more, such as the H1 example).
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(title);
    // The scenario's own source, as monospace text with its line breaks and indentation.
    const source = page.locator("pre code").first();
    await expect(source).toContainText('<Component name="');
    const text = (await source.textContent())!;
    expect(text.split("\n").length).toBeGreaterThan(5);
    expect(text).toMatch(/\n {2,}</);
    expect(await source.evaluate((el) => getComputedStyle(el.parentElement!).whiteSpace)).toBe("pre");
    await page.getByRole("button", { name: "← Dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("pfui playground");
  }
  expect(errors).toEqual([]);
});
