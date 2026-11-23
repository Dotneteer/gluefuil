import { expect, test } from "@playwright/test";

// test-apps/hello (step 8): reading and writing another component through its id.
test.beforeEach(async ({ page }) => {
  await page.goto("http://localhost:5174/");
});

test("typing in a TextBox updates a Text declared before it", async ({ page }) => {
  const greeting = page.getByText(/^Greeting: /);
  await expect(greeting).toHaveText("Greeting: Hello, stranger!");
  await page.getByPlaceholder("Your name").fill("ada");
  await expect(greeting).toHaveText("Greeting: Hello, ada!");
});

test("handlers call another component's API methods", async ({ page }) => {
  const box = page.getByPlaceholder("Your name");
  await box.fill("ada");
  await page.getByRole("button", { name: "Shout" }).click();
  await expect(box).toHaveValue("ADA");
  await expect(page.getByText(/^Greeting: /)).toHaveText("Greeting: Hello, ADA!");
  await page.getByRole("button", { name: "Reset name" }).click();
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
});
