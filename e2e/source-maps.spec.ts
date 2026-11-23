import { originalPositionFor, type SourceMap } from "@patchfuil/compiler";
import { expect, test } from "@playwright/test";

// test-apps/hello (step 9): through the Chrome DevTools Protocol, pause on an
// exception thrown by a handler and resolve the paused location with the source
// map Chromium received: it must be the `throw` line in Main.pfui.
test("a handler's exception resolves to its line in the .pfui file", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map<string, { url: string; sourceMapURL: string }>();
  cdp.on("Debugger.scriptParsed", (event) => scripts.set(event.scriptId, { url: event.url, sourceMapURL: event.sourceMapURL ?? "" }));
  await cdp.send("Debugger.enable");
  await page.goto("http://localhost:5174/");
  await expect(page.getByRole("button", { name: "Throw" })).toBeVisible();
  await cdp.send("Debugger.setPauseOnExceptions", { state: "all" });

  const paused = new Promise<{ scriptId: string; lineNumber: number; columnNumber: number }>((resolve) => {
    cdp.on("Debugger.paused", (event) => {
      const description = String((event.data as { description?: string } | undefined)?.description ?? "");
      // A throw inside an async function (handlers are async) pauses as "promiseRejection".
      if ((event.reason === "exception" || event.reason === "promiseRejection") && description.includes("thrown in Main.pfui")) {
        const location = event.callFrames[0]!.location;
        resolve({ scriptId: location.scriptId, lineNumber: location.lineNumber, columnNumber: location.columnNumber ?? 0 });
      } else {
        void cdp.send("Debugger.resume");
      }
    });
  });
  // Not awaited: the page is paused until we resume.
  void page.getByRole("button", { name: "Throw" }).click();
  const location = await paused;

  const script = scripts.get(location.scriptId)!;
  expect(script.url).toMatch(/\/src\/Main\.pfui(\?|$)/);
  // Vite serves the module with an inline map (data URL).
  const base64 = script.sourceMapURL.split("base64,")[1];
  expect(base64, script.sourceMapURL.slice(0, 60)).toBeTruthy();
  const map = JSON.parse(Buffer.from(base64!, "base64").toString("utf8")) as SourceMap;
  expect(map.sources.some((source) => source.endsWith("Main.pfui"))).toBe(true);

  const original = originalPositionFor(map, location.lineNumber, location.columnNumber);
  expect(original).toBeDefined();
  const markupLine = map.sourcesContent![0]!.split("\n")[original!.line]!;
  expect(markupLine.slice(original!.column)).toBe("throw new Error('thrown in Main.pfui: ' + reason);");

  await cdp.send("Debugger.setPauseOnExceptions", { state: "none" });
  await cdp.send("Debugger.resume");
});
