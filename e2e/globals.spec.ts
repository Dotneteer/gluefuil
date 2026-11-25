import { expect, test, type Page } from "@playwright/test";

// test-apps/hello (step 21B): the global `likes` of Main.gui's root and the
// Globals.xs declarations (visitor, likeLabel, like) are read and written by
// two component files. Runs on the dev server and on the prerendered build
// (after the takeover).

const text = (page: Page, value: string | RegExp) => page.locator(".gfui-Text").filter({ hasText: value });

test("a component file writes globals; Main and another component file read them; a local variable shadows one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await expect(text(page, /^Likes in Main:/)).toHaveText("Likes in Main: 0 (guest)");
  await expect(text(page, /^Likes so far:/)).toHaveText("Likes so far: 0 likes, visitor local");

  await page.getByRole("button", { name: "Like", exact: true }).click();
  await expect(text(page, /^Likes in Main:/)).toHaveText("Likes in Main: 1 (member)");
  await expect(text(page, /^Likes so far:/)).toHaveText("Likes so far: 1 like, visitor local");
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await expect(text(page, /^Likes so far:/)).toHaveText("Likes so far: 2 likes, visitor local");
  expect(errors).toEqual([]);
});
