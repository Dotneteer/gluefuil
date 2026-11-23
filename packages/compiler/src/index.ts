// --- Markup ---------------------------------------------------------------------
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
export { decodeEntities, decodeEntitiesWithOffsets, type DecodedText } from "./markup/entities";
export { parseMarkup, type ParseMarkupResult } from "./markup/parser";

// --- Script ---------------------------------------------------------------------
export type * as ScriptAst from "./script/ast";
export { ScriptDiagnostics, type ScriptDiagnosticCode } from "./script/diagnostics";
export {
  parseInterpolation,
  type ExpressionSegment,
  type InterpolationSegment,
  type LiteralSegment,
  type ParseInterpolationResult,
} from "./script/interpolation";
export { parseExpression, parseStatements, type ParseExpressionResult, type ParseStatementsResult } from "./script/parse";
export type { ScriptSourceOptions } from "./script/parser";

// --- Code generation (bindings) ---------------------------------------------------
export {
  compileExpression,
  compileHandler,
  compileInterpolation,
  type CompileHandlerOptions,
  type CompileOptions,
  type CompileResult,
} from "./codegen/compile";
export { CodegenDiagnostics, type CodegenDiagnosticCode } from "./codegen/diagnostics";
export type { EmitterOptions, ScopeNames } from "./codegen/emitter";
export {
  ALLOWED_GLOBALS,
  APP_GLOBALS,
  BANNED_GLOBALS,
  BANNED_MEMBERS,
  CONSTRUCTIBLE,
  RESTRICTED_GLOBAL_MEMBERS,
} from "./codegen/names";

// --- Modules (.pfui documents) ------------------------------------------------------
export { compileModule, type CompileModuleOptions, type CompileModuleResult } from "./module/compile-module";
export { ModuleDiagnostics, type ModuleDiagnosticCode } from "./module/diagnostics";

// --- Source maps -------------------------------------------------------------------
export {
  buildSourceMap,
  decodeMappings,
  decodeVlq,
  encodeMappings,
  encodeVlq,
  offsetSourceMapLines,
  originalPositionFor,
  type Mapping,
  type SourceMap,
} from "./source/source-map";

// --- Source positions and diagnostics ---------------------------------------------
export { formatDiagnostic, type Diagnostic, type Severity } from "./source/diagnostic";
export { LineMap, type Position } from "./source/line-map";
