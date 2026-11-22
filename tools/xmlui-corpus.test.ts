// Compatibility check: every .xmlui file in the XMLUI reference repository
// must parse without diagnostics. Skipped when the repository is not present.
//
// Location: $XMLUI_REPO, or a sibling folder named "xmlui" next to this repo.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { formatDiagnostic, LineMap, parseMarkup } from "../packages/compiler/src/index";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const xmluiRoot = process.env.XMLUI_REPO ?? join(repoRoot, "..", "xmlui");

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git", ".turbo", "test-results", "playwright-report"]);

function findXmluiFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) findXmluiFiles(full, found);
    else if (entry.endsWith(".xmlui")) found.push(full);
  }
  return found;
}

const available = existsSync(join(xmluiRoot, "xmlui", "src"));

describe.skipIf(!available)(`XMLUI corpus (${xmluiRoot})`, () => {
  const files = available ? findXmluiFiles(xmluiRoot) : [];

  test("the corpus is not empty", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test.each(files.map((file) => [relative(xmluiRoot, file), file]))("%s", (name, file) => {
    const text = readFileSync(file, "utf8");
    const { diagnostics } = parseMarkup(text);
    const lineMap = new LineMap(text);
    expect(diagnostics.map((d) => formatDiagnostic(d, lineMap, name))).toEqual([]);
  });
});
