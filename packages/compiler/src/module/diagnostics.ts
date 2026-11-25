// Module (element tree) diagnostic codes. See .ai/plan/poc-05-first-app.md and
// .ai/plan/poc-14-user-components.md (E016–E019), poc-19a-app-shell.md (E028–E030), poc-19d-layout.md (E031–E032), poc-23-display.md (E033–E034), poc-25-choice.md (E035–E036).

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
  /** The App shell (step 19A): regions in the wrong place, impossible combinations. */
  E028: (detail: string) => detail,
  /** A warning: a shell setting that has no effect. */
  E029: (detail: string) => detail,
  /** A prop that no longer exists, with what to use instead (App layout). */
  E030: (prop: string, component: string, instead: string) => `'${component}' has no '${prop}' any more: ${instead}`,
  /** A layout value (width, padding, gap, …) that is not valid CSS of its kind, or names an unknown theme variable (steps 19D–19E). */
  E031: (prop: string, value: string, problem: string) => `'${value}' is not a valid value for '${prop}': ${problem}`,
  /** A component that no longer exists, with what to use instead (FlowLayout). */
  E032: (component: string, instead: string) => `'${component}' is not a component any more: ${instead}`,
  /** A warning: a literal outside a prop's known values (an icon name that isn't built in; an app may register it). */
  E033: (prop: string, value: string, hint: string) => `'${value}' is not a known value of '${prop}'${hint ? `.${hint}` : ""}`,
  /** An element inside a component whose content is text (Markdown). */
  E034: (component: string, element: string) => `'${component}' takes text only; '<${element}>' can't be inside it (wrap HTML in <![CDATA[ … ]]>)`,
  /** A child of a component whose children are options (Select) that is not an Option or an Items of Options. */
  E035: (component: string, what: string) => `'${component}' takes Option and Items (of Option) children only; ${what} can't be inside it`,
  /** Both `data` and Option children. */
  E036: (component: string) => `'${component}' has both 'data' and Option children; use one of them`,
} as const;

export type ModuleDiagnosticCode = keyof typeof ModuleDiagnostics;
