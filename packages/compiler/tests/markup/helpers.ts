import type { ContentNode, DocumentNode } from "../../src/markup/ast";

/**
 * Compact, readable form of a syntax tree for conformance tables:
 *   element  -> [name, { attr: value | true }, ...children]
 *   text     -> "decoded text"
 *   comment  -> { comment: "…" }, cdata -> { cdata: "…" }, script -> { script: "…" }
 * Whitespace-only text is dropped unless `keepWhitespace` is set.
 */
export type Summary =
  | string
  | { comment: string }
  | { cdata: string }
  | { script: string }
  | [string, Record<string, string | true>, ...Summary[]];

export function summarize(document: DocumentNode, keepWhitespace = false): Summary[] {
  return summarizeChildren(document.children, keepWhitespace);
}

function summarizeChildren(children: ContentNode[], keepWhitespace: boolean): Summary[] {
  const result: Summary[] = [];
  for (const node of children) {
    switch (node.kind) {
      case "text":
        if (keepWhitespace || node.value.trim() !== "") result.push(node.value);
        break;
      case "comment":
        result.push({ comment: node.value });
        break;
      case "cdata":
        result.push({ cdata: node.value });
        break;
      case "script":
        result.push({ script: node.content });
        break;
      case "element": {
        const attributes: Record<string, string | true> = {};
        for (const attribute of node.attributes) {
          attributes[attribute.name.full] = attribute.value ? attribute.value.value : true;
        }
        result.push([node.name.full, attributes, ...summarizeChildren(node.children, keepWhitespace)]);
        break;
      }
    }
  }
  return result;
}

/** The source text covered by a span. */
export const sliceOf = (text: string, span: { start: number; end: number }) =>
  text.slice(span.start, span.end);
