// @vitest-environment node
// Step 32B: request bodies (JSON, form, multipart), uploads and downloads through
// the HTTP gate, answered by the mock backend (MSW's interception in Node: the
// multipart body is parsed by the backend as a server would).
// Design: .ai/plan/poc-32b-files.md
import { defineBackend, file, status } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { appendField, containsBinary, encodeBody } from "../../src/data/body";
import { resetDataState } from "../../src/data/client";
import { sendRequest } from "../../src/data/http";
import { download, downloadName, downloadSpec, upload, uploadSpec } from "../../src/data/transfer";

const seen: unknown[] = [];
const backend = defineBackend({
  routes: {
    "POST /api/echo": ({ body, request }) => {
      seen.push(body);
      const describe = (v: unknown): unknown =>
        // No name: MSW's Node interception delivers an uploaded part as a Blob without its file name
        // (the browser hosts keep it: e2e/files.spec.ts).
        v instanceof Blob ? { size: v.size, type: v.type } : Array.isArray(v) ? v.map(describe) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, describe(x)])) : v;
      return { contentType: (request.headers.get("content-type") ?? "").split(";")[0], body: describe(body) };
    },
    "GET /api/report": () => file("a,b\n1,2\n", { type: "text/csv", name: "report 2026.csv" }),
    "GET /api/broken": () => status(500, { message: "Boom" }),
  },
});

let server: ReturnType<typeof startTestServer>;
beforeAll(() => {
  server = startTestServer(backend);
});
afterAll(() => server.close());
afterEach(() => {
  seen.length = 0;
  backend.reset();
  resetDataState();
});

const txt = (name: string, content = "hello", type = "text/plain") => new File([content], name, { type });

