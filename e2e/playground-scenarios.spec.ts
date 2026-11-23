import { expect, test, type Page } from "@playwright/test";

// The playground's scenarios do what their pages say (project "playground").
// The smoke test (playground.spec.ts) opens every page; this one interacts.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
};
const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" });
// Exact for strings: the page also shows its source, which contains the same phrases.
const text = (page: Page, value: string | RegExp) => page.getByText(value, { exact: typeof value === "string" });

test("Markup: entities, CDATA, whitespace, escaped braces", async ({ page }) => {
  await open(page, "/markup");
  await expect(text(page, "Entities: a < b && c > d, \"double\" and 'single' quotes")).toBeVisible();
  await expect(text(page, "Numeric references stay literal (as in XMLUI, only named entities decode): &#169;")).toBeVisible();
  await expect(text(page, "Non-breaking\u00a0\u00a0\u00a0spaces are kept.")).toBeVisible();
  await expect(text(page, "CDATA is literal: <b>{not an expression}</b> & no entities")).toBeVisible();
  await expect(text(page, "Whitespace runs in text collapse to one space.")).toBeVisible();
  await expect(text(page, "Escaped braces: {not interpolated}, and interpolated.")).toBeVisible();
  await expect(text(page, "Attribute values decode entities too: <tag>")).toBeVisible();
});

test("Expressions: operators, optional chaining, array methods, globals", async ({ page }) => {
  await open(page, "/expressions");
  await expect(text(page, /^Arithmetic: 1 \+ 2 \* 3 = 7; 7 % 3 = 1; \(1 \+ 2\) \* 3 = 9$/)).toBeVisible();
  await expect(text(page, "Template literal: Hello, Ada from London!")).toBeVisible();
  await expect(text(page, /user\.phone\.number is missing, no error/)).toBeVisible();
  await expect(text(page, /^Array methods: sorted 1, 2, 3; doubled 6, 2, 4; sum 6$/)).toBeVisible();
  await expect(text(page, /Math\.max = 3; Number\.isInteger\(2\) = true; new Date\(0\) = 1970-01-01T00:00:00\.000Z/)).toBeVisible();
  await expect(text(page, "typeof, in, instanceof: object, true, true")).toBeVisible();
});

test("Reactivity: the diamond invariant holds through batched writes", async ({ page }) => {
  await open(page, "/reactivity");
  await button(page, "a++ three times in one handler").click();
  await expect(text(page, "a = 4; b = 2a = 8; c = a + 1 = 5; d = b + c = 13")).toBeVisible();
  await expect(text(page, /invariant d = 3a \+ 1: holds/)).toBeVisible();
});

test("Variables: follow until assigned, deep writes, array mutations", async ({ page }) => {
  await open(page, "/variables");
  await button(page, "source++").click();
  await expect(text(page, "source = 2, mirror = 20")).toBeVisible();
  await button(page, "Assign mirror = 0 (stops following)").click();
  await button(page, "source++").click();
  await expect(text(page, "source = 3, mirror = 0")).toBeVisible();
  await button(page, "Move to Paris").click();
  await expect(text(page, "Ada lives in Paris.")).toBeVisible();
  await button(page, "sort").click();
  await expect(text(page, "apple, banana, cherry")).toBeVisible();
  await button(page, "push").click();
  await expect(text(page, "apple, banana, cherry, item 4")).toBeVisible();
  await expect(text(page, "declared with a variable tag")).toBeVisible();
});

test("Async handlers: implicit await, the queue policy, a timeout", async ({ page }) => {
  await open(page, "/async");
  await button(page, "Save (1 s)").click();
  await expect(text(page, "Status: Saving…")).toBeVisible();
  await expect(text(page, /^Status: Saved at /)).toBeVisible({ timeout: 3000 });
  await button(page, "queue").click();
  await button(page, "queue").click();
  await expect(text(page, "q0 start · q0 end · q2 start · q2 end")).toBeVisible({ timeout: 4000 });
  await button(page, "A 3 s job with a 1 s timeout").click();
  await expect(text(page, "Timed job: started")).toBeVisible();
  await page.waitForTimeout(3300);
  await expect(text(page, "Timed job: started")).toBeVisible();
});

test("Component IDs: reading before the declaration, setValue, checkbox API", async ({ page }) => {
  await open(page, "/ids");
  await expect(text(page, 'Declared before the TextBox: "pfui" (4 characters)')).toBeVisible();
  await button(page, "Upper-case").click();
  await expect(text(page, 'Declared before the TextBox: "PFUI" (4 characters)')).toBeVisible();
  await button(page, "Toggle the checkbox from a handler").click();
  await expect(text(page, "flag.value = true")).toBeVisible();
});

