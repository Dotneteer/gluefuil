import { expect, test, type Locator, type Page } from "@playwright/test";

// Step 32B in a real browser (project "playground"; the mock backend in a
// service worker, so requests are real): files picked through the dialog
// (setInputFiles), dropped and pasted (a DataTransfer built in the page);
// accept and maxFiles rejections; a Form sending a file as multipart (the
// backend reads it back, names included); a CSV parsed by the lazy papaparse
// chunk; an upload cancelled; a download saved. Scenario:
// playground/src/components/FilesScenario.gui.

const open = async (page: Page) => {
  await page.goto("/#/files");
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
};
const card = (page: Page, title: string) => page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).last();
const line = (scope: Page | Locator, prefix: string) => scope.locator(".gfui-Text").filter({ hasText: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first();

/** A 1×1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Dispatches drag events with files on an element, as a drop from the desktop does. */
async function dropFiles(target: Locator, files: { name: string; type: string; content: string }[], events: string[] = ["dragenter", "dragover", "drop"]) {
  await target.evaluate(
    (el, [list, names]) => {
      const data = new DataTransfer();
      for (const f of list) data.items.add(new File([f.content], f.name, { type: f.type }));
      for (const name of names) el.dispatchEvent(new DragEvent(name, { bubbles: true, cancelable: true, dataTransfer: data }));
    },
    [files, events] as const,
  );
}

test.describe("Files and uploads", () => {
  test("a form sends its attachments as multipart/form-data; required first", async ({ page }) => {
    await open(page);
    const form = card(page, "A form with an attachment");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("This field is required")).toBeVisible();
    await form.locator('input[type="file"]').setInputFiles([
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("smoke everywhere") },
      { name: "photo.png", mimeType: "image/png", buffer: PNG },
    ]);
    await expect(form.getByRole("textbox", { name: "Attachments" })).toHaveValue("notes.txt, photo.png");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(line(form, "Server received: ")).toHaveText(
      `Server received: multipart/form-data: {"subject":"The printer is on fire","attachments":[{"name":"notes.txt","size":16,"type":"text/plain"},{"name":"photo.png","size":${PNG.length},"type":"image/png"}]}`,
    );
  });

  test("files dropped on a FileInput: accepted ones only", async ({ page }) => {
    await open(page);
    const form = card(page, "A form with an attachment");
    await dropFiles(form.locator(".gfui-FileInput"), [
      { name: "a.pdf", type: "application/pdf", content: "%PDF" },
      { name: "virus.exe", type: "application/x-msdownload", content: "MZ" },
    ]);
    await expect(form.getByRole("textbox", { name: "Attachments" })).toHaveValue("a.pdf");
  });

  test("the drop zone: an overlay while dragging, maxFiles and type rejections, an upload with the file's name, Image data", async ({ page }) => {
    await open(page);
    const zone = card(page, "Drop or paste").locator(".gfui-FileUploadDropZone");
    const png = { name: "shot.png", type: "image/png", content: "png" };
    await dropFiles(zone, [png], ["dragenter"]);
    await expect(zone).toHaveAttribute("data-dropping", "");
    await expect(zone.locator(".gfui-FileUploadDropZone-overlay")).toBeVisible();
    await dropFiles(zone, [png], ["dragleave"]);
    await expect(zone).not.toHaveAttribute("data-dropping", /.*/);
    // Four images (more than maxFiles), then a text file: nothing happens.
    await dropFiles(zone, [png, png, png, png]);
    await dropFiles(zone, [{ name: "a.txt", type: "text/plain", content: "x" }]);
    await page.waitForTimeout(300);
    await expect(line(page, "Drop: ")).toHaveText("Drop:");
    await dropFiles(zone, [png]);
    await expect(line(page, "Drop: ")).toHaveText("Drop: uploaded shot.png");
    const image = zone.getByRole("img", { name: "shot.png" });
    await expect(image).toHaveAttribute("src", /^blob:/);
  });

  test("an image pasted into the zone is uploaded once; a FileInput takes no pasted files", async ({ page }) => {
    await open(page);
    const zone = card(page, "Drop or paste").locator(".gfui-FileUploadDropZone");
    await zone.focus();
    await zone.evaluate((el) => {
      const data = new DataTransfer();
      data.items.add(new File(["png"], "pasted.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(line(page, "Drop: ")).toHaveText("Drop: uploaded pasted.png");
    await expect(zone.getByRole("img", { name: "pasted.png" })).toHaveCount(1);
    // A file pasted into the subject box of the form (not a drop zone) and into a zone with allowPaste off: nothing.
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/")) requests.push(r.url());
    });
    await card(page, "Upload and download").locator(".gfui-FileInput").evaluate((el) => {
      const data = new DataTransfer();
      data.items.add(new File(["x"], "nope.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
    await expect(card(page, "Upload and download").getByRole("textbox", { name: "Receipt" })).toHaveValue("");
  });

  test("a CSV is parsed by papaparse, loaded only when needed; a broken JSON reports parseError", async ({ page }) => {
    const chunk: string[] = [];
    page.on("request", (request) => {
      if (/files-parse|papaparse/.test(request.url())) chunk.push(request.url());
    });
    await open(page);
    expect(chunk).toEqual([]);
    const parse = card(page, "Parse a CSV or JSON file");
    await parse.locator('input[type="file"]').first().setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from("name,age\nAda,36\nAlan,41\n") });
    await expect(line(parse, "Parsed: ")).toHaveText("Parsed: csv: 2 rows (fields: name, age)");
    await expect(parse.getByRole("row")).toHaveCount(3);
    await expect(parse.locator(".gfui-Table").getByText("Alan", { exact: true })).toBeVisible();
    expect(chunk.length).toBeGreaterThan(0);
    await parse.locator('input[type="file"]').nth(1).setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
    await expect(line(parse, "Parsed: ")).toHaveText(/^Parsed: json: 0 rows/);
  });

  test("an upload can be cancelled; then it completes with the file's name and size", async ({ page }) => {
    await open(page);
    const box = card(page, "Upload and download");
    await box.locator('input[type="file"]').setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 receipt") });
    await box.getByRole("button", { name: "Upload (1.5 s)" }).click();
    await expect(line(box, "Receipt: ")).toHaveText("Receipt: uploading…");
    await box.getByRole("button", { name: "Cancel upload" }).click();
    await expect(line(box, "Receipt: ")).toHaveText("Receipt: cancelled (user)");
    await box.getByRole("button", { name: "Upload (1.5 s)" }).click();
    await expect(line(box, "Receipt: ")).toHaveText("Receipt: received receipt.pdf (16 bytes)", { timeout: 6000 });
  });

  test("a download is saved under the server's file name, with its content", async ({ page }) => {
    await open(page);
    const box = card(page, "Upload and download");
    const [download] = await Promise.all([page.waitForEvent("download"), box.getByRole("button", { name: "Download people.csv" }).click()]);
    expect(download.suggestedFilename()).toBe("people.csv");
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString("utf8");
    expect(content.split("\n")[0]).toBe("name,field");
    expect(content).toContain("Ada Lovelace,Mathematics");
    await expect(line(box, "Downloads: ")).toHaveText("Downloads: 1");
  });
});
