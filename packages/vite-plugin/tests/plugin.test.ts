// The Vite plugin's hooks, called directly with a minimal plugin context.
import { componentMetadata } from "@gluefuil/components/metadata";
import { describe, expect, test } from "vitest";
import { gfui, gfuiFilePath, type GfuiPluginOptions } from "../src/index";

interface Reported {
  warnings: unknown[];
  error?: Record<string, unknown>;
}

type TransformResult = { code: string; map: { mappings: string; sources?: string[] } } | undefined;

/** Runs `configResolved` (with `command` and `build.sourcemap`) and `transform`. */
function transform(
  source: string,
  id: string,
  options: GfuiPluginOptions = {},
  config: { command: "serve" | "build"; sourcemap?: boolean | "inline" } = { command: "build" },
) {
  const plugin = gfui(options);
  (plugin.configResolved as (c: unknown) => void)({ command: config.command, build: { sourcemap: config.sourcemap ?? false } });
  const reported: Reported = { warnings: [] };
  const context = {
    addWatchFile: () => undefined,
    warn: (warning: unknown) => reported.warnings.push(warning),
    error: (error: Record<string, unknown>) => {
      reported.error = error;
      throw new Error(String(error.message));
    },
  };
  let result: TransformResult;
  let thrown: unknown;
  try {
    result = (plugin.transform as (this: unknown, code: string, id: string) => TransformResult).call(context, source, id);
  } catch (error) {
    thrown = error;
  }
  return { result, reported, thrown };
}

const MAIN = '<App var.n="{1}"><Button onClick="n++">{n}</Button></App>';

describe("which files", () => {
  test.each([
    ["/app/src/Main.gui", "/app/src/Main.gui"],
    ["/app/src/Main.gui?import", "/app/src/Main.gui"],
    ["/app/src/Main.gui?v=123#x", "/app/src/Main.gui"],
    ["/app/src/main.tsx", undefined],
    ["/app/src/Main.gfui.ts", undefined],
    ["/app/src/main.tsx?file=a.gui", undefined],
    // The file's text, not a module (import.meta.glob(…, { query: "?raw" })).
    ["/app/src/Main.gui?raw", undefined],
    ["/app/src/Main.gui?import&raw", undefined],
    ["/app/src/Main.gui?url", undefined],
  ])("%s", (id, expected) => {
    expect(gfuiFilePath(id)).toBe(expected);
  });

  test("other files are left to other plugins", () => {
    expect(transform("const x = 1;", "/app/src/main.ts").result).toBeUndefined();
  });

  test("runs before other transforms", () => {
    expect(gfui().enforce).toBe("pre");
  });
});

describe("output", () => {
  test("an ES module importing the runtime and the components, exporting the root component", () => {
    const { code } = transform(MAIN, "/app/src/Main.gui").result!;
    expect(code).toMatch(/^import .* from "@gluefuil\/runtime";$/m);
    expect(code).toMatch(/^import .* from "@gluefuil\/components";$/m);
    expect(code).toMatch(/^export default /m);
  });

  test("custom components: markup may use what the given metadata declares", () => {
    const source = "<App><Fancy/></App>";
    expect(transform(source, "/a/Main.gui").thrown).toBeDefined();
    const components = { ...componentMetadata, Fancy: { description: "A custom component.", props: {} } };
    const { result, thrown } = transform(source, "/a/Main.gui", { components });
    expect(thrown).toBeUndefined();
    expect(result!.code).toContain("Fancy");
  });
});

describe("source maps", () => {
  test.each<[label: string, options: GfuiPluginOptions, config: Parameters<typeof transform>[3], expected: boolean]>([
    ["auto, dev server", {}, { command: "serve" }, true],
    ["auto, build", {}, { command: "build" }, false],
    ["auto, build with build.sourcemap", {}, { command: "build", sourcemap: true }, true],
    ["auto, build with inline maps", {}, { command: "build", sourcemap: "inline" }, true],
    ["forced on, build", { sourceMap: true }, { command: "build" }, true],
    ["forced off, dev server", { sourceMap: false }, { command: "serve" }, false],
  ])("%s", (_, options, config, expected) => {
    const { map } = transform(MAIN, "/app/src/Main.gui?import", options, config).result!;
    if (expected) {
      expect(map.sources).toEqual(["Main.gui"]);
      expect(map.mappings.length).toBeGreaterThan(0);
    } else {
      // Rollup's "no meaningful map" form.
      expect(map).toEqual({ mappings: "" });
    }
  });

  test("the code is the same with and without a map", () => {
    const withMap = transform(MAIN, "/a/Main.gui", { sourceMap: true }).result!.code;
    const without = transform(MAIN, "/a/Main.gui", { sourceMap: false }).result!.code;
    expect(withMap).toBe(without);
  });
});

