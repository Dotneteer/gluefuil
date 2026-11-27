// Step 32B in jsdom: FileInput (picked files, accept rules, a Form, parseAs),
// FileUploadDropZone (drops, maxFiles, accept), Image data, action elements in
// <event> (APICall, FileUpload, FileDownload), Actions.upload, a Form's
// multipart submit. Requests go to a stubbed fetch (what the gate sends);
// drags, pastes and real multipart round trips are E2E (e2e/files.spec.ts).
// Design: .ai/plan/poc-32b-files.md
import { compileModule } from "@gluefuil/compiler";
import { isEmptyValue, loadModule, resetDataState, resetOverlayState, setErrorReporter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as components from "../src/index";
import { acceptsFile, deepEqual } from "../src/index";

let errors: unknown[];
let restore: () => void;
let requests: { url: string; method: string; body: unknown; headers: Record<string, string> }[];
let respond: (url: string) => Response;

beforeEach(() => {
  errors = [];
  restore = setErrorReporter((error) => errors.push(error));
  requests = [];
  respond = () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    requests.push({ url: String(url), method: String(init.method), body: init.body, headers: (init.headers ?? {}) as Record<string, string> });
    return respond(String(url));
  });
});
afterEach(() => {
  cleanup();
  restore();
  vi.unstubAllGlobals();
  resetDataState();
  resetOverlayState();
});

function compiled(markup: string): ComponentType {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics.filter((d) => d.severity !== "warning")).toEqual([]);
  return loadModule(code, { components }) as ComponentType;
}
const show = (markup: string) => {
  const Main = compiled(markup);
  return render(<Main />);
};
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent?.slice(prefix.length);
const click = (label: string) => act(async () => fireEvent.click(screen.getByRole("button", { name: label })));
const file = (name: string, content = "hello", type = "text/plain") => new File([content], name, { type });