test("Conditionals: when unmounts, lifecycle handlers run", async ({ page }) => {
  await open(page, "/conditionals");
  await expect(text(page, "Lifecycle log: mounted")).toBeVisible();
  await button(page, "Hide the panel").click();
  await expect(text(page, /^The panel/)).toHaveCount(0);
  await expect(text(page, "Lifecycle log: mounted, unmounted")).toBeVisible();
});

test("Items: context variables, reverse, and an id per row", async ({ page }) => {
  await open(page, "/templates");
  await expect(text(page, "#1 (first): Write tests")).toBeVisible();
  await expect(text(page, "#3 (last): Ship it")).toBeVisible();
  await page.getByPlaceholder("A note for this row").nth(1).fill("urgent");
  await expect(text(page, "note: urgent")).toHaveCount(1);
  await button(page, "Reverse").click();
  await expect(text(page, "#1 (first): Ship it")).toBeVisible();
  await expect(text(page, "Hello, Grace!")).toBeVisible();
});

test("User-defined components: props and events, methods, slots", async ({ page }) => {
  await open(page, "/user-components");
  await button(page, "★").or(button(page, "☆")).nth(4).click();
  await expect(text(page, "stars = 5")).toBeVisible();
  await button(page, "Click me").click();
  await expect(text(page, "Last event: changed to 1")).toBeVisible();
  await button(page, "Reset from outside (counter.reset())").click();
  await expect(text(page, "Last event: changed to 0")).toBeVisible();
  await button(page, "Like").click();
  await expect(text(page, "A custom header — 1 like(s), from the slot props")).toBeVisible();
  await page.getByPlaceholder("An id inside slot content").fill("slot id works");
  await expect(text(page, "Typed: slot id works")).toBeVisible();
  // The fallback of the default slot: the "custom header" card (header only) and the empty card.
  await expect(text(page, "(no content given)")).toHaveCount(2);
});

test("Live compiler: a working example renders and runs; the others show their diagnostics", async ({ page }) => {
  await open(page, "/live");
  await button(page, "Clicked 0 times").click();
  await expect(text(page, "count is 1")).toBeVisible();
  const statuses = page.getByRole("status");
  await expect(statuses.filter({ hasText: "error C002" })).toHaveCount(1);
  await expect(statuses.filter({ hasText: "error E020: 'Text' has no prop 'valu'. Did you mean 'value'?" })).toHaveCount(1);
  await expect(statuses.filter({ hasText: "error C015: 'box' (TextBox) has no member 'valeu'. Did you mean 'value'?" })).toHaveCount(1);
  await expect(statuses.filter({ hasText: "error E001: Unknown component 'Buton'. Did you mean 'Button'?" })).toHaveCount(1);
  // Editing recompiles: fix the C001 example.
  const editor = page.getByRole("textbox", { name: "Markup: Scoping: unknown names (C001) and read-only names (C012)" });
  await editor.fill('<Stack var.n="{1}"><Text>n is {n}</Text></Stack>');
  await expect(text(page, "n is 1")).toBeVisible();
});

test("Inputs: Select with an option template; a button enabled by the checkbox", async ({ page }) => {
  await open(page, "/inputs");
  await page.getByPlaceholder("Pick a fruit").click();
  await page.getByText("Banana (b)").click();
  await expect(text(page, "Fruit: b")).toBeVisible();
  await expect(button(page, "Only enabled when you agree")).toBeDisabled();
  await page.getByLabel("I agree").check();
  await expect(button(page, "Only enabled when you agree")).toBeEnabled();
});

test("Behaviors: tooltip, label, variant", async ({ page }) => {
  await open(page, "/behaviors");
  await button(page, "Hover me").hover();
  await expect(page.getByRole("tooltip")).toHaveText("A tooltip, from the tooltip behavior");
  await expect(page.getByLabel("A labeled input (click the label to focus)")).toBeVisible();
  const danger = await button(page, "variant=danger").evaluate((el) => getComputedStyle(el).backgroundColor);
  const fallback = await button(page, "variant=nothing (falls back)").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(danger).not.toBe(fallback);
});

test("Routing: route and query parameters, replace, back to the scenario", async ({ page }) => {
  await open(page, "/routing");
  await button(page, "Item 42 with a query").click();
  await expect(text(page, "$routeParams.item = 42")).toBeVisible();
  await expect(text(page, '$queryParams = {"color":"green","size":"L"}')).toBeVisible();
  await button(page, "Next item (pushes history)").click();
  await expect(text(page, "$routeParams.item = 43")).toBeVisible();
  await page.goBack();
  await expect(text(page, "$routeParams.item = 42")).toBeVisible();
  await page.getByRole("link", { name: "A link with an encoded segment" }).isVisible();
  await button(page, "Back to the routing scenario").click();
  await page.getByRole("link", { name: "A link with an encoded segment" }).click();
  await expect(text(page, "$routeParams.item = hello world")).toBeVisible();
});
