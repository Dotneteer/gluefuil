// Script diagnostic codes. See .ai/plan/poc-02-expression-parser.md.

export const ScriptDiagnostics = {
  S001: (ch: string) => `Invalid character '${ch}'`,
  S002: () => "Unterminated string literal",
  S003: () => "Unterminated template literal",
  S004: () => "Unterminated regular expression",
  S005: () => "Unterminated comment",
  S006: () => "Invalid number literal",
  S007: (detail: string) => `Invalid regular expression: ${detail}`,
  S008: () => "Invalid escape sequence",
  S010: () => "Expression expected",
  S011: (token: string) => `Unexpected token '${token}'`,
  S012: (expected: string) => `'${expected}' expected`,
  S013: () => "Identifier expected",
  S014: () => "Invalid assignment target",
  S015: () => "Invalid destructuring pattern",
  S016: () => "A rest element must be last",
  S017: () => "Missing initializer",
  S018: () => "A 'switch' can have only one 'default' clause",
  S019: () => "'catch' or 'finally' expected",
  S020: () => "Line break not allowed after 'throw'",
  S021: (kind: "get" | "set") =>
    kind === "get" ? "A getter must not have parameters" : "A setter must have exactly one parameter",
  S030: (feature: string) => `${feature} is not supported in gfui script`,
  S040: () => "Unclosed '{' in an interpolated value",
} as const;

export type ScriptDiagnosticCode = keyof typeof ScriptDiagnostics;
