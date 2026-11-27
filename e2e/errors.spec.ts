import { expect, test, type Page } from "@playwright/test";

// Step 33 in the playground's "Errors and recovery" scenario (project
// "playground"): RetryPolicy against the mock backend in a service worker
// (attempts, Retry-After timed, a circuit breaker), the correlation id, a
// Fallback and its reset, the default toast and App onError keeping it quiet,
// App.errors. Design: .ai/plan/poc-33-errors.md § Verification.

const open = async (page: Page) => {
  await page.goto("/#/errors");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
// Rendered text only: the page also shows its own source.
const shown = (page: Page, value: RegExp) => page.locator(".gfui-Text").filter({ hasText: value });
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** A fault for the mock backend, sent from the page (the worker answers it). */
const fault = (page: Page, spec: Record<string, unknown>) =>
  page.evaluate(async (body) => {
    await fetch("/__mock/faults", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }, spec);

test("retries: 503 twice, then the data; five failures give up with the last error, its attempts and its reference", async ({ page }) => {
  await open(page);
  await button(page, "Load (fails twice)").click();
  await expect(shown(page, /^Retries: loaded after 3 attempts$/)).toBeVisible();
  await button(page, "Load (fails 5 times)").click();
  await expect(shown(page, /^Retries: failed: http-503 after 4 attempts \(reference req-\d+\)$/)).toBeVisible();
  // Unhandled: the toast, and App.errors.
  await expect(page.locator(".mantine-Notification-root").filter({ hasText: "Attempt 4 failed (on purpose)" })).toBeVisible();
  await expect(shown(page, /^Unhandled errors: 1$/)).toBeVisible();
});

test("a 429 with Retry-After: the next attempt waits for it", async ({ page }) => {
  await open(page);
  await fault(page, { route: "GET /api/errors/flaky", status: 429, times: 1, headers: { "Retry-After": "1" } });
  const started = Date.now();
  await button(page, "Load (fails twice)").click();
  // 429 (waits 1 s: Retry-After), 503 (≈ 600 ms), 503 (≈ 1200 ms), then the data; jitter is ±25%.
  await expect(shown(page, /^Retries: loaded after 3 attempts$/)).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(1000 + 450 + 900);
});

test("the circuit breaker: three failures open it, the next call fails fast", async ({ page }) => {
  await open(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/errors/down")) calls.push(request.url());
  });
  for (let i = 0; i < 4; i++) {
    await button(page, "Call the service").click();
    await expect(shown(page, new RegExp(`^Calls: ${Array.from({ length: i + 1 }, () => "[a-z0-9-]+").join(", ")}$`))).toBeVisible();
  }
  await expect(shown(page, /^Calls: http-503, http-503, http-503, circuit-open$/)).toBeVisible();
  expect(calls.length).toBe(3);
});

test("a Fallback: the errorTemplate with the category, code and reference; Try again loads the section", async ({ page }) => {
  await open(page);
  const section = card(page, "A section that falls back");
  await expect(section.getByText("Quarterly report: 42 rows", { exact: true })).toBeVisible();
  await section.getByRole("switch", { name: "The server fails" }).check({ force: true });
  await expect(section.getByText("We hit a snag (server, http-500)", { exact: true })).toBeVisible();
  await expect(section.getByText(/^Reference: req-\d+$/)).toBeVisible();
  // Handled by the Fallback: no toast, not in App.errors.
  await expect(shown(page, /^Unhandled errors: 0$/)).toBeVisible();
  await section.getByRole("switch", { name: "The server fails" }).uncheck({ force: true });
  await section.getByRole("button", { name: "Try again" }).click();
  await expect(section.getByText("Quarterly report: 42 rows", { exact: true })).toBeVisible();
});

test("a component that throws: only its card's content is replaced, and Reset brings it back", async ({ page }) => {
  await open(page);
  const widget = card(page, "A component that throws");
  await widget.getByRole("switch", { name: "Break it" }).check({ force: true });
  await expect(widget.getByText(/^Render error: .*JSON/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Errors and recovery", level: 1 })).toBeVisible();
  await widget.getByRole("switch", { name: "Break it" }).uncheck({ force: true });
  await widget.getByRole("button", { name: "Reset" }).click();
  await expect(widget.getByText("All good", { exact: true })).toBeVisible();
});

test("handler errors: a toast and an announcement by default; onError on the button handles its own; App onError keeps it quiet", async ({ page }) => {
  await open(page);
  const handlers = card(page, "Handler errors");
  await handlers.getByRole("button", { name: "Throw an AppError" }).click();
  await expect(page.locator(".mantine-Notification-root").filter({ hasText: "Too many exports today" })).toBeVisible();
  await expect(page.locator(".gfui-ErrorAnnouncer")).toHaveText("Too many exports today");
  await expect(shown(page, /^quota · rate-limit · Too many exports today$/)).toBeVisible();
  await handlers.getByRole("button", { name: "Handled here" }).click();
  await expect(shown(page, /^Handled: action: Handled by the button$/)).toBeVisible();
  await expect(shown(page, /^Unhandled errors: 1$/)).toBeVisible();
  await handlers.getByRole("switch", { name: "App onError keeps it quiet" }).check({ force: true });
  await handlers.getByRole("button", { name: "Throw an Error" }).click();
  await expect(shown(page, /^Unhandled errors: 2$/)).toBeVisible();
  await expect(page.locator(".mantine-Notification-root").filter({ hasText: "Export failed" })).toHaveCount(0);
});
