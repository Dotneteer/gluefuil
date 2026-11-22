export type {
  AttributeNode,
  AttributeValue,
  CDataNode,
  CommentNode,
  ContentNode,
  DocumentNode,
  ElementNode,
  MarkupNode,
  Name,
  ScriptNode,
  Span,
  TextNode,
} from "./markup/ast";
export { MarkupDiagnostics, type MarkupDiagnosticCode } from "./markup/diagnostics";
export { decodeEntities } from "./markup/entities";
export { parseMarkup, type ParseMarkupResult } from "./markup/parser";
export { formatDiagnostic, type Diagnostic, type Severity } from "./source/diagnostic";
export { LineMap, type Position } from "./source/line-map";
