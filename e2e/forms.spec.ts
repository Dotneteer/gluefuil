import { expect, test, type Page } from "@playwright/test";

// test-apps/forms (step 22): a sign-up form. Inputs bind with bindTo (no
// FormItem). Projects forms-dev (5186) and forms-build (5187, prerendered:
// every test runs after a takeover).

const message = (page: Page) => page.locator(".pfui-ValidationMessage");
const text = (page: Page, prefix: string) => page.locator(".pfui-Text").filter({ hasText: new RegExp(`^${prefix}`) });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
  expect(errors).toEqual([]);
});

test("errors show late: not while typing the first time, on leaving the input, and go away once valid", async ({ page }) => {
  const name = page.getByLabel("Name");
  await name.fill("A");
  await expect(message(page)).toHaveCount(0);
  await name.press("Tab");
  await expect(message(page)).toHaveText(["Input should be at least 2 characters"]);
  await expect(name).toHaveAttribute("aria-invalid", "true");
  const describedBy = await name.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Input should be at least 2 characters");
  await name.focus();
  await name.press("End");
  await name.pressSequentially("nn");
  await expect(message(page)).toHaveCount(0);
  await expect(text(page, "Preview:")).toHaveText("Preview: Ann from  (user)");
});

test("Save with errors: every message shows, the focus moves to the first invalid input, nothing is submitted", async ({ page }) => {
  await page.getByRole("button", { name: "Save" }).click();
  await expect(message(page)).toHaveText(["This field is required", "This field is required", "This field is required"]);
  await expect(page.getByLabel("Name")).toBeFocused();
  await expect(text(page, "Result:")).toHaveText("Result:");
});

test("keyboard only: fill in, Enter submits; the button says Saving... meanwhile; a warning doesn't block; clean afterwards", async ({ page }) => {
  await page.getByLabel("Name").focus();
  await page.keyboard.type("Ann");
  await page.keyboard.press("Tab");
  await page.keyboard.type("ann@example.com");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Llanfairpwllgwyngyll");
  await page.keyboard.press("Tab");
  await expect(message(page)).toHaveText(["Input should be up to 10 characters"]);
  await expect(message(page)).toHaveAttribute("data-severity", "warning");
  await page.getByLabel("I agree to the terms").check();
  await expect(text(page, "Dirty:")).toHaveText("Dirty: true");
  await page.getByLabel("Name").press("Enter");
  await expect(page.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect(page.getByLabel("Name")).toBeDisabled();
  await expect(text(page, "Result:")).toHaveText('Result: {"name":"Ann","email":"ann@example.com","address":{"city":"Llanfairpwllgwyngyll"},"role":"user","agree":true} ok');
  await expect(text(page, "Dirty:")).toHaveText("Dirty: false");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("an async check: its message appears when it settles", async ({ page }) => {
  const email = page.getByLabel("Email");
  await email.fill("taken@example.com");
  await email.press("Tab");
  await expect(message(page)).toHaveText(["Already registered"]);
  await email.fill("free@example.com");
  await email.press("Tab");
  await expect(message(page)).toHaveCount(0);
});

test("the select binds; the labels name their inputs and mark the required ones", async ({ page }) => {
  await page.getByLabel("Role").click();
  await page.getByRole("option", { name: "admin" }).click();
  await expect(text(page, "Preview:")).toHaveText("Preview:  from  (admin)");
  const marked = await page.locator(".pfui-Label-text").evaluateAll((labels) =>
    labels.map((label) => `${label.textContent}${getComputedStyle(label, "::after").content.replace(/^none$/, "")}`),
  );
  expect(marked).toEqual(['Name" *"', 'Email" *"', "City", "Role"]);
});
