// Code generation (semantic) diagnostic codes. See .ai/plan/poc-03-codegen.md.

export const CodegenDiagnostics = {
  C001: (name: string) => `Cannot find name '${name}'`,
  C002: (name: string, hint?: string) =>
    `'${name}' is not available in gfui script${hint ? ` (${hint})` : ""}`,
  C003: (member: string) => `Member '${member}' is not accessible in gfui script`,
  C004: (callee: string) => `'new' is not allowed with '${callee}'`,
  C005: (name: string) => `'${name}': names starting with '$$' are reserved`,
  C006: (name: string) => `A binding cannot change '${name}'; use an event handler`,
  C007: () => "'var' is not allowed inside a function; use 'let' or 'const'",
  C008: (what: string) => `'${what}' is not allowed here`,
  C009: (what: string) => `'${what}' cannot be compiled`,
  C010: (name: string) => `The built-in '${name}' cannot be modified`,
  C011: (path: string) => `'${path}' is not available in gfui script`,
  C012: (name: string) => `'${name}' is not a variable; a handler can only change variables`,
  C014: (name: string) => `The context variable '${name}' is not available here`,
  /** Contracts (step 15): `box.valu` where `box` is a component without that API member. */
  C015: (id: string, component: string, member: string, hint: string) => `'${id}' (${component}) has no member '${member}'.${hint}`,
  C013: (name: string) => `Destructuring or loop targets cannot change part of '${name}'; assign to it directly`,
} as const;

export type CodegenDiagnosticCode = keyof typeof CodegenDiagnostics;
