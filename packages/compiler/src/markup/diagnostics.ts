// Markup diagnostic codes. See .ai/plan/poc-01-markup-parser.md for the
// mapping to XMLUI's codes.

export const MarkupDiagnostics = {
  M001: (ch: string) => `Invalid character '${ch}' in a tag`,
  M002: () => "Unterminated string",
  M003: () => "Unterminated comment",
  M004: () => "Unterminated CDATA section",
  M005: () => "Unterminated <script> section",
  M006: () => "Tag name expected",
  M007: () => "Attribute name expected",
  M008: () => "Attribute value expected after '='",
  M009: () => "'>' or '/>' expected",
  M010: (closing: string, open: string) => `Closing tag </${closing}> does not match the open element <${open}>`,
  M011: (name: string) => `Element <${name}> is not closed`,
  M012: (name: string) => `Closing tag </${name}> has no matching open element`,
  M013: (name: string) => `Duplicate attribute '${name}'`,
  M014: (prefix: string) => `Name expected after '${prefix}:'`,
  M015: (name: string) => `Attribute name '${name}' must start with a lowercase letter`,
} as const;

export type MarkupDiagnosticCode = keyof typeof MarkupDiagnostics;
