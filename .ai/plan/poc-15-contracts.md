# Step 15: Component metadata and compile-time contracts

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

One metadata format describes every component: the built-ins, wrapped React
components (step 16) and user-defined components. The compiler checks markup
against it:
- unknown props, events and API members (with "did you mean");
- missing required props;
- literal values of the wrong type, or outside an enum;
- deprecated props and events (warnings).

## Background (XMLUI)

Sources:
- `website/content/docs/pages/managed-react/verified-type-contracts.md`;
- `build-validation-analyzers.md`;
- `xmlui/src/components-core/type-contracts/` (`verifier.ts`,
  `rules/coerce.ts`, `suggestions.ts`);
- `abstractions/ComponentDefs.ts` (`PropertyValueType`, `isRequired`,
  `availableValues` + `isStrictEnum`, `deprecationMessage`,
  `allowArbitraryProps`).

- **Checks:** `id-unknown-prop`, `missing-required`, `wrong-type`,
  `value-not-in-enum` (only with `isStrictEnum`), `id-unknown-event`,
  `id-unknown-method`, `deprecated-prop`.
- **Static checks see literal values only.** Expression-bound values are
  checked at runtime in a warn mode.
- **"Did you mean":** Levenshtein distance ≤ 2.
- **Strict by default:** violations are errors, and deprecations stay
  warnings. `strictTypeContracts: false` turns violations into warnings.
- **UDC metadata is derived:** `ud-metadata.ts` collects `$props.<member>`
  references as props.
- **Suppression comments** (`<!-- xmlui-disable-next-line code -->`).

## Design

### The metadata (`@gluefuil/components/metadata`, React-free)

```ts
interface ComponentMetadata {
  description: string;
  props: Record<string, PropMetadata>;
  events?: Record<string, { description: string; deprecationMessage?: string }>;
  api?: Record<string, { description: string }>;      // values and methods an `id` exposes
  templates?: …; childrenTemplate?: …;                 // as before
  allowArbitraryProps?: boolean;
  allowArbitraryEvents?: boolean;
}
interface PropMetadata {
  description: string;
  valueType?: "string" | "boolean" | "number" | "integer" | "any";   // default "any"
  availableValues?: readonly string[];   // a closed enum
  isRequired?: boolean;
  deprecationMessage?: string;
}
```

- **Divergences from XMLUI:**
  - `availableValues` is always closed. There is no hints-only mode
    (`isStrictEnum`) until something needs one.
  - `"boolean"` literals must be `true` or `false`; XMLUI accepts anything
    and coerces it.
  - The richer XMLUI value types (`color`, `length`, `icon`, …) arrive
    with the components that need them.

### User-defined components: derived metadata

`analyzeModule(markup, { codeBehind })` now also parses each definition's
expressions, handlers and code-behind:

- **Props:** every `$props.x` (and `$props?.x`). Any other use of `$props`
  (`$props[k]`, `$props` passed as a whole) means *any prop*
  (`props: undefined`).
- **Events:** the literal first argument of each `emitEvent('x', …)` and
  `hasEventHandler('x')`. A computed name, or `emitEvent` used as a
  value, means *any event*.
- **API members:** the methods.

These become `UserComponentInfo.props` / `.events`, where `undefined`
means any. The compiler turns the info into ordinary `ComponentMetadata`,
so every component goes through the same checks.

### The checks (`compileModule`)

They apply to element attributes. The framework attributes are never
props: `id`, `when*`, `var.*`, `global.*`, the handler policies and
timeouts, `on*`, and the lifecycle events.

| Code | Check | Severity |
|------|-------|----------|
| E001 | Unknown component, now with "did you mean" | error |
| E004 | Unknown event, now with "did you mean" | contract |
| E020 | Unknown prop, with "did you mean" (unless `allowArbitraryProps`) | contract |
| E021 | A required prop is missing (at the element name) | contract |
| E022 | A literal value of the wrong type | contract |
| E023 | A literal value outside the enum (lists the values) | contract |
| E024 | A deprecated prop or event (the message) | warning |
| C015 | An unknown member of a component ID (`box.valu`, `counter1.rest()`), in bindings and handlers | contract |

- **"Contract" severity** is an error by default. The new
  `compileModule({ strictContracts: false })` makes it a warning, for
  migrating XMLUI markup: the component then receives the unknown prop as
  it would in XMLUI.
- **Only literal values are type-checked**, as in XMLUI. Runtime checks of
  bound values are left for later.
- **C015** needs the component behind each ID. `collectIds` records it, and
  the emitter gets a `members(name)` lookup. It reports only when the name
  resolves to the scope: locals shadow IDs. A computed member is not
  checked.

### Delivery

- **The Vite plugin** already reports warnings through `this.warn`. It
  passes code-behind to `analyzeModule`.
- **Standalone mode** logs warnings with `console.warn`.

### Not in this step

- Suppression comments.
- Runtime checks of bound values.
- Explicit metadata for user components; derived metadata is enough for
  now.
- Component-level deprecation.

## Tests

- **A diagnostics table** (`compiler/tests/module/contracts.test.ts`): markup
  with custom metadata gives the expected code at the expected span, for
  each check, including the suggestions, non-strict mode, and what is never
  checked (bound values, framework attributes).
- **Analysis:** derived props and events, and the open cases.
- **The literal checkers** and the suggestion helper.
- **Built-in metadata:** every built-in prop has a `valueType`, and the
  existing apps compile cleanly (the hello app, the fixtures, the XMLUI
  corpus bindings).

## Outcome

Implemented as designed. Details: [`../docs/contracts.md`](../docs/contracts.md).

- **One format** (`ComponentMetadata`, `PropMetadata`, `EventMetadata`).
  The built-ins declare their value types (enforced by a test). User
  components get their contracts derived; wrapped components (step 16)
  will declare theirs.
- **The existing apps pass the strict checks unchanged:** the hello app
  with its user components, the standalone fixture, and the XMLUI corpus
  bindings.
- **The diagnostics table** has 66 cases, covering code, span and severity.
- `npm run check`: 1,802 unit tests in 58 files and 47 E2E tests.

## Findings

- **Deriving user-component contracts works because their code is
  analyzable.**
  - `$props.x`, `emitEvent('x')` and method names give exact contracts,
    with no declarations.
  - Anything dynamic (a computed member, `$props` passed whole, a computed
    event name, or code that doesn't parse) opens the contract instead of
    guessing: a wrong contract would reject valid callers.
  - The code-behind has to be part of the analysis.
- **API members are checked by name resolution, not a separate pass.**
  - The emitter already knows whether `box` is a local or a scope name, so
    C015 respects shadowing for free.
  - It works the same in bindings, handlers and code-behind.
- **Contract severity has to be per diagnostic, not per code family:**
  - a deprecation is always a warning;
  - E001 is always an error (there is nothing to render);
  - everything else follows `strictContracts`.

## Open for later steps

- **Runtime checks of bound values** (XMLUI's warn mode).
- **Suppression comments** (`<!-- gfui-disable-next-line E020 -->`).
- **Explicit contracts for user components**, such as required props or
  value types.
- **Richer value types** (color, length, icon, …) with the components
  that need them (step 16 onward).
