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
          "packages/compiler/src/index.ts": `import { m } from "@gluefuil/components/metadata"; import { parse } from "@formatjs/icu-messageformat-parser"; import "./x";`,
          "packages/compiler/src/x.ts": ``,
          "packages/runtime/src/index.ts": `import { useState } from "react";`,
          "packages/components/src/index.ts": `import { r } from "@gluefuil/runtime"; import "react";`,
          "packages/components/src/metadata.ts": `import { buttonMd } from "./button/metadata";`,
          "packages/components/src/button/metadata.ts": `export const buttonMd = {};`,
          "packages/vite-plugin/src/index.ts": `import { compileModule } from "@gluefuil/compiler"; import type { ComponentMetadata } from "@gluefuil/components/metadata"; import type { Plugin } from "vite"; import { basename } from "node:path"; import "./x";`,
          "packages/standalone/src/index.ts": `import "@gluefuil/compiler"; import "@gluefuil/runtime"; import "@gluefuil/components"; import "react";`,
          "packages/mock-backend/src/worker.ts": `import { http } from "msw"; import { setupWorker } from "msw/browser"; import type { Backend } from "./index";`,
          "packages/mock-backend/src/middleware.ts": `import type { IncomingMessage } from "node:http";`,
          "packages/vite-plugin/src/mock.ts": `import { backendMiddleware } from "@gluefuil/mock-backend/middleware";`,
        }),
      ),
    ).toEqual([]);
  });

  test.each([
    ["packages/compiler/src/index.ts", "react"],
    ["packages/compiler/src/index.ts", "@gluefuil/runtime"],
    ["packages/compiler/src/index.ts", "@gluefuil/components"],
    ["packages/compiler/src/index.ts", "node:fs"],
    ["packages/runtime/src/index.ts", "@gluefuil/compiler"],
    ["packages/runtime/src/index.ts", "@gluefuil/components/metadata"],
    ["packages/components/src/index.ts", "@gluefuil/compiler"],
    ["packages/components/src/metadata.ts", "react"],
    ["packages/vite-plugin/src/index.ts", "@gluefuil/runtime"],
    ["packages/vite-plugin/src/index.ts", "@gluefuil/components"],
    ["packages/vite-plugin/src/index.ts", "react"],
    ["packages/runtime/src/index.ts", "@gluefuil/vite-plugin"],
    ["packages/components/src/index.ts", "@gluefuil/standalone"],
    ["packages/standalone/src/index.ts", "@gluefuil/vite-plugin"],
    // The app can't know it talks to a mock (step 20); the mock knows nothing of the app.
    ["packages/runtime/src/index.ts", "@gluefuil/mock-backend"],
    ["packages/components/src/index.ts", "@gluefuil/mock-backend/worker"],
    ["packages/runtime/src/index.ts", "msw"],
    ["packages/mock-backend/src/index.ts", "@gluefuil/runtime"],
    ["packages/mock-backend/src/index.ts", "react"],
    ["packages/vite-plugin/src/index.ts", "@gluefuil/mock-backend/worker"],
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
