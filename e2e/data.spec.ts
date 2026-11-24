import { expect, test, type Page } from "@playwright/test";

// Data binding (step 20) in a real browser: test-apps/data against the mock
// backend in two hosts. Project data-worker: a service worker answers in the
// page (5182). Project data-server: the dev server answers over HTTP (5183).
// The same tests pass in both: the app can't tell what it talks to. The
// backend is steered through its control endpoints (/__mock), like a real
// test harness. Catalog rows: .ai/plan/poc-20-data.md § 6.

/** A control request to the backend, sent from the page (it reaches the backend in both hosts). */
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

const fault = (page: Page, spec: Record<string, unknown>) => control(page, "/faults", spec);
const log = async (page: Page) => ((await control(page, "/requests", undefined, "GET")) as { method: string; url: string; outcome: string }[]).map((e) => `${e.method} ${e.url} ${e.outcome}`);
/** Waits until a request whose URL ends with `suffix` is held; returns its id. */
async function heldRequest(page: Page, suffix: string): Promise<number> {
  const find = async () => ((await control(page, "/holds", undefined, "GET")) as { id: number; url: string }[]).find((h) => h.url.endsWith(suffix));
  await expect.poll(async () => (await find()) !== undefined).toBe(true);
  return (await find())!.id;
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The dev-server backend outlives a page: start from its seed. (The worker's is new with each page.)
  await page.request.post("/__mock/reset").catch(() => undefined);
  await page.goto("/");
  await expect(page.getByText("Users: Ada Lovelace, Alan Turing, Grace Hopper, Edsger Dijkstra")).toBeVisible();
  await control(page, "/requests", undefined, "DELETE");
  return errors;
}

const users = (page: Page) => page.getByText(/^Users: /);
const reload = (page: Page) => page.getByRole("button", { name: "Reload" }).click();
const search = (page: Page, text: string) => page.getByPlaceholder("Search").fill(text);

test("the app's requests are real requests; one request serves two DataSources (M2, L2)", async ({ page }, testInfo) => {
  const responses: { url: string; fromServiceWorker: boolean }[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/")) responses.push({ url: new URL(response.url()).pathname, fromServiceWorker: response.fromServiceWorker() });
  });
  const errors = await open(page);
  // Two DataSources with the same request: one request.
  expect(responses).toEqual([{ url: "/api/users", fromServiceWorker: testInfo.project.name === "data-worker" }]);
  await expect(page.getByText("Count: 4")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a slow network: the loading state, then the data (S1, L1)", async ({ page }) => {
  await open(page);
  await fault(page, { route: "GET /api/users", latency: 1500, times: 1 });
  await reload(page);
  await expect(page.getByText("Loading users…")).toBeVisible();
  await expect(page.getByText("Loading users…")).toBeHidden({ timeout: 4000 });
  await expect(users(page)).toHaveText("Users: Ada Lovelace, Alan Turing, Grace Hopper, Edsger Dijkstra");
});

test("typing: the older answer arrives last and never shows (O1, L4)", async ({ page }) => {
  await open(page);
  await fault(page, { route: "GET /api/users", hold: true });
  await search(page, "a");
  const older = await heldRequest(page, "q=a");
  await search(page, "gr");
  await control(page, `/holds/${await heldRequest(page, "q=gr")}/release`);
  await expect(users(page)).toHaveText("Users: Grace Hopper");
  // The older request was aborted when the search changed. The dev server sees the abort and
  // drops the hold; a service worker's handler doesn't, so there the answer still comes, late.
  await control(page, `/holds/${older}/release`).catch(() => undefined);
  await page.waitForTimeout(200);
  await expect(users(page)).toHaveText("Users: Grace Hopper");
});

test("503 twice, then 200: retried, the list appears, no error (R1)", async ({ page }) => {
  await open(page);
  await fault(page, { route: "GET /api/users", status: 503, times: 2 });
  await reload(page);
  await expect.poll(() => log(page)).toEqual(["GET /api/users?q= fault", "GET /api/users?q= fault", "GET /api/users?q= ok"]);
  await expect(page.getByText(/Couldn't load/)).toBeHidden();
  await expect(users(page)).toHaveText("Users: Ada Lovelace, Alan Turing, Grace Hopper, Edsger Dijkstra");
});

test("the connection fails every time: the error after three attempts, the old list kept (X2, X5)", async ({ page }) => {
  await open(page);
  await fault(page, { route: "GET /api/users", network: "error" });
  await reload(page);
  await expect(page.getByText(/^Couldn't load users \(network, 3 attempts\)/)).toBeVisible();
  await expect(users(page)).toHaveText("Users: Ada Lovelace, Alan Turing, Grace Hopper, Edsger Dijkstra");
  await control(page, "/faults", undefined, "DELETE");
  await reload(page);
  await expect(page.getByText(/Couldn't load/)).toBeHidden();
});

test("a hanging server: Stop cancels, the list stays; Reload works again (C1)", async ({ page }) => {
  await open(page);
  await fault(page, { route: "GET /api/users", network: "hang", times: 1 });
  await reload(page);
  await expect(page.getByText("Loading users…")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Loading stopped.")).toBeVisible();
  await expect(page.getByText("Loading users…")).toBeHidden();
  await expect(users(page)).toHaveText("Users: Ada Lovelace, Alan Turing, Grace Hopper, Edsger Dijkstra");
  await reload(page);
  await expect(page.getByText("Loading stopped.")).toBeHidden();
});

test("open a user, rename: the PUT, then the list refetches (L3, W1)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Open Alan Turing" }).click();
  await expect(page.getByText("Role: editor")).toBeVisible();
  await page.getByPlaceholder("New name").fill("Alan M. Turing");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved Alan M. Turing")).toBeVisible();
  await expect(users(page)).toHaveText("Users: Ada Lovelace, Alan M. Turing, Grace Hopper, Edsger Dijkstra");
  // invalidates="/api/users": the list and everything below it (the open user) refetch.
  await expect.poll(async () => (await log(page)).sort()).toEqual(["GET /api/users/2 ok", "GET /api/users/2 ok", "GET /api/users?q= ok", "PUT /api/users/2 ok"]);
});

test("a validation error from the server reaches the page (X6)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Open Grace Hopper" }).click();
  await expect(page.getByText("Role: editor")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Not saved (validation): Invalid user")).toBeVisible();
});

test("a slow save clicked twice (drop-while-running): one request (S4)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Open Ada Lovelace" }).click();
  await expect(page.getByText("Role: admin")).toBeVisible();
  await fault(page, { route: "PUT /api/users/:id", latency: 800, times: 1 });
  await page.getByPlaceholder("New name").fill("Ada King");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saving…")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved Ada King")).toBeVisible();
  expect((await log(page)).filter((line) => line.startsWith("PUT"))).toEqual(["PUT /api/users/1 ok"]);
});
