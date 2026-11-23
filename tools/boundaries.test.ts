import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { checkBoundaries, collectImports, readRepoSources, relativeClosure } from "./boundaries";

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("collectImports", () => {
  test.each([
    [`import a from "a";`, ["a"]],
    [`import { b } from 'b'`, ["b"]],
    [`import type { C } from "c";`, ["c"]],
    [`export * from "./d";`, ["./d"]],
    [`export { e } from "e";`, ["e"]],
    [`import "side-effect";`, ["side-effect"]],
    [`const m = await import("lazy");`, ["lazy"]],
    [`import {\n  x,\n  y,\n} from "multi-line";`, ["multi-line"]],
    [`// import a from "commented";\nconst x = 1;`, []],
    [`/* import a from "block"; */`, []],
    [`const s = "import a from 'not-code'";`, []],
  ])("%s", (source, expected) => {
    expect(collectImports(source)).toEqual(expected);
  });
});

describe("relativeClosure", () => {
  test("follows relative imports, resolving extensions and index files", () => {
    const closure = relativeClosure(
      files({
        "p/a.ts": `import "./b"; import "./dir";`,
        "p/b.ts": `import "react";`,
        "p/dir/index.ts": `export {};`,
        "p/unrelated.ts": `import "./a";`,
      }),
      "p/a.ts",
    );
    expect(closure.sort()).toEqual(["p/a.ts", "p/b.ts", "p/dir/index.ts"]);
  });
});

describe("checkBoundaries", () => {
  test("accepts the allowed dependency directions", () => {
    expect(
      checkBoundaries(
        files({
          "packages/compiler/src/index.ts": `import { m } from "@patchfuil/components/metadata"; import "./x";`,
          "packages/compiler/src/x.ts": ``,
          "packages/runtime/src/index.ts": `import { useState } from "react";`,
          "packages/components/src/index.ts": `import { r } from "@patchfuil/runtime"; import "react";`,
          "packages/components/src/metadata.ts": `import { buttonMd } from "./button/metadata";`,
          "packages/components/src/button/metadata.ts": `export const buttonMd = {};`,
          "packages/vite-plugin/src/index.ts": `import { compileModule } from "@patchfuil/compiler"; import type { ComponentMetadata } from "@patchfuil/components/metadata"; import type { Plugin } from "vite"; import { basename } from "node:path"; import "./x";`,
          "packages/standalone/src/index.ts": `import "@patchfuil/compiler"; import "@patchfuil/runtime"; import "@patchfuil/components"; import "react";`,
        }),
      ),
    ).toEqual([]);
  });

  test.each([
    ["packages/compiler/src/index.ts", "react"],
    ["packages/compiler/src/index.ts", "@patchfuil/runtime"],
    ["packages/compiler/src/index.ts", "@patchfuil/components"],
    ["packages/compiler/src/index.ts", "node:fs"],
    ["packages/runtime/src/index.ts", "@patchfuil/compiler"],
    ["packages/runtime/src/index.ts", "@patchfuil/components/metadata"],
    ["packages/components/src/index.ts", "@patchfuil/compiler"],
    ["packages/components/src/metadata.ts", "react"],
    ["packages/vite-plugin/src/index.ts", "@patchfuil/runtime"],
    ["packages/vite-plugin/src/index.ts", "@patchfuil/components"],
    ["packages/vite-plugin/src/index.ts", "react"],
    ["packages/runtime/src/index.ts", "@patchfuil/vite-plugin"],
    ["packages/components/src/index.ts", "@patchfuil/standalone"],
    ["packages/standalone/src/index.ts", "@patchfuil/vite-plugin"],
  ])("rejects %s importing %s", (file, specifier) => {
    const violations = checkBoundaries(files({ [file]: `import x from "${specifier}";` }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file, specifier });
  });

  test("rejects a bare import reached indirectly from components/metadata", () => {
    const violations = checkBoundaries(
      files({
        "packages/components/src/metadata.ts": `export * from "./button/metadata";`,
        "packages/components/src/button/metadata.ts": `import { Button } from "@mantine/core";`,
      }),
    );
    expect(violations).toEqual([
      expect.objectContaining({
        file: "packages/components/src/button/metadata.ts",
        specifier: "@mantine/core",
      }),
    ]);
  });
});

test("the repository itself respects all package boundaries", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  expect(checkBoundaries(readRepoSources(repoRoot))).toEqual([]);
});
