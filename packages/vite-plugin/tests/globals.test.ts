// The plugin and the app's globals (step 21B): the entry's global.* and the
// Globals.xs beside it reach every other file; the entry compiles Globals.xs.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AppGlobals } from "../src/components";
import { gfui } from "../src/index";
import { resolvePrerender } from "../src/prerender";

let root: string;
const src = (...parts: string[]) => join(root, "src", ...parts);
const write = (path: string, text: string) => {
  writeFileSync(join(root, path), text);
  // A later mtime, so AppGlobals sees the change even within the same millisecond.
  const later = new Date(Date.now() + Math.random() * 100000);
  utimesSync(join(root, path), later, later);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gfui-globals-"));
  mkdirSync(src("components"), { recursive: true });
  write("src/Main.gui", '<App global.count="{0}"><Bump/></App>');
  write("src/components/Bump.gui", '<Component name="Bump"><Button label="{label()}" onClick="count++"/></Component>');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function transform(file: string, source: string, options: Parameters<typeof gfui>[0] = {}) {
  const plugin = gfui(options);
  (plugin.configResolved as (c: unknown) => void)({ root, command: "build", build: { sourcemap: false } });
  const watched: string[] = [];
  let error: Record<string, unknown> | undefined;
  const context = {
    addWatchFile: (path: string) => watched.push(path),
    warn: () => undefined,
    error: (e: Record<string, unknown>) => {
      error = e;
      throw new Error(String(e.message));
    },
  };
  let code: string | undefined;
  try {
    code = (plugin.transform as (this: unknown, s: string, id: string) => { code: string }).call(context, source, file).code;
  } catch {
    // reported through `error`
  }
  return { code, watched, error };
}

describe("AppGlobals", () => {
  test("the entry's globals, then Globals.xs; re-read when either changes", () => {
    const app = new AppGlobals(src("Main.gui"));
    expect(app.names()).toEqual(["count"]);
    write("src/Globals.xs", "var n = 1; function label() { return 'n' + n; }");
    expect(app.names()).toEqual(["count", "n", "label"]);
    write("src/Main.gui", '<App global.total="{0}"/>');
    expect(app.names()).toEqual(["total", "n", "label"]);
  });

  test("a missing entry has none", () => {
    expect(new AppGlobals(src("Nope.gui")).names()).toEqual([]);
  });
});

describe("transform", () => {
  test("a component file sees the entry's globals and watches the entry", () => {
    write("src/Globals.xs", "function label() { return 'Bump ' + count; }");
    const file = src("components", "Bump.gui");
    const { code, watched, error } = transform(file, '<Component name="Bump"><Button label="{label()}" onClick="count++"/></Component>');
    expect(error).toBeUndefined();
    expect(code).toContain("$$s.count++");
    expect(watched).toContain(src("Main.gui"));
    expect(watched).toContain(src("Globals.xs"));
  });

  test("without the global, the component file fails with C001", () => {
    write("src/Main.gui", "<App><Bump/></App>");
    const { error } = transform(src("components", "Bump.gui"), '<Component name="Bump"><Button onClick="count++"/></Component>');
    expect(String(error!.message)).toContain("error C001");
  });

  test("the entry compiles Globals.xs and watches it", () => {
    write("src/Globals.xs", "var n = 1;");
    const { code, watched, error } = transform(src("Main.gui"), "<App><Text>{n}</Text></App>");
    expect(error).toBeUndefined();
    expect(code).toContain('"n": { init: ($$s) => 1 }');
    expect(watched).toContain(src("Globals.xs"));
  });

  test("Globals.xs errors fail the transform at Globals.xs", () => {
    write("src/Globals.xs", "\nlet x = 1;");
    const { error } = transform(src("Main.gui"), "<App/>");
    expect(error).toMatchObject({ id: src("Globals.xs"), loc: { line: 2, column: 0 } });
    expect(String(error!.message)).toMatch(/^1 error in Globals\.xs:\n.*Globals\.xs:2:1: error E019:/);
  });

  test("another app file doesn't compile Globals.xs (only the entry does)", () => {
    write("src/Globals.xs", "var n = 1;");
    const { code, error } = transform(src("Other.gui"), '<App global.local="{1}"><Text>{local}</Text></App>');
    expect(error).toBeUndefined();
    expect(code).not.toContain('"n":');
  });

  test("the entry option moves the app (and its Globals.xs)", () => {
    mkdirSync(src("app"));
    write("src/app/Root.gui", '<App global.other="{1}"/>');
    write("src/app/Globals.xs", "var fromApp = 1;");
    const { error } = transform(src("components", "Bump.gui"), '<Component name="Bump"><Text>{other + fromApp}</Text></Component>', { entry: "src/app/Root.gui" });
    expect(error).toBeUndefined();
  });

  test("the prerender renders the entry by default", () => {
    expect(resolvePrerender(true, "src/app/Root.gui")!.entry).toBe("src/app/Root.gui");
    expect(resolvePrerender({ entry: "src/X.gui" }, "src/app/Root.gui")!.entry).toBe("src/X.gui");
    expect(resolvePrerender(true)!.entry).toBe("src/Main.gui");
  });
});
