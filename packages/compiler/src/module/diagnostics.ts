// Module (element tree) diagnostic codes. See .ai/plan/poc-05-first-app.md and
// .ai/plan/poc-14-user-components.md (E016–E019).

export const ModuleDiagnostics = {
  E001: (name: string, hint = "") => `Unknown component '${name}'${hint ? `.${hint}` : ""}`,
  E002: (what: string) => `${what} is not supported yet`,
  E003: (detail: string) => `A document must have exactly one root element: ${detail}`,
  E004: (event: string, component: string, hint = "") => `'${component}' has no event '${event}'${hint ? `.${hint}` : ""}`,
  E005: (cycle: string) => `Reactive cycle between variables: ${cycle}`,
  E006: (name: string) => `The global '${name}' must be declared on the root element`,
  E007: (name: string) => `The variable '${name}' is declared twice on this element`,
  E008: (detail: string) => detail,
  E009: (detail: string) => detail,
  E010: (id: string) => `The id '${id}' is already used in this file (or by an enclosing scope)`,
  E011: (id: string) => `'${id}' is not a valid id: use a name starting with a letter or '_'`,
  E012: (name: string) => `The variable '${name}' has the same name as a component id`,
  E013: (detail: string) => detail,
  // E014 (an id inside a template) is retired: template instances have their own ID scope.
  E015: (name: string) => `'${name}': use when-xs, when-sm, when-md, when-lg, when-xl or when-xxl`,
  /** User-defined component definitions: names, duplicates, attributes, file names. */
  E016: (detail: string) => detail,
  /** `<Slot>`: outside a component, or a bad name. */
  E017: (detail: string) => detail,
  /** Children given to a component that has no default `<Slot/>`. */
  E018: (component: string) => `'${component}' has no <Slot/>: it cannot take children`,
  /** Code-behind: only top-level `var` and `function` declarations. */
  E019: (detail: string) => detail,
  /** Contracts (step 15): an attribute that is not a prop of the component. */
  E020: (prop: string, component: string, hint: string) => `'${component}' has no prop '${prop}'.${hint}`,
  E021: (prop: string, component: string) => `'${component}' requires the prop '${prop}'`,
  E022: (prop: string, value: string, problem: string) => `'${value}' is not a valid value for '${prop}': ${problem}`,
  E023: (prop: string, value: string, problem: string) => `'${value}' is not a valid value for '${prop}': ${problem}`,
  /** A warning: the prop or event is deprecated. */
  E024: (what: string, message: string) => `${what} is deprecated: ${message}`,
  /** `<Theme>` (step 17): an attribute that is neither a prop nor a known theme variable. */
  E025: (name: string, hint: string) => `'${name}' is not a theme variable.${hint}`,
  /** A prop that takes only a literal (step 19: Page url). */
  E026: (prop: string, component: string) => `'${component}' needs a literal '${prop}', not an expression`,
  /** A route (Page) wrapped by when or variables (step 19). */
  E027: (what: string) => `A Page cannot use ${what}: put it on the page's content`,
} as const;

export type ModuleDiagnosticCode = keyof typeof ModuleDiagnostics;
