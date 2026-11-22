// Compatibility check against the XMLUI reference repository:
//   1. every .xmlui file parses as markup without diagnostics;
//   2. every piece of script in it parses without diagnostics:
//      handlers (on* attributes, method.* attributes, <event>/<method> content,
//      <script> blocks) as statements, other attribute values and text content
//      as interpolated values;
//   3. every .xs code-behind file parses as statements.
// Skipped when the repository is not present.
//
// Location: $XMLUI_REPO, or a sibling folder named "xmlui" next to this repo.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  decodeEntitiesWithOffsets,
  formatDiagnostic,
  LineMap,
  parseInterpolation,
  parseMarkup,
  parseStatements,
  type ContentNode,
  type Diagnostic,
} from "../packages/compiler/src/index";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const xmluiRoot = process.env.XMLUI_REPO ?? join(repoRoot, "..", "xmlui");

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git", ".turbo", "test-results", "playwright-report"]);

function findFiles(dir: string, accept: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findFiles(full, accept, found);
    else if (accept(entry)) found.push(full);
  }
  return found;
}

/** Elements whose text content is script (statements), not an interpolated value. */
const STATEMENT_CONTENT_ELEMENTS = new Set(["event", "method"]);

const isHandlerAttribute = (name: string) => /^on[A-Z]/.test(name) || name.startsWith("method.");

/** Parses all script inside a markup document; returns the diagnostics. */
function parseScriptsInMarkup(text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const visit = (nodes: ContentNode[], parentName: string | undefined) => {
    for (const node of nodes) {
      if (node.kind === "script") {
        diagnostics.push(...parseStatements(node.content, { offset: node.contentSpan.start }).diagnostics);
      } else if (node.kind === "text" && node.value.trim() !== "") {
        const decoded = decodeEntitiesWithOffsets(node.raw, node.start);
        const asStatements = parentName !== undefined && STATEMENT_CONTENT_ELEMENTS.has(parentName);
        diagnostics.push(
          ...(asStatements
            ? parseStatements(decoded.value, { offsets: decoded.offsets }).diagnostics
            : parseInterpolation(decoded.value, { offsets: decoded.offsets }).diagnostics),
        );
      } else if (node.kind === "element") {
        for (const attribute of node.attributes) {
          if (!attribute.value) continue;
          // Attribute values are entity-decoded (as XMLUI does); map positions back to the raw text.
          const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
          const options = { offsets: decoded.offsets };
          diagnostics.push(
            ...(isHandlerAttribute(attribute.name.full)
              ? parseStatements(decoded.value, options).diagnostics
              : parseInterpolation(decoded.value, options).diagnostics),
          );
        }
        visit(node.children, node.name.full);
      }
    }
  };

  visit(parseMarkup(text).document.children, undefined);
  return diagnostics;
}

/**
 * Files deliberately excluded, with the reason. Keep this list short and explicit.
 * Paths are relative to the XMLUI repository root.
 */
const EXCLUDED: Record<string, string> = {
  // Unused fixtures (no spec references them) containing `export const`.
  // XMLUI itself rejects const/let in imported modules (ModuleValidator, W044).
  "xmlui/src/components/App/test-files/test-constants.xs": "export const: invalid in XMLUI modules too",
  "xmlui/src/components/App/test-files/test-values.xs": "export const: invalid in XMLUI modules too",
};

const available = existsSync(join(xmluiRoot, "xmlui", "src"));

describe.skipIf(!available)(`XMLUI corpus (${xmluiRoot})`, () => {
  const markupFiles = available ? findFiles(xmluiRoot, (name) => name.endsWith(".xmlui")) : [];
  const codeBehindFiles = available ? findFiles(xmluiRoot, (name) => name.endsWith(".xs")) : [];
  const cases = (files: string[]) =>
    files.map((file) => [relative(xmluiRoot, file), file]).filter(([name]) => !(name! in EXCLUDED));
  const format = (diagnostics: Diagnostic[], text: string, name: string) => {
    const lineMap = new LineMap(text);
    return diagnostics.map((d) => formatDiagnostic(d, lineMap, name));
  };

  test("the corpus is not empty", () => {
    expect(markupFiles.length).toBeGreaterThan(50);
  });

  describe("markup", () => {
    test.each(cases(markupFiles))("%s", (name, file) => {
      const text = readFileSync(file, "utf8");
      expect(format(parseMarkup(text).diagnostics, text, name)).toEqual([]);
    });
  });

  describe("script inside markup", () => {
    test.each(cases(markupFiles))("%s", (name, file) => {
      const text = readFileSync(file, "utf8");
      expect(format(parseScriptsInMarkup(text), text, name)).toEqual([]);
    });
  });

  describe.skipIf(codeBehindFiles.length === 0)("code-behind (.xs)", () => {
    test.each(cases(codeBehindFiles))("%s", (name, file) => {
      const text = readFileSync(file, "utf8");
      expect(format(parseStatements(text).diagnostics, text, name)).toEqual([]);
    });
  });
});
