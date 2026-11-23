// Package boundary rules (see .ai/plan/poc-steps.md, step 0):
//
//   compiler   -> may import only relative files and @patchfuil/components/metadata
//                 (no React, no runtime, no Node built-ins: it also runs in the browser)
//   runtime    -> must not import the compiler or components
//   components -> must not import the compiler
//   components/metadata (and everything it reaches) -> no bare imports at all
//   vite-plugin -> the compiler, components/metadata, vite and Node built-ins only
//                  (it runs in the build: no React, no runtime, no components)
//   standalone, vite-plugin -> delivery packages: no other package imports them
//
// The checker works on an in-memory map of file path -> source text, so the
// rules themselves can be unit-tested with fixtures.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

export type SourceFiles = ReadonlyMap<string, string>;

export interface Violation {
  file: string;
  specifier: string;
  rule: string;
}

const IMPORT_PATTERNS = [
  // import x from "a"; import { x } from "a"; export * from "a"; import type ...
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?[^'";]*?\sfrom\s*["']([^"']+)["']/g,
  // import "a";
  /(?:^|[\s;])import\s*["']([^"']+)["']/g,
  // import("a")
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/** Returns every module specifier imported or re-exported by a source text. */
export function collectImports(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of withoutComments.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

const isRelative = (specifier: string) =>
  specifier.startsWith("./") || specifier.startsWith("../");

function filesUnder(files: SourceFiles, dir: string): string[] {
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  return [...files.keys()].filter((f) => f.startsWith(prefix));
}

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveRelative(files: SourceFiles, fromFile: string, specifier: string) {
  const base = normalize(join(dirname(fromFile), specifier));
  for (const ext of SOURCE_EXTENSIONS) {
    if (files.has(base + ext)) return base + ext;
  }
  return undefined;
}

/** All files reachable from `entry` through relative imports, including itself. */
export function relativeClosure(files: SourceFiles, entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !files.has(file)) continue;
    seen.add(file);
    for (const specifier of collectImports(files.get(file)!)) {
      if (!isRelative(specifier)) continue;
      const target = resolveRelative(files, file, specifier);
      if (target) queue.push(target);
    }
  }
  return [...seen];
}

const startsWithAny = (specifier: string, prefixes: readonly string[]) =>
  prefixes.some((p) => specifier === p || specifier.startsWith(`${p}/`));

/** Checks all boundary rules. Paths in `files` are relative to the repo root. */
export function checkBoundaries(files: SourceFiles): Violation[] {
  const violations: Violation[] = [];
  const report = (file: string, specifier: string, rule: string) =>
    violations.push({ file, specifier, rule });

  for (const file of filesUnder(files, "packages/compiler/src")) {
    for (const specifier of collectImports(files.get(file)!)) {
      if (isRelative(specifier)) continue;
      if (specifier === "@patchfuil/components/metadata") continue;
      report(file, specifier, "compiler may only import relative files and @patchfuil/components/metadata");
    }
  }

  for (const file of filesUnder(files, "packages/runtime/src")) {
    for (const specifier of collectImports(files.get(file)!)) {
      if (startsWithAny(specifier, ["@patchfuil/compiler", "@patchfuil/components"])) {
        report(file, specifier, "runtime must not import the compiler or components");
      }
    }
  }

  for (const file of filesUnder(files, "packages/components/src")) {
    for (const specifier of collectImports(files.get(file)!)) {
      if (startsWithAny(specifier, ["@patchfuil/compiler"])) {
        report(file, specifier, "components must not import the compiler");
      }
    }
  }

  const VITE_PLUGIN_ALLOWED = ["@patchfuil/compiler", "@patchfuil/components/metadata", "vite"];
  for (const file of filesUnder(files, "packages/vite-plugin/src")) {
    for (const specifier of collectImports(files.get(file)!)) {
      if (isRelative(specifier) || specifier.startsWith("node:")) continue;
      if (VITE_PLUGIN_ALLOWED.includes(specifier)) continue;
      report(file, specifier, "vite-plugin may only import the compiler, components/metadata, vite and node: built-ins");
    }
  }

  const DELIVERY = ["@patchfuil/standalone", "@patchfuil/vite-plugin"];
  for (const file of filesUnder(files, "packages")) {
    if (!/^packages\/[^/]+\/src\//.test(file)) continue;
    for (const specifier of collectImports(files.get(file)!)) {
      if (startsWithAny(specifier, DELIVERY)) {
        report(file, specifier, "no package may import a delivery package (standalone, vite-plugin)");
      }
    }
  }

  for (const file of relativeClosure(files, "packages/components/src/metadata.ts")) {
    for (const specifier of collectImports(files.get(file)!)) {
      if (!isRelative(specifier)) {
        report(file, specifier, "components/metadata must stay React-free: no bare imports");
      }
    }
  }

  return violations;
}

/** Reads every .ts/.tsx file under `packages/` into a SourceFiles map. */
export function readRepoSources(repoRoot: string): SourceFiles {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        files.set(relative(repoRoot, full).split("\\").join("/"), readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(repoRoot, "packages"));
  return files;
}