describe("encodeBody", () => {
  test.each([
    ["an object: JSON", { a: 1 }, undefined, "application/json", '{"a":1}'],
    ["a string: as it is", "raw", undefined, undefined, "raw"],
    ["payloadType json with a string", "raw", "json", "application/json", '"raw"'],
    ["form: URL-encoded, arrays repeat, objects nest", { a: 1, b: [2, 3], c: { d: "x" }, e: null }, "form", "application/x-www-form-urlencoded", "a=1&b=2&b=3&c.d=x"],
  ])("%s", (_, body, payloadType, contentType, sent) => {
    const encoded = encodeBody(body, payloadType);
    expect(encoded.contentType).toBe(contentType);
    expect(encoded.body).toBe(sent);
  });

  test("a body with a file is multipart (no Content-Type: the browser adds the boundary)", () => {
    const encoded = encodeBody({ title: "t", attachment: [txt("a.txt"), txt("b.txt")], meta: { n: 1 }, none: undefined });
    expect(encoded.contentType).toBeNull();
    const data = encoded.body as FormData;
    expect([...data.keys()]).toEqual(["title", "attachment", "attachment", "meta.n"]);
    expect((data.getAll("attachment") as File[]).map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  });

  test("payloadType multipart-form without a file; a Blob alone is the body with its type", () => {
    expect(encodeBody({ a: 1 }, "multipart-form").body).toBeInstanceOf(FormData);
    const blob = new Blob(["x"], { type: "image/png" });
    expect(encodeBody(blob)).toEqual({ body: blob, contentType: "image/png" });
  });

  test("a FormData or URLSearchParams body goes as it is", () => {
    const data = new FormData();
    expect(encodeBody(data)).toEqual({ body: data, contentType: null });
    const params = new URLSearchParams("a=1");
    expect(encodeBody(params)).toEqual({ body: params, contentType: "application/x-www-form-urlencoded" });
  });

  test("containsBinary looks into arrays and plain objects only", () => {
    expect(containsBinary({ a: [{ b: txt("x") }] })).toBe(true);
    expect(containsBinary({ a: [1, "x", null] })).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(containsBinary(cycle)).toBe(false);
  });

  test("appendField: null and undefined are left out; other objects as JSON", () => {
    const fields: [string, unknown][] = [];
    appendField({ append: (k, v) => fields.push([k, v]) }, "x", [1, null, undefined, new Date(0)]);
    expect(fields).toEqual([["x", "1"], ["x", '"1970-01-01T00:00:00.000Z"']]);
  });
});

describe("through the gate to the mock backend", () => {
  test("a multipart body arrives with its fields and files", async () => {
    const result = await sendRequest({ url: "/api/echo", method: "post", body: { title: "Bug", attachment: [txt("log.txt", "12345")] } });
    expect(result.data).toEqual({ contentType: "multipart/form-data", body: { title: "Bug", attachment: { size: 5, type: "text/plain" } } });
    expect(backend.log()[0]!.body).toMatchObject({ title: "Bug", attachment: { file: true, size: 5, type: "text/plain" } });
  });

  test("a URL-encoded body arrives as fields", async () => {
    const result = await sendRequest({ url: "/api/echo", method: "post", body: { a: "1", b: ["2", "3"] }, payloadType: "form" });
    expect(result.data).toEqual({ contentType: "application/x-www-form-urlencoded", body: { a: "1", b: ["2", "3"] } });
  });

  test("a multipart Content-Type given in headers is dropped (it would lack the boundary)", async () => {
    const result = await sendRequest({ url: "/api/echo", method: "post", headers: { "Content-Type": "multipart/form-data" }, body: { f: txt("a.txt") } });
    expect((result.data as { body: unknown }).body).toEqual({ f: { size: 5, type: "text/plain" } });
  });
});

describe("upload", () => {
  test.each([
    ["the file as the body", { url: "/api/echo", file: txt("a.png", "png!", "image/png") }, { contentType: "image/png", body: { size: 4, type: "image/png" } }],
    ["asForm: the file under 'file' with formParams", { url: "/api/echo", file: txt("a.txt"), asForm: true, formParams: { kind: "receipt" } }, { contentType: "multipart/form-data", body: { file: { size: 5, type: "text/plain" }, kind: "receipt" } }],
    ["asForm with fieldName", { url: "/api/echo", file: txt("a.txt"), asForm: "true", fieldName: "receipt" }, { contentType: "multipart/form-data", body: { receipt: { size: 5, type: "text/plain" } } }],
  ])("%s", async (_, options, expected) => {
    expect(await upload(options)).toEqual(expected);
  });

  test("success, error (handled) and the spec's defaults", async () => {
    const onSuccess = vi.fn();
    await upload({ url: "/api/echo", file: txt("a.txt"), onSuccess });
    expect(onSuccess).toHaveBeenCalledOnce();
    const onError = vi.fn();
    expect(await upload({ url: "/api/broken", method: "post", file: txt("a.txt"), onError })).toBeUndefined();
    expect(onError.mock.calls[0]![0]).toMatchObject({ status: 404 });
    await expect(upload({ url: "/api/broken", file: txt("a.txt") })).rejects.toMatchObject({ status: 404 });
    expect(uploadSpec({ url: "/u" })).toMatchObject({ method: "post", timeoutMs: 30000 });
  });
});

describe("download", () => {
  test.each([
    ["the given name", "mine.csv", {}, "/x/y", "mine.csv"],
    ["Content-Disposition filename*", undefined, { "content-disposition": "attachment; filename=\"a.csv\"; filename*=UTF-8''r%C3%A9sum%C3%A9.csv" }, "/x", "résumé.csv"],
    ["Content-Disposition filename", undefined, { "content-disposition": 'attachment; filename="a b.csv"' }, "/x", "a b.csv"],
    ["the URL's last segment", undefined, {}, "/api/files/report.pdf?v=2", "report.pdf"],
    ["nothing", undefined, {}, "/", "download"],
  ])("downloadName: %s", (_, given, headers, url, expected) => {
    expect(downloadName(given, headers, url)).toBe(expected);
  });

  test("fetches as a Blob and saves it through an <a download>", async () => {
    // Node: a minimal document for the anchor.
    const saved: { name: string; href: string }[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const anchor = { href: "", download: "", style: {}, click: () => saved.push({ name: anchor.download, href: anchor.href }), remove: () => {} };
        return anchor;
      },
      body: { appendChild: () => {} },
      baseURI: "http://localhost/",
    });
    const objectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      await download({ url: "/api/report" });
      expect(saved).toEqual([{ name: "report 2026.csv", href: "blob:test" }]);
      const blob = objectUrl.mock.calls[0]![0] as Blob;
      expect(await blob.text()).toBe("a,b\n1,2\n");
      expect(downloadSpec({ url: "/x" })).toMatchObject({ method: "get", responseType: "blob" });
      // A failure saves nothing.
      await expect(download({ url: "/api/broken" })).rejects.toMatchObject({ status: 500 });
      expect(saved).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
      objectUrl.mockRestore();
      revoke.mockRestore();
    }
  });
});
