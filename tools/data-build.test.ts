// The mock backend in production builds (step 20, catalog row M3): a build of
// test-apps/data contains no mock code, no worker script and the app's own
// entry, unless the mock is asked for (PFUI_MOCK_BUILD=1: a demo site). Also
// measures what the data layer (query-core and runtime/src/data) adds.
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { afterEach, describe, expect, test } from "vitest";

const configFile = fileURLToPath(new URL("../test-apps/data/vite.config.ts", import.meta.url));
type Output = readonly (Rolldown.OutputChunk | Rolldown.OutputAsset)[];

async function buildData(withMock: boolean): Promise<Output> {
  if (withMock) process.env.PFUI_MOCK_BUILD = "1";
  else delete process.env.PFUI_MOCK_BUILD;
  const result = await build({ configFile, configLoader: "runner", logLevel: "silent", build: { write: false, minify: true } });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((o) => ("output" in o ? o.output : []));
}

const chunks = (output: Output) => output.filter((o): o is Rolldown.OutputChunk => o.type === "chunk");
const assets = (output: Output) => output.filter((o): o is Rolldown.OutputAsset => o.type === "asset");
const modules = (output: Output) => chunks(output).flatMap((c) => Object.entries(c.modules).filter(([, m]) => m.renderedLength > 0).map(([id, m]) => [id.split("\\").join("/"), m.renderedLength] as const));
const html = (output: Output) => String(assets(output).find((a) => a.fileName === "index.html")!.source);

afterEach(() => {
  delete process.env.PFUI_MOCK_BUILD;
});

describe("a production build", () => {
  test("without the mock: no mock code, no worker script, the app's own entry", async () => {
    const output = await buildData(false);
    expect(modules(output).filter(([id]) => /msw|mock-backend|mswjs|pfui-mock-boot|backend\.ts/.test(id))).toEqual([]);
    expect(assets(output).map((a) => a.fileName)).not.toContain("mockServiceWorker.js");
    expect(html(output)).not.toContain("mock-boot");
    // The data layer is in the build (its size is recorded in .ai/docs/data.md).
    const size = (pattern: RegExp) => modules(output).filter(([id]) => pattern.test(id)).reduce((sum, [, length]) => sum + length, 0);
    const queryCore = size(/@tanstack\/query-core/);
    const data = size(/runtime\/src\/data\/|components\/src\/data\.tsx/);
    expect(queryCore).toBeGreaterThan(0);
    expect(data).toBeGreaterThan(0);
  }, 60_000);

  test("with build: true: the bootstrap, MSW and the worker script", async () => {
    const output = await buildData(true);
    expect(modules(output).some(([id]) => id.includes("msw"))).toBe(true);
    expect(assets(output).map((a) => a.fileName)).toContain("mockServiceWorker.js");
    expect(html(output)).not.toContain('src="/src/main.tsx"');
  }, 60_000);
});
