// Code generation (semantic) diagnostic codes. See .ai/plan/poc-03-codegen.md.

export const CodegenDiagnostics = {
  C001: (name: string) => `Cannot find name '${name}'`,
  C002: (name: string, hint?: string) =>
    `'${name}' is not available in pfui script${hint ? ` (${hint})` : ""}`,
  C003: (member: string) => `Member '${member}' is not accessible in pfui script`,
  C004: (callee: string) => `'new' is not allowed with '${callee}'`,
  C005: (name: string) => `'${name}': names starting with '$$' are reserved`,
  C006: (name: string) => `A binding cannot change '${name}'; use an event handler`,
  C007: () => "'var' is not allowed inside a function; use 'let' or 'const'",
  C008: (what: string) => `'${what}' is not allowed here`,
  C009: (what: string) => `'${what}' cannot be compiled`,
  C010: (name: string) => `The built-in '${name}' cannot be modified`,
  C011: (path: string) => `'${path}' is not available in pfui script`,
} as const;

export type CodegenDiagnosticCode = keyof typeof CodegenDiagnostics;
