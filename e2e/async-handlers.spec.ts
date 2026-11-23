import { expect, test } from "@playwright/test";

// test-apps/hello (step 7): async handlers and policies in a real browser.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a slow handler shows its progress, then its result", async ({ page }) => {
  const status = page.getByText(/^Status: /);
  await expect(status).toHaveText("Status: Idle");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(status).toHaveText("Status: Saving…");
  await expect(status).toHaveText("Status: Saved");
});

test("the UI stays responsive while a handler waits", async ({ page }) => {
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(page.getByText(/^Count: /)).toHaveText("Count: 1");
  await expect(page.getByText(/^Status: /)).toHaveText("Status: Saving…");
});

for (const [policy, expected] of [
  ["parallel", "s1,s2,e1,e2"],
  ["single-flight", "s1,s2,e2"],
  ["queue", "s1,e1,s2,e2"],
  ["drop-while-running", "s1,e1"],
] as const) {
  test(`double-click under ${policy}`, async ({ page }) => {
    await page.getByRole("button", { name: policy, exact: true }).dblclick();
    await expect(page.getByText(new RegExp(`^${policy}: `))).toHaveText(`${policy}: ${expected}`);
  });
}
