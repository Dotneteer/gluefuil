import { expect, test, type Page } from "@playwright/test";

// test-apps/forms (step 22): a sign-up form. Inputs bind with bindTo (no
// FormItem). Projects forms-dev (5186) and forms-build (5187, prerendered:
// every test runs after a takeover).

const signup = (page: Page) => page.locator(".pfui-Form").first();
const message = (page: Page) => signup(page).locator(".pfui-ValidationMessage");
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
  const name = page.getByLabel("Name", { exact: true });
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
  await signup(page).getByRole("button", { name: "Save" }).click();
  await expect(message(page)).toHaveText(["This field is required", "This field is required", "This field is required"]);
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(text(page, "Result:")).toHaveText("Result:");
});

test("keyboard only: fill in, Enter submits; the button says Saving... meanwhile; a warning doesn't block; clean afterwards", async ({ page }) => {
  await page.getByLabel("Name", { exact: true }).focus();
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
  await page.getByLabel("Name", { exact: true }).press("Enter");
  await expect(signup(page).getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  await expect(text(page, "Result:")).toHaveText('Result: {"name":"Ann","email":"ann@example.com","address":{"city":"Llanfairpwllgwyngyll"},"role":"user","agree":true} ok');
  await expect(text(page, "Dirty:")).toHaveText("Dirty: false");
  await expect(signup(page).getByRole("button", { name: "Save" })).toBeEnabled();
});

test("an async check: its message appears when it settles", async ({ page }) => {
  const email = page.getByLabel("Email", { exact: true });
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
  const marked = await signup(page).locator(".pfui-Label-text").evaluateAll((labels) =>
    labels.map((label) => `${label.textContent}${getComputedStyle(label, "::after").content.replace(/^none$/, "")}`),
  );
  expect(marked).toEqual(['Name" *"', 'Email" *"', "City", "Role"]);
});

// Step 22B: the Profile form loads /api/people/1 from the mock backend (a
// service worker, in the build too) and PUTs it back.

/** A control request to the mock backend, sent from the page. */
async function control(page: Page, path: string, body?: unknown, method = "POST"): Promise<unknown> {
  return page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch(`/__mock${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return response.status === 204 ? undefined : response.json();
    },
    { path, body, method },
  );
}
const holds = async (page: Page) => (await control(page, "/holds", undefined, "GET")) as { id: number; url: string }[];
const profile = (page: Page) => page.locator(".pfui-Form").nth(1);

test.describe("the profile form (step 22B)", () => {
  test.beforeEach(async ({ page }) => {
    await control(page, "/reset");
    await page.reload();
    await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
    await expect(page.getByLabel("Full name")).toHaveValue("Ada");
  });

  test("a 422: the messages on the inputs (a nested path too) and the focus on the first; an edit clears one; the resubmit saves and refreshes the list", async ({ page }) => {
    await page.getByLabel("E-mail").fill("taken@example.com");
    await page.getByLabel("Town").fill("Atlantis");
    await profile(page).getByRole("button", { name: "Save" }).click();
    await expect(profile(page).locator(".pfui-Field-messages .pfui-ValidationMessage")).toHaveText(["Already registered", "Unknown city"]);
    await expect(profile(page).getByRole("alert")).toHaveText("Please check the form");
    await expect(page.getByLabel("E-mail")).toBeFocused();
    await page.getByLabel("E-mail").fill("ada@lovelace.org");
    await page.getByLabel("Town").fill("Marylebone");
    await expect(profile(page).locator(".pfui-Field-messages .pfui-ValidationMessage")).toHaveCount(0);
    await page.getByLabel("Full name").fill("Ada Lovelace");
    await profile(page).getByRole("button", { name: "Save" }).click();
    await expect(text(page, "Saved:")).toHaveText("Saved: Saved Ada Lovelace");
    await expect(text(page, "People:")).toHaveText("People: Ada Lovelace, Alan");
  });

  test("a slow server: Saving..., disabled; Stop saving cancels quietly", async ({ page }) => {
    await control(page, "/faults", { route: "PUT /api/people/:id", hold: true, times: 1 });
    await page.getByLabel("Full name").fill("Ada L.");
    await profile(page).getByRole("button", { name: "Save" }).click();
    await expect(profile(page).getByRole("button", { name: "Saving..." })).toBeDisabled();
    await expect(page.getByLabel("Full name")).toBeDisabled();
    await expect.poll(async () => (await holds(page)).length).toBe(1);
    await page.getByRole("button", { name: "Stop saving" }).click();
    await expect(text(page, "Cancelled:")).toHaveText("Cancelled: true");
    await expect(page.getByLabel("Full name")).toBeEnabled();
    await expect(page.getByLabel("Full name")).toHaveValue("Ada L.");
    await expect(text(page, "Saved:")).toHaveText("Saved:");
    await control(page, "/holds/release-all");
  });

  test("a 500: the message in the summary", async ({ page }) => {
    await control(page, "/faults", { route: "PUT /api/people/:id", status: 500, body: { message: "Database down" }, times: 1 });
    await page.getByLabel("Full name").fill("Ada!");
    await profile(page).getByRole("button", { name: "Save" }).click();
    await expect(profile(page).getByRole("alert")).toHaveText("Database down");
  });
});
