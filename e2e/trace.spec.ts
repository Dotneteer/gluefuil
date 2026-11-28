import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// Step 35 in the playground's "Tracing" scenario (project "playground", the dev
// server: tracing on by default): the Inspector in its own tab, live; causes,
// masking, filters, the trace tree, export and import, pause, a reload; the
// app's timers unaffected while the Inspector works. Design:
// .ai/plan/poc-35-observability.md § Verification.

const open = async (page: Page) => {
  await page.goto("/#/tracing");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await expect(page.getByTestId("trace-status")).toContainText("Tracing is on");
};
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** Opens the Inspector through the app's button (trace.inspect(): a new tab without an opener). */
async function inspector(context: BrowserContext, app: Page): Promise<Page> {
  const [page] = await Promise.all([context.waitForEvent("page"), button(app, "Open the Inspector").click()]);
  await page.waitForLoadState();
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  return page;
}
/**
 * The Inspector's entry rows (the first table; not the header). Rows are matched on
 * their textContent, where cells run together ("stateq"): no \b in the patterns.
 * The table is virtualized: a row far down is found after filtering.
 */
const rows = (inspectorPage: Page) => inspectorPage.locator(".gfui-Table").first().locator('[role="row"]').filter({ hasNot: inspectorPage.getByRole("columnheader") });
const filter = (inspectorPage: Page, text: string) => inspectorPage.getByPlaceholder("Filter: element, file, text").fill(text);
const rowWith = (inspectorPage: Page, text: string | RegExp) => rows(inspectorPage).filter({ hasText: text });

test("the dev server traces by default; the Inspector opens in its own tab and shows what happened, at its lines", async ({ page, context }) => {
  await open(page);
  await button(page, "Add one").click();
  const inspectorPage = await inspector(context, page);
  expect(await inspectorPage.evaluate(() => window.opener)).toBeNull();
  // The snapshot: what happened before the Inspector opened.
  await expect(rowWith(inspectorPage, /count\s*0 → 1/)).toBeVisible();
  await expect(rowWith(inspectorPage, /count\s*0 → 1/)).toContainText("src/components/TracingScenario.gui:");
  // Live: a new action shows up.
  await button(page, "Log to the console").click();
  await expect(rowWith(inspectorPage, /console\.info\s*Tracing scenario/)).toBeVisible();
});

test("a write and the request it caused share a trace; the fetch names the write", async ({ page, context }) => {
  await open(page);
  const inspectorPage = await inspector(context, page);
  await page.getByPlaceholder("Search people").fill("an");
  const write = rowWith(inspectorPage, /state\s*q\s*"" → "an"/);
  await expect(write).toBeVisible();
  const seq = (await write.innerText()).trim().split(/\s+/)[0]!;
  const fetchRow = rowWith(inspectorPage, new RegExp(`GET /api/people\\?q=an .*caused by #${seq}`));
  await expect(fetchRow).toBeVisible();
  // Selecting the fetch shows its trace: the handler, the write and the request.
  await fetchRow.click();
  const traceTable = inspectorPage.locator(".gfui-Table").nth(1);
  await expect(traceTable.locator('[role="row"]').filter({ hasText: "TextBox didChange" })).toBeVisible();
  await expect(traceTable.locator('[role="row"]').filter({ hasText: /· q/ })).toBeVisible();
  await expect(inspectorPage.locator(".gfui-Markdown")).toContainText('"kind": "fetch"');
  // The dev server can open the line in the editor.
  await expect(button(inspectorPage, "Open src/components/TracingScenario.gui:23:9")).toBeVisible();
});

test("a password never reaches the Inspector; errors say who handled them; a superseded click is cancelled", async ({ page, context }) => {
  await open(page);
  await page.getByLabel("Password").fill("hunter2");
  await button(page, "Fail, handled here").click();
  await button(page, "Slow (0.8 s)").click();
  await button(page, "Slow (0.8 s)").click();
  await expect(page.getByText("slow runs finished: 1")).toBeVisible();
  const inspectorPage = await inspector(context, page);
  await expect(rowWith(inspectorPage, /secret\s*"•••" → "•••"/)).toBeVisible();
  expect(await inspectorPage.content()).not.toContain("hunter2");
  await expect(rowWith(inspectorPage, /Handled by the button \(onError\)/)).toBeVisible();
  await expect(rowWith(inspectorPage, /cancelled \(supersede\)/)).toBeVisible();
  await expect(rowWith(inspectorPage, /List: the 'id' values must be unique/)).toContainText("TracingScenario.gui:49:9");
});

