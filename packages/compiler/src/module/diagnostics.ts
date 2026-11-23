// Module (element tree) diagnostic codes. See .ai/plan/poc-05-first-app.md and
// .ai/plan/poc-14-user-components.md (E016–E019).

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
  E013: (detail: string) => detail,
  E014: () => "An id inside a template is not supported yet",
  E015: (name: string) => `'${name}': use when-xs, when-sm, when-md, when-lg, when-xl or when-xxl`,
  /** User-defined component definitions: names, duplicates, attributes, file names. */
  E016: (detail: string) => detail,
  /** `<Slot>`: outside a component, or a bad name. */
  E017: (detail: string) => detail,
  /** Children given to a component that has no default `<Slot/>`. */
  E018: (component: string) => `'${component}' has no <Slot/>: it cannot take children`,
  /** Code-behind: only top-level `var` and `function` declarations. */
  E019: (detail: string) => detail,
} as const;

export type ModuleDiagnosticCode = keyof typeof ModuleDiagnostics;
