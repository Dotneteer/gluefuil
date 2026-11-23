// Build-time compilation (step 12): a production build of test-apps/hello
// ships no compiler, needs no eval, and maps back to Main.pfui when asked to.
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { beforeAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const configFile = fileURLToPath(new URL("../test-apps/hello/vite.config.ts", import.meta.url));

type Output = readonly (Rolldown.OutputChunk | Rolldown.OutputAsset)[];

async function buildHello(sourcemap: boolean): Promise<Output> {
  const result = await build({
    configFile,
    configLoader: "runner",
    logLevel: "silent",
    build: { write: false, sourcemap, minify: true },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((o) => ("output" in o ? o.output : []));
}

const chunks = (output: Output) => output.filter((o): o is Rolldown.OutputChunk => o.type === "chunk");
const relative = (id: string) => id.split("\\").join("/").replace(repoRoot.split("\\").join("/"), "");
/** Every module the bundler included, even when tree-shaking dropped all its code. */
const relativeIds = (chunk: Rolldown.OutputChunk) => chunk.moduleIds.map(relative);
/** The modules that contribute code to the chunk. */
const renderedIds = (chunk: Rolldown.OutputChunk) =>
  Object.entries(chunk.modules)
    .filter(([, info]) => info.renderedLength > 0)
    .map(([id]) => relative(id));

describe("a production build (no source maps)", () => {
  let output: Output;
  beforeAll(async () => {
    output = await buildHello(false);
  }, 60_000);

  test("is one JS chunk containing the app's compiled markup, the runtime and the components", () => {
    expect(chunks(output)).toHaveLength(1);
    const ids = relativeIds(chunks(output)[0]!);
    expect(ids).toContain("test-apps/hello/src/Main.pfui");
    expect(ids.some((id) => id.startsWith("packages/runtime/src/"))).toBe(true);
    expect(ids.some((id) => id.startsWith("packages/components/src/"))).toBe(true);
  });

  test("contains no compiler module", () => {
    const ids = chunks(output).flatMap(relativeIds);
    expect(ids.filter((id) => id.includes("packages/compiler/") || id.includes("@patchfuil/compiler"))).toEqual([]);
    // Not even the React-free metadata the compiler reads.
    expect(ids.filter((id) => id.endsWith("packages/components/src/metadata.ts"))).toEqual([]);
  });

  test("needs no eval: no `new Function`, no `eval(`", () => {
    for (const chunk of chunks(output)) {
      expect(chunk.code).not.toMatch(/new Function\b/);
      expect(chunk.code).not.toMatch(/\beval\(/);
    }
  });

  test("the runtime's standalone loader (loadModule, loadBinding) is tree-shaken away", () => {
    const ids = chunks(output).flatMap(renderedIds);
    expect(ids).toContain("packages/runtime/src/render/elements.ts");
    expect(ids).not.toContain("packages/runtime/src/render/module.ts");
    expect(ids).not.toContain("packages/runtime/src/script/load.ts");
  });

  test("contains no source-map marker characters and no source map", () => {
    for (const chunk of chunks(output)) {
      expect(chunk.code).not.toMatch(/[\uE000\uE001]/);
      expect(chunk.map).toBeNull();
    }
  });
});

describe("a production build with build.sourcemap", () => {
  test("maps back to Main.pfui", async () => {
    const output = await buildHello(true);
    const chunk = chunks(output)[0]!;
    expect(chunk.code).not.toMatch(/[\uE000\uE001]/);
    const sources = chunk.map!.sources.map((s) => s.split("\\").join("/"));
    expect(sources.some((s) => s.endsWith("src/Main.pfui"))).toBe(true);
    const index = sources.findIndex((s) => s.endsWith("src/Main.pfui"));
    expect(chunk.map!.sourcesContent?.[index]).toContain("<App");
  }, 60_000);
});