describe("errors", () => {
  test("fail the transform with the location, a code frame, and every error listed", () => {
    const source = '<App>\n  <Text value="{missing}"/>\n  <Text value="{alsoMissing}"/>\n</App>';
    const { reported, thrown } = transform(source, "/app/src/Main.gui?import");
    expect(thrown).toBeInstanceOf(Error);
    expect(reported.error).toMatchObject({
      id: "/app/src/Main.gui",
      loc: { file: "/app/src/Main.gui", line: 2, column: 16 },
      frame: '    <Text value="{missing}"/>\n' + " ".repeat(18) + "^",
    });
    const message = String(reported.error!.message);
    expect(message).toMatch(/^2 errors in Main\.gui:/);
    expect(message).toContain("/app/src/Main.gui:2:17: error C001: Cannot find name 'missing'");
    expect(message).toContain("/app/src/Main.gui:3:17: error C001: Cannot find name 'alsoMissing'");
  });

  test("markup errors are reported the same way", () => {
    const { reported } = transform("<App><Text></App>", "/a/Main.gui");
    expect(String(reported.error!.message)).toMatch(/^1 error in Main\.gui:\n\/a\/Main\.gui:1:\d+: error M\d{3}:/);
  });

  test("a valid file reports nothing", () => {
    const { reported, thrown } = transform(MAIN, "/a/Main.gui");
    expect(thrown).toBeUndefined();
    expect(reported).toEqual({ warnings: [] });
  });
});

describe("contracts (step 15)", () => {
  const markup = '<App><Text valu="x">ok</Text></App>';

  test("a contract violation fails the transform by default", () => {
    const { reported } = transform(markup, "/a/Main.gui");
    expect(String(reported.error!.message)).toContain("error E020: 'Text' has no prop 'valu'. Did you mean 'value'?");
  });

  test("strictContracts: false turns it into a warning", () => {
    const { reported, result } = transform(markup, "/a/Main.gui", { strictContracts: false });
    expect(reported.error).toBeUndefined();
    expect(reported.warnings).toEqual([
      { message: "/a/Main.gui:1:12: warning E020: 'Text' has no prop 'valu'. Did you mean 'value'?", loc: { file: "/a/Main.gui", line: 1, column: 11 } },
    ]);
    expect(result!.code).toContain('"valu": "x"');
  });
});

describe("extensions: the app's own React components (playground SourceView, step 19+)", () => {
  const extensions = {
    Fancy: { module: "src/react/Fancy.tsx", metadata: { description: "An app component.", props: { level: { description: "", valueType: "integer" as const } } } },
  };

  test("imported from their module, relative to the compiled file; built-ins still from the package", () => {
    const plugin = gfui({ extensions });
    (plugin.configResolved as (c: unknown) => void)({ root: "/app", command: "build", build: { sourcemap: false } });
    const context = { addWatchFile: () => undefined, warn: () => undefined, error: (e: { message: string }) => { throw new Error(e.message); } };
    const run = (file: string) => (plugin.transform as (this: unknown, s: string, id: string) => { code: string }).call(context, '<App><Fancy level="2"/><Text/></App>', file).code;
    expect(run("/app/src/Main.gui")).toContain('import { Fancy as $$C_Fancy } from "./react/Fancy.tsx";');
    expect(run("/app/src/Main.gui")).toContain('import { App as $$C_App, Text as $$C_Text } from "@gluefuil/components";');
    expect(run("/app/src/components/X.gui")).toContain('from "../react/Fancy.tsx";');
  });

  test("their contracts are checked like a built-in's", () => {
    const { reported } = transform('<App><Fancy level="1.5"/></App>', "/a/Main.gui", { extensions });
    expect(String(reported.error!.message)).toContain("error E022: '1.5' is not a valid value for 'level': expected an integer");
  });
});