test("filters: by kind and by text", async ({ page, context }) => {
  await open(page);
  await button(page, "Add one").click();
  await button(page, "Log to the console").click();
  const inspectorPage = await inspector(context, page);
  await expect(rowWith(inspectorPage, /console\.info/)).toBeVisible();
  await filter(inspectorPage, "console.info");
  await expect(rows(inspectorPage)).toHaveCount(1);
  await filter(inspectorPage, "");
  // Kind: State only.
  await inspectorPage.getByRole("combobox").nth(1).click();
  await inspectorPage.getByRole("option", { name: "State" }).click();
  await expect(rows(inspectorPage)).toHaveCount(1);
  await expect(rows(inspectorPage).first()).toContainText("count");
});

test("pause holds new entries; resume shows them; a reload of the app tab is marked", async ({ page, context }) => {
  await open(page);
  const inspectorPage = await inspector(context, page);
  await expect(rows(inspectorPage).first()).toBeVisible();
  await button(inspectorPage, "Pause").click();
  await button(page, "Add one").click();
  await page.waitForTimeout(300);
  await expect(rowWith(inspectorPage, /count\s*0 → 1/)).toHaveCount(0);
  await button(inspectorPage, "Resume").click();
  await expect(rowWith(inspectorPage, /count\s*0 → 1/)).toBeVisible();
  await page.reload();
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await expect(rowWith(inspectorPage, /reload/)).toBeVisible();
});

test("export, then import: the same entries as a source of their own", async ({ page, context }) => {
  await open(page);
  await button(page, "Add one").click();
  const inspectorPage = await inspector(context, page);
  await expect(rowWith(inspectorPage, /count\s*0 → 1/)).toBeVisible();
  const [download] = await Promise.all([inspectorPage.waitForEvent("download"), button(inspectorPage, "Export").click()]);
  const path = await download.path();
  const exported = JSON.parse(readFileSync(path, "utf8"));
  expect(exported).toMatchObject({ format: "gfui-trace", version: 1 });
  expect(exported.entries.some((e: { kind: string; variable?: string }) => e.kind === "state" && e.variable === "count")).toBe(true);
  // A .json file (the picker accepts only those).
  await inspectorPage.locator('input[type="file"]').setInputFiles({ name: "saved-trace.json", mimeType: "application/json", buffer: readFileSync(path) });
  // The source picker shows the imported file.
  await expect(inspectorPage.getByRole("combobox").first()).toHaveText("saved-trace.json (imported)");
  await expect(rowWith(inspectorPage, /count\s*0 → 1/)).toBeVisible();
});

test("the app's timers keep time while the Inspector draws a busy trace (it runs on its own thread)", async ({ page, context }) => {
  await open(page);
  const inspectorPage = await inspector(context, page);
  await expect(rows(inspectorPage).first()).toBeVisible();
  // The app measures its worst timer lag while it makes 200 entries a second for 2 s.
  const worst = await page.evaluate(async () => {
    const add = [...document.querySelectorAll("button")].find((b) => b.textContent === "Add one")!;
    let worstLag = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      worstLag = Math.max(worstLag, now - last - 10);
      last = now;
      add.click();
    }, 10);
    await new Promise((r) => setTimeout(r, 2000));
    clearInterval(timer);
    return worstLag;
  });
  expect(worst).toBeLessThan(100);
  // Every write arrived: the last one, found by filtering (the table is virtualized).
  const last = (await page.getByText(/^count = \d+$/).textContent())!.replace("count = ", "");
  await filter(inspectorPage, `→ ${last}`);
  await expect(rowWith(inspectorPage, new RegExp(`count\\s*\\d+ → ${last}(?!\\d)`))).toHaveCount(1);
});
