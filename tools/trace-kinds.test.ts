// Step 35: the trace's kinds can't drift apart from their emitters and their
// documentation (XMLUI's entries did: kinds documented and never emitted,
// .ai/plan/poc-35-observability.md § Background). Every kind in TRACE_KINDS is
// emitted somewhere in the runtime (`kind: "<kind>"` outside entries.ts) and has
// a row in .ai/docs/observability.md § Entries; that table names no other kind.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..");
const kindsSource = readFileSync(join(root, "packages/runtime/src/trace/entries.ts"), "utf8");
const kinds = JSON.parse(/TRACE_KINDS = (\[[^\]]*\])/.exec(kindsSource)![1]!) as string[];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const runtime = sources(join(root, "packages/runtime/src"))
  .filter((file) => !file.endsWith(join("trace", "entries.ts")))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const docs = readFileSync(join(root, ".ai/docs/observability.md"), "utf8");
const entriesSection = docs.slice(docs.indexOf("## Entries"), docs.indexOf("## Traces and causes"));
const documented = [...entriesSection.matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]);

describe("trace kinds", () => {
  test("there are kinds", () => {
    expect(kinds.length).toBeGreaterThanOrEqual(8);
  });

  test.each(kinds)("%s is emitted by the runtime", (kind) => {
    expect(runtime).toMatch(new RegExp(`kind: "${kind}"`));
  });

  test("the documentation's table has exactly these kinds", () => {
    expect([...documented].sort()).toEqual([...kinds].sort());
  });
});
