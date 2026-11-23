// Module (element tree) diagnostic codes. See .ai/plan/poc-05-first-app.md.

export const ModuleDiagnostics = {
  E001: (name: string) => `Unknown component '${name}'`,
  E002: (what: string) => `${what} is not supported yet`,
  E003: (detail: string) => `A document must have exactly one root element: ${detail}`,
} as const;

export type ModuleDiagnosticCode = keyof typeof ModuleDiagnostics;