/** Picks files through a dropzone's hidden input, as the file dialog does. */
async function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
  await settle(10);
}
const fileInputs = () => [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')];

describe("accept rules and the fixes", () => {
  test.each([
    [".pdf by its name", { name: "A.PDF", type: "" }, [".pdf"], true],
    ["image/* by its type", { name: "x", type: "image/png" }, ["image/*"], true],
    ["an exact type", { name: "x", type: "application/pdf" }, ["application/pdf"], true],
    ["another extension", { name: "x.exe", type: "application/x-msdownload" }, [".pdf", "image/*"], false],
    ["no rules: everything", { name: "x", type: "" }, [], true],
    ["while dragging (no name): an extension rule can't refuse", { type: "" }, [".pdf"], true],
    ["while dragging: a MIME rule decides", { type: "text/plain" }, ["image/*"], false],
  ])("%s", (_, f, rules, expected) => {
    expect(acceptsFile(f, rules)).toBe(expected);
  });

  test("a File is a value: not empty, equal only to itself", () => {
    const a = file("a.txt");
    expect(isEmptyValue(a)).toBe(false);
    expect(isEmptyValue({})).toBe(true);
    expect(deepEqual(a, file("a.txt"))).toBe(false);
    expect(deepEqual([a], [a])).toBe(true);
  });
});

describe("FileInput", () => {
  test("picked files are its value (File objects); didChange; the names show; setValue", async () => {
    show(`<App var.log="">
      <FileInput id="docs" multiple="true" placeholder="No file" onDidChange="files => log = files.map(f => f.name + ':' + f.size).join(',')"/>
      <Text>log: {log}</Text>
      <Text>value: {docs.value?.length ?? 0} {docs.value?.[0] instanceof File}</Text>
      <Button label="Clear" onClick="docs.setValue([])"/>
    </App>`);
    const shown = screen.getByPlaceholderText("No file") as HTMLInputElement;
    expect(shown.value).toBe("");
    await pick(fileInputs()[0]!, [file("a.txt"), file("b.txt", "hi")]);
    expect(text("log: ")).toBe("a.txt:5,b.txt:2");
    expect(shown.value).toBe("a.txt, b.txt");
    expect(text("value: ")).toBe("2 true");
    await click("Clear");
    expect(shown.value).toBe("");
  });

  test("acceptsFileType filters by extension and MIME type; the dialog's accept attribute", async () => {
    show(`<App var.log=""><FileInput acceptsFileType="{['.pdf', 'image/*']}" multiple="true" onDidChange="files => log = files.map(f => f.name).join(',')"/><Text>log: {log}</Text></App>`);
    const input = fileInputs()[0]!;
    expect(input.getAttribute("accept")).toBe(".pdf,image/*");
    await pick(input, [file("a.pdf", "x", "application/pdf"), file("b.png", "x", "image/png"), file("c.exe", "x", "application/x-msdownload")]);
    expect(text("log: ")).toBe("a.pdf,b.png");
  });

  test("readOnly and enabled=false take no files", async () => {
    show(`<App var.n="{0}"><FileInput readOnly="true" onDidChange="n++"/><FileInput enabled="false" onDidChange="n++"/><Text>n: {n}</Text></App>`);
    for (const input of fileInputs()) await pick(input, [file("a.txt")]);
    expect(text("n: ")).toBe("0");
    expect(screen.getAllByRole("button", { name: "Browse" }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  test("in a Form: bindTo, required, and the submitted data holds the File objects", async () => {
    show(`<App var.got="">
      <Form onSubmit="data => got = data.subject + ' / ' + data.attachment.map(f => f.name).join(',')">
        <TextBox label="Subject" bindTo="subject" initialValue="Bug"/>
        <FileInput label="Attachment" bindTo="attachment" required="true"/>
      </Form>
      <Text>got: {got}</Text>
    </App>`);
    await click("Save");
    expect(text("got: ")).toBe("");
    expect(screen.getByText("This field is required")).toBeTruthy();
    await pick(fileInputs()[0]!, [file("log.txt")]);
    await click("Save");
    await settle();
    expect(text("got: ")).toBe("Bug / log.txt");
  });

  test("a Form with submitUrl sends the file as multipart/form-data", async () => {
    show(`<App><Form submitUrl="/api/tickets"><TextBox label="Subject" bindTo="subject" initialValue="Bug"/><FileInput label="Attachment" bindTo="attachment"/></Form></App>`);
    await pick(fileInputs()[0]!, [file("log.txt")]);
    await click("Save");
    await settle(10);
    expect(requests).toHaveLength(1);
    const body = requests[0]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("subject")).toBe("Bug");
    expect((body.get("attachment") as File).name).toBe("log.txt");
    expect(Object.keys(requests[0]!.headers).some((h) => h.toLowerCase() === "content-type")).toBe(false);
  });

  test("parseAs csv: papaparse with csvOptions; the value and didChange are { files, parsedData }; getFields", async () => {
    show(`<App var.rows="{[]}">
      <FileInput id="csv" parseAs="csv" csvOptions="{{ dynamicTyping: true }}" onDidChange="r => rows = r.parsedData[0].data"/>
      <Text>rows: {JSON.stringify(rows)}</Text>
      <Text>fields: {csv.getFields()?.join(',')}</Text>
      <Text>value: {csv.value?.files?.[0]?.name}</Text>
    </App>`);
    expect(fileInputs()[0]!.getAttribute("accept")).toBe(".csv");
    await pick(fileInputs()[0]!, [file("people.csv", "name,age\nAda,36\nAlan,41\n\n", "text/csv")]);
    await settle(50);
    expect(text("rows: ")).toBe('[{"name":"Ada","age":36},{"name":"Alan","age":41}]');
    expect(text("fields: ")).toBe("name,age");
    expect(text("value: ")).toBe("people.csv");
  });

  test("parseAs json: an object is wrapped in an array; a broken file goes to parseError; an empty one is []", async () => {
    show(`<App var.log="">
      <FileInput parseAs="json" multiple="true"
        onDidChange="r => log += r.parsedData.map(p => p.file.name + '=' + JSON.stringify(p.data)).join(' ') + ';'"
        onParseError="(e, f) => log += 'error in ' + f.name + ';'"/>
      <Text>log: {log}</Text>
    </App>`);
    await pick(fileInputs()[0]!, [file("one.json", '{"a":1}', "application/json"), file("bad.json", "{oops", "application/json"), file("empty.json", " ", "application/json")]);
    await settle(20);
    expect(text("log: ")).toBe('error in bad.json;one.json=[{"a":1}] bad.json=[] empty.json=[];');
  });
});

describe("FileUploadDropZone", () => {
  test("files arriving fire upload(files); the placeholder without children", async () => {
    show(`<App var.log=""><FileUploadDropZone text="Drop receipts" onUpload="files => log = files.map(f => f.name).join(',')"/><Text>log: {log}</Text></App>`);
    expect(screen.getByRole("group", { name: "Drop receipts" }).textContent).toBe("Drop receipts");
    await pick(fileInputs()[0]!, [file("r1.pdf"), file("r2.pdf")]);
    expect(text("log: ")).toBe("r1.pdf,r2.pdf");
  });

  test("maxFiles and acceptedFileTypes: rejected files fire nothing; its children render", async () => {
    show(`<App var.n="{0}">
      <FileUploadDropZone maxFiles="1" acceptedFileTypes="image/*" onUpload="n++"><Text>inside</Text></FileUploadDropZone>
      <Text>n: {n}</Text>
    </App>`);
    expect(screen.getByText("inside")).toBeTruthy();
    const input = fileInputs()[0]!;
    await pick(input, [file("a.png", "x", "image/png"), file("b.png", "x", "image/png")]);
    await pick(input, [file("a.txt")]);
    expect(text("n: ")).toBe("0");
    await pick(input, [file("a.png", "x", "image/png")]);
    expect(text("n: ")).toBe("1");
  });
});

describe("Image data", () => {
  test("a File shows through an object URL, revoked when it goes", async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      created.push(b as Blob);
      return `blob:${created.length}`;
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    show(`<App var.img="{null}"><FileUploadDropZone onUpload="files => img = files[0]"/><Image data="{img}" alt="Pasted"/><Button label="Clear" onClick="img = null"/></App>`);
    expect(screen.queryByRole("img", { name: "Pasted" })).toBeNull();
    await pick(fileInputs()[0]!, [file("shot.png", "png", "image/png")]);
    expect(screen.getByRole("img", { name: "Pasted" }).getAttribute("src")).toBe("blob:1");
    await click("Clear");
    expect(revoke).toHaveBeenCalledWith("blob:1");
    expect(screen.queryByRole("img", { name: "Pasted" })).toBeNull();
  });
});

describe("action elements in <event> and Actions", () => {
  test("an APICall inside <event>: its props see $param; its own success handler", async () => {
    respond = () => new Response(JSON.stringify({ archived: 7 }), { headers: { "content-type": "application/json" } });
    show(`<App var.log="">
      <Items data="{[7]}">
        <Button label="Archive {$item}">
          <event name="click">
            <APICall method="post" url="/api/tasks/{$item}/archive" body="{{ at: $param.clientX }}" onSuccess="r => log = 'archived ' + r.archived"/>
          </event>
        </Button>
      </Items>
      <Text>log: {log}</Text>
    </App>`);
    await click("Archive 7");
    await settle();
    expect(requests.map((r) => [r.method, new URL(r.url).pathname, r.body])).toEqual([["POST", "/api/tasks/7/archive", '{"at":0}']]);
    expect(text("log: ")).toBe("archived 7");
  });

  test("FileUpload inside an upload event: the dropped file as a form field", async () => {
    show(`<App var.log="">
      <FileUploadDropZone>
        <event name="upload">
          <FileUpload url="/api/receipts" file="{$param[0]}" asForm="true" fieldName="receipt" formParams="{{ count: $param.length }}" onSuccess="r => log = 'sent ' + $param.length + ' ' + r.ok"/>
        </event>
      </FileUploadDropZone>
      <Text>log: {log}</Text>
    </App>`);
    await pick(fileInputs()[0]!, [file("r.pdf"), file("s.pdf")]);
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    const body = requests[0]!.body as FormData;
    expect((body.get("receipt") as File).name).toBe("r.pdf");
    expect(body.get("count")).toBe("2");
    // The action's handler sees the event's $param (the files) and its own result.
    expect(text("log: ")).toBe("sent 2 true");
  });

  test("FileDownload inside a click event: fetched and saved under fileName; Actions.download and Actions.upload from script", async () => {
    respond = () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    show(`<App var.id="{42}">
      <Button label="Invoice"><event name="click"><FileDownload url="/api/invoices/{id}/pdf" fileName="invoice-{id}.pdf"/></event></Button>
      <Button label="Script" onClick="Actions.download({ url: '/api/files/report.pdf' }); Actions.upload({ url: '/api/u', body: { n: 1 } })"/>
    </App>`);
    await click("Invoice");
    await settle();
    expect(saved).toEqual(["invoice-42.pdf"]);
    expect(new URL(requests[0]!.url).pathname).toBe("/api/invoices/42/pdf");
    await click("Script");
    await settle();
    expect(saved).toEqual(["invoice-42.pdf", "report.pdf"]);
    expect(requests.map((r) => r.method)).toEqual(["GET", "GET", "POST"]);
  });
});
