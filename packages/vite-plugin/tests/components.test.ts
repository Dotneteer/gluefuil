// The plugin's component discovery and code-behind (step 14), on a temporary app folder.
import { mkdtempSync, rmSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ComponentFolder, importSpecifier } from "../src/components";
import { gfui } from "../src/index";

let root: string;
const src = () => join(root, "src");
const write = (path: string, text: string) => writeFileSync(join(root, path), text);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "gfui-components-"));
  mkdirSync(join(root, "src", "components"), { recursive: true });
  write("src/Main.gui", "<App><Counter/></App>");
  write("src/components/Counter.gui", '<Component name="Counter"><Button onClick="bump()"/><Slot name="rowTemplate" item="{1}"/></Component>');
  write("src/components/Counter.gui.xs", "var n = 0; function bump() { n++; }");
  write("src/components/Misnamed.gui", '<Component name="Other"><Text/></Component>');
  write("src/components/notes.txt", "not a component");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

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

describe("ComponentFolder", () => {
  test("finds <Name>.gui files that define <Component name=Name>; others are skipped", () => {
    const found = new ComponentFolder(join(src(), "components")).scan();
    expect([...found.keys()]).toEqual(["Counter"]);
    // Counter.gui.xs declares bump(); nothing reads $props or emits events.
    expect(found.get("Counter")!.info).toEqual({ name: "Counter", slots: { rowTemplate: ["$item"] }, methods: [], props: [], events: [] });
  });

  test("a missing folder is empty", () => {
    expect(new ComponentFolder(join(root, "nope")).scan().size).toBe(0);
  });

  test("re-analyzes a file when it changes", () => {
    const folder = new ComponentFolder(join(src(), "components"));
    folder.scan();
    write("src/components/Counter.gui", '<Component name="Counter"><Slot/></Component>');
    const later = new Date(Date.now() + 5000);
    utimesSync(join(src(), "components", "Counter.gui"), later, later);
    expect(folder.scan().get("Counter")!.info.slots).toEqual({ $$slot: [] });
    write("src/components/Counter.gui", '<Component name="Counter"><Button onClick="bump()"/><Slot name="rowTemplate" item="{1}"/></Component>');
  });

  test.each([
    ["/a/src", "/a/src/components/X.gui", "./components/X.gui"],
    ["/a/src/components", "/a/src/components/X.gui", "./X.gui"],
    ["/a/src/pages", "/a/src/components/X.gui", "../components/X.gui"],
  ])("importSpecifier(%s, %s)", (from, target, expected) => {
    expect(importSpecifier(from, target)).toBe(expected);
  });
});

describe("transform", () => {
  test("a file using a component imports it and watches every component file", () => {
    const { code, watched, error } = transform(join(src(), "Main.gui"), "<App><Counter/></App>");
    expect(error).toBeUndefined();
    expect(code).toContain('import $$U_Counter from "./components/Counter.gui";');
    expect(watched).toEqual([join(src(), "components", "Counter.gui")]);
  });

  test("a component file gets its code-behind, and does not import itself", () => {
    const file = join(src(), "components", "Counter.gui");
    const { code, watched, error } = transform(file, '<Component name="Counter"><Button onClick="bump()"/></Component>');
    expect(error).toBeUndefined();
    expect(code).toContain('"bump": { fn: ($$s) => function bump() { $$s.n++; } }');
    expect(code).not.toContain("import $$U_Counter");
    expect(watched).toContain(`${file}.xs`);
  });

  test("code-behind errors fail the transform at the .xs file", () => {
    write("src/Broken.gui.xs", "let x = 1;");
    const { error } = transform(join(src(), "Broken.gui"), "<App/>");
    expect(error).toMatchObject({ id: join(src(), "Broken.gui.xs"), loc: { line: 1, column: 0 } });
    expect(String(error!.message)).toMatch(/^1 error in Broken\.gui\.xs:\n.*Broken\.gui\.xs:1:1: error E019:/);
  });

  test("componentsDir is configurable", () => {
    const { error } = transform(join(src(), "Main.gui"), "<App><Counter/></App>", { componentsDir: "elsewhere" });
    expect(String(error!.message)).toContain("error E001: Unknown component 'Counter'");
  });
});
