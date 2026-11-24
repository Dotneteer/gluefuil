# Component metadata and contracts

> Subsystem reference: the metadata format every component is described in,
> and the compile-time checks of markup against it. Describes the code as it
> is. Design and XMLUI comparison:
> [`../plan/poc-15-contracts.md`](../plan/poc-15-contracts.md).
>
> **Last updated:** step 15.

## The format (`@patchfuil/components/metadata`, React-free)

```ts
interface ComponentMetadata {
  description: string;
  props: Record<string, PropMetadata>;
  events?: Record<string, EventMetadata>;          // `click` ↔ onClick / <event name="click">
  api?: Record<string, { description: string }>;  // what an `id` exposes: values and methods
  templates?: Record<string, { description: string; contextVars: string[] }>;
  childrenTemplate?: string;
  allowArbitraryProps?: boolean;                  // no unknown-prop check
  allowArbitraryEvents?: boolean;                 // no unknown-event check
  themeVars?: Record<string, string>;             // theme variable defaults (step 17)
  themeVarAttributes?: boolean;                   // other attributes are theme variables (Theme)
  nonVisual?: boolean;                            // no behaviors (step 18)
  isRoute?: boolean;                              // E027 (step 19)
  regions?: Record<string, string>;               // App: region children become these props (steps 19A–19C)
  isRegion?: boolean;                             // E028: only as a direct child of App
  removedProps?: Record<string, { message: string; byValue?: Record<string, string> }>;   // E030
  removed?: string;                               // E032: the component no longer exists (FlowLayout)
  alias?: { component: string; props: Record<string, string> };   // HStack → Stack (steps 19D–19F)
  layoutProps?: false;                            // no LAYOUT_PROPS (App, the shell regions, nav items)
  optionalThemeVars?: readonly string[];          // known theme variables without a default (gap-Stack)
}
interface PropMetadata {
  description: string;
  valueType?: "string" | "boolean" | "number" | "integer" | "any";   // default "any"
  availableValues?: readonly string[];            // a closed enum
  isRequired?: boolean;
  deprecationMessage?: string;
  isLiteral?: boolean;                           // E026: no `{…}` (step 19)
  cssKind?: "size" | "spacing" | "color" | "border";   // E031: a literal is checked as CSS of this kind
  star?: boolean;                                // with "size": star sizes (*, 2*) allowed
}
interface EventMetadata { description: string; deprecationMessage?: string }
```

- **The built-ins** declare a `valueType` for every prop (a test enforces
  this). `Stack.orientation` is the enum `vertical | horizontal`.
- **The layout props** (`LAYOUT_PROPS`, `layout-metadata.ts`: `width`,
  `padding`, `backgroundColor`, …) are accepted by every visual component
  without being in its `props` (`layoutProp()`), unless `nonVisual` or
  `layoutProps: false`. A component's own prop of the same name wins.
- **User-defined components** get metadata derived from their analysis
  (`UserComponentInfo`):
  - **props:** the `$props.x` members their code reads;
  - **events:** the literal names of `emitEvent('x')` and
    `hasEventHandler('x')`;
  - **api:** their methods.

  Props are `"any"`. Any other use of `$props` (computed, or passed
  whole), a computed event name, or code that doesn't parse makes the
  list *open* (`undefined`): any prop or event is accepted. The markup,
  the handlers and the code-behind all count.

## The checks (`compileModule`)

Only element attributes are checked. The props of an attached behavior
are the behavior's ([behaviors.md](behaviors.md)), checked against its
own props. **Framework attributes are never
props:** `id`, `when`, `when-*`, `var.*`, `global.*`, `handlerPolicy*`,
`handlerTimeoutMs*`, `on*` (checked as events), and the lifecycle events.

