import { expect, test, type Page } from "@playwright/test";

// Step 35 against the hello app's production build (project "hello-build", under
// a strict CSP): tracing is off by default, so nothing answers on the channel;
// `?gfui-trace` turns it on for the tab, and entries name `src/Main.gui` lines.
// The channel is read from a second page of the same origin, as the Inspector does.

interface Snapshot {
  type: string;
  entries: { kind: string; variable?: string; at?: { file: string; line: number; element: string } }[];
}

/** Says hello on the trace channel from `listener`; resolves to the snapshots that came back within `ms`. */
const hello = (listener: Page, ms = 800) =>
  listener.evaluate(
    (wait) =>
      new Promise<Snapshot[]>((resolve) => {
        const channel = new BroadcastChannel("gfui-trace");
        const got: Snapshot[] = [];
        channel.onmessage = (event) => {
          if ((event.data as Snapshot).type === "snapshot") got.push(event.data as Snapshot);
        };
        channel.postMessage({ type: "hello" });
        setTimeout(() => {
          channel.close();
          resolve(got);
        }, wait);
      }),
    ms,
  );

test("off by default in a build: no entries, nothing on the channel", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  expect(await page.locator("#root").getAttribute("data-gfui-trace")).toBeNull();
  const listener = await context.newPage();
  await listener.goto("/");
  expect(await hello(listener)).toEqual([]);
});

test("?gfui-trace turns it on for the tab: entries at src/Main.gui lines", async ({ page, context }) => {
  await page.goto("/?gfui-trace");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  const listener = await context.newPage();
  await listener.goto("/");
  const snapshots = await hello(listener);
  const write = snapshots.flatMap((s) => s.entries).find((e) => e.kind === "state" && e.variable === "count");
  expect(write?.at).toMatchObject({ file: "src/Main.gui", line: 9, element: "count" });
  // Remembered for the tab: a reload without the parameter still traces.
  await page.goto("/");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
  expect(await page.evaluate(() => sessionStorage.getItem("gfui.trace"))).toBe("1");
});
