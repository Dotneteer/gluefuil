// Module (element tree) diagnostic codes. See .ai/plan/poc-05-first-app.md.

export const ModuleDiagnostics = {
  E001: (name: string) => `Unknown component '${name}'`,
  E002: (what: string) => `${what} is not supported yet`,
  E003: (detail: string) => `A document must have exactly one root element: ${detail}`,
  E004: (event: string, component: string) => `'${component}' has no event '${event}'`,
  E005: (cycle: string) => `Reactive cycle between variables: ${cycle}`,
  E006: (name: string) => `The global '${name}' must be declared on the root element`,
  E007: (name: string) => `The variable '${name}' is declared twice on this element`,
  E008: (detail: string) => detail,
  E009: (detail: string) => detail,
  E010: (id: string) => `The id '${id}' is already used in this file`,
  E011: (id: string) => `'${id}' is not a valid id: use a name starting with a letter or '_'`,
  E012: (name: string) => `The variable '${name}' has the same name as a component id`,
} as const;

export type ModuleDiagnosticCode = keyof typeof ModuleDiagnostics;