| Code | Check | Where |
|------|-------|-------|
| E001 | Unknown component, with "did you mean" | the tag name |
| E004 | Unknown event (unless `allowArbitraryEvents`), with "did you mean" | the attribute, or `<event name>` |
| E020 | Unknown prop (unless `allowArbitraryProps`), with "did you mean" | the attribute name |
| E021 | A required prop is missing (any attribute form satisfies it) | the tag name |
| E022 | A literal of the wrong type: `boolean` needs `true` or `false`, `number` a finite number, `integer` `-?\d+`. A key-only attribute counts as `true`. | the value |
| E023 | A literal outside `availableValues` (the message lists them) | the value |
| E024 | A deprecated prop or event: **always a warning**, with the message | the attribute |
| E025 | A `<Theme>` attribute that is neither a prop nor a known theme variable ([theming.md](theming.md#contracts)) | the attribute name |
| E026 | A literal-only prop (`isLiteral`) given an expression: `Page url` ([routing.md](routing.md)) | the value |
| E027 | A route (`isRoute`: `Page`) using `when` or variables, which would wrap it | the attribute or `<variable>` |
| E028 | The App shell: a region (`isRegion`) not a direct child of `App`, or twice; `fullHeight`/`collapsible` without a side nav; `NavPanelCollapseButton` without a collapsible side nav ([app-shell.md](app-shell.md)) | the element or attribute name |
| E029 | A warning: `sticky` on a region when `App scroll` is not `page` | the attribute name |
| E030 | A removed prop (`removedProps`: App `layout`, `scrollWholePage`, `fitContent`), with what to write instead | the attribute name |
| E031 | A literal layout value (a prop with `cssKind`: the layout props, `Stack gap`, `itemWidth`) that is not valid for its kind, or names an unknown theme variable (`$space-forty`) ([layout.md](layout.md)) | the value |
| E032 | A removed component (`removed`: `FlowLayout`), with what to write instead | the tag name |
| C015 | An unknown member of a component ID (`box.valu`, `c.rest()`), with "did you mean"; a component without `api` has no members | the member |

- **Bound values are not type-checked:** their values are known only at
  runtime.
- **C015** is reported by the emitter. `compileModule` passes it a
  `members(name)` lookup over the IDs and their components (`collectIds`
  records each ID's component). It applies only when the name resolves to
  the scope, because a local (`(w) => w.x`) shadows the ID. Computed
  members are not checked. Code-behind is checked too.
- **"Did you mean":** `closestMatch` (`source/suggest.ts`): Levenshtein
  distance ≤ 2, the first candidate on ties.
- **Severity:** contract violations (E004, E020–E023, C015) are errors.
  With `strictContracts: false` they are warnings, and an unknown prop is
  passed through to the component as in XMLUI. E001 stays an error, and
  E024 is always a warning.

## Delivery

| Path | Option | Warnings |
|------|--------|----------|
| `compileModule` | `strictContracts` | in `diagnostics` (`severity: "warning"`) |
| Vite plugin | `pfui({ strictContracts })` | `this.warn` (markup and code-behind) |
| Standalone | `strictContracts`, `data-strict-contracts="false"` | `console.warn("pfui: file:line:col: warning …")` |

## Files

| File | Contents |
|------|----------|
| `components/src/metadata.ts` | `ComponentMetadata`, `PropMetadata`, `EventMetadata`, `PropValueType`; the built-ins |
| `compiler/src/module/contracts.ts` | `checkLiteral` (E022, E023) |
| `compiler/src/source/suggest.ts` | `editDistance`, `closestMatch`, `didYouMean` |
| `compiler/src/module/compile-module.ts` | The prop, required, event and deprecation checks (`element`, `checkEvent`, `checkPropLiteral`); `reportContract`, `reportDeprecated`; `memberLookup`; user-component metadata (`metadataOf`) |
| `compiler/src/codegen/emitter.ts` | `checkComponentMember` (C015); options `members`, `contractSeverity` |
| `compiler/src/module/analyze.ts` | `collectUsage`: the derived props and events |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/contracts.test.ts` | The diagnostics table (code, span, severity) for every check; messages with suggestions; framework attributes; bound values; C015 in bindings, handlers and code-behind, and what it never checks; derived user-component contracts and their open cases; `strictContracts: false`; the helpers |
| `components/tests/smoke.test.ts` | Every built-in prop declares a `valueType` |
| `vite-plugin/tests/plugin.test.ts`, `standalone/tests/loader.test.tsx` | A violation is an error by default, and a warning (the app runs) with `strictContracts: false` |
