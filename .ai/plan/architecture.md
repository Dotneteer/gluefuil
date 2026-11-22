# Framework architecture (master plan)

**Status:** Draft

The framework is **patchfuil** (short name **pfui**). XMLUI is its origin
and reference. Markup files use the `.pfui` extension.

This is the master plan. It records the goals and constraints, and lists the
design areas we work through **one at a time**. Each area is settled in this
file or, if it grows large, in its own plan linked from here.

XMLUI paths below are relative to `/Users/dotneteer/source/xmlui`.

## Goal

Build a declarative, reactive UI framework that keeps XMLUI's best concepts
but replaces its implementation. The new engine **compiles** markup and
scripts to JavaScript ahead of time, so the work XMLUI does at runtime
(parsing the tree, interpreting expressions, detecting changes) happens once,
at compile time.

## What we keep from XMLUI (concepts, not code)

| Concept | What it means in XMLUI | Source |
|---------|------------------------|--------|
| **Theming** | Declarative theme definitions (`extends` chains, light/dark tones) compiled into CSS custom properties; derived token scales (spacing, font sizes, color tones); theme variable naming `property[-part][-Component][-variant][--state]`; `$ref` between variables. | `.ai/xmlui/theming-styling.md`, `website/content/docs/pages/styles-and-themes/` |
| **Behaviors** | Cross-cutting features (label, tooltip, animation, variant, bookmark, form binding, validation) that attach to any component when a trigger prop is present. Components don't need to know about them. They apply in a fixed order. | `.ai/xmlui/behaviors.md`, `website/content/docs/pages/behaviors.md` |
| **JavaScript subset** | A restricted, sandboxed JS dialect: optional chaining is the default, no `async`/`await` syntax, a limited `new`, banned globals, `var` declares a *reactive* variable while `let`/`const` don't. | `.ai/xmlui/expression-eval.md` §"Differences from JavaScript", `website/content/docs/pages/scripting.md` |
| **Smart sync/async** | Binding expressions are synchronous and pure. Event handlers are implicitly async: the engine awaits promise-returning calls (including inside `map`/`filter`/…), so authors never write `await`. | `.ai/xmlui/expression-eval.md` §"Two Evaluation Tracks", §5, §6; `website/content/docs/pages/scripting.md:365` |
| **Data binding and declarative data operations** | Any component can take a `data` attribute. A string value is treated as a URL that returns JSON, so `<List data="https://…">` just works; an expression value is bound reactively (`data="{users}"`). `DataSource` handles declarative reads: a loader with reactive state (`value`, `inProgress`, `loaded`, `error`), `refetch()` and `cancel()`; dependent queries chained through expressions in `url` (a loader waits until the values it depends on are available); `transformResult`, `resultSelector`, `dataType` (JSON/CSV/text), polling, paging selectors, structural sharing and `mockData`. `APICall` handles declarative writes: `execute(...)` with `$param`/`$params`; `beforeRequest` (which can cancel), `success` and `error` events; built-in confirmation and progress, completion and error notifications; long-running operations with status polling; and `invalidates` to refresh related `DataSource`s. Inline `APICall`, `FileUpload` and `FileDownload` inside `<event>`, plus `Actions.callApi`, `Actions.download` and `Actions.upload` in script. | `website/content/docs/pages/core-properties.md` § data; `.ai/xmlui/data.md`; `website/content/docs/reference/components/DataSource.md`, `APICall.md`; `website/content/docs/pages/globals.md` § Actions |

### Further XMLUI concepts we keep (confirmed)

All of these are kept. **User-defined components are the most significant**
(see their own section below).

| Concept | What it means in XMLUI | Source |
|---------|------------------------|--------|
| **Reactive variables** | `var.name="{expr}"` or `<variable>` declares a value that follows its expression like a spreadsheet cell, **until a handler assigns to it**; from then on it holds the assigned value. Global variables (`global.` prefix, `Globals.xs`). | `pages/markup.md` § Variables; `pages/reactive-intro.md`; `pages/scoping.md` |
| **Scoping and component IDs** | Variables flow down to nested built-in components and stop at the boundary of a user-defined component. `id` makes a component addressable from expressions (`myInput.value`, `dialog.open()`, `users.refetch()`). | `pages/scoping.md`; `pages/context-variables.md` § General |
| **Context variables** | Components inject `$`-prefixed values into the templates and handlers they own: `$item`, `$itemIndex`, `$param`/`$params`, `$data`, `$value`, `$setValue`, `$validationResult`, `$routeParams`, `$pathname`, `$linkInfo`, `$props`, `$result`, `$error`. | `pages/context-variables.md` |
| **User-defined components** | `<Component name="…">` in `components/*.xmlui` (found automatically) or inline. Takes `$props`; emits events; exposes methods; uses `<Slot>` with data passed into slot content. Usable exactly like built-ins. | `pages/user-defined-components.md`; `.ai/xmlui/user-defined-components.md` |
| **Helper tags and template properties** | `<property>`, `<event>`, `<variable>`, `<method>` and `<script>` express anything an attribute can't. Template properties (`itemTemplate`, `emptyListTemplate`, …) take markup as a value. | `pages/helper-tags.md`; `pages/template-properties.md` |
| **Declarative events and global functions** | Handlers are inline script or `<event>` blocks that can contain components (inline `APICall`). Global functions: `navigate()`, `toast()`, `confirm()`, the `Actions.*` and `App.*` namespaces, and date and math utilities. | `pages/globals.md`; `pages/app-globals.md` |
| **Code-behind** | `.xs` files hold functions and variables for a markup file; `Globals.xs` holds app-wide ones. | `pages/scripting.md` § Code-Behind files |
| **Conditional and responsive rendering** | `when="{expr}"` on any component; responsive `when-sm`/`when-md`/… variants; responsive props (`width-md="…"`). | `pages/visibility.md`; `.ai/xmlui/theming-styling.md` § Responsive Layout |
| **Forms** | `Form`/`FormItem` with `$data` and `bindTo`; declarative validation (`minLength`, `pattern`, `regex`, compound rules, severity and messages); server-side validation; submit straight to an `APICall`. | `pages/forms.md`; `.ai/xmlui/form-infrastructure.md` |
| **Routing** | `Pages`/`Page` with dynamic segments, query parameters, active links, hash or standard routing, and subdirectory base paths; `willNavigate`/`didNavigate`. | `pages/routing-and-links.md`; `.ai/xmlui/routing.md` |
| **Modal dialogs** | Declarative (state-driven) or imperative (`dialog.open(params)`, with `$param` inside the dialog). | `pages/modal-dialogs.md` |
| **Lifecycle** | `onMount`/`onUnmount` on any component; managed cleanup. | `pages/core-properties.md`; `.ai/xmlui/lifecycle.md` |
| **Cooperative concurrency** | `$cancel` tokens; `handlerPolicy` for repeated clicks and slow handlers; timeouts; transactional state writes. Closely tied to smart sync/async. | `.ai/xmlui/concurrency.md`; `pages/managed-react/cooperative-concurrency.md` |
| **Structured errors** | `AppError`, `<Fallback>`, `<RetryPolicy>`, `App onError`, `App.errors`. | `.ai/xmlui/errors.md`; `pages/managed-react/structured-exception-model.md` |
| **Internationalization** | Locale bundles with ICU messages, `App.translate`, locale-aware formatters (`App.formatNumber`, `App.formatCurrency`, …), `<Locale>` scopes, and RTL from the locale. | `pages/globals.md` § App Namespace; `.ai/xmlui/i18n.md` |
| **App configuration** | `config.json` holds app globals, themes, routing mode and resources. | `pages/xmlui-config.md`; `pages/app-structure.md` |

Extension packages are already covered by requirement 5. Managed React has
its own section below.

### User-defined components (the most significant concept)

**What XMLUI offers.** Sources: `pages/user-defined-components.md`,
`.ai/xmlui/user-defined-components.md`, `pages/managed-react/udc-sandbox.md`.

- **Declaration.** `<Component name="…">` lives in `components/Name.xmlui`
  (found automatically; the file name must match the component name) or
  inline in `Main.xmlui` (a file-based one wins on a name clash). It can
  have a code-behind file (`Name.xmlui.xs`).
- **Props.** Read as `$props.x`, with defaults via `??`. `$props` is a
  read-only snapshot. Prop names are inferred from `$props.*` references
  (`ud-metadata.ts`); explicit metadata wins.
- **Own state.** `var.`/`<variable>`, reactive, private to the component.
- **Events.** `emitEvent('incremented', value)` reaches the caller's
  `onIncremented` handler.
- **Methods.** `<method name="…">` or `method.reset="…"`. Callers use
  `id.reset()`; the component itself uses `$self.reset()`.
- **Slots.**
  - The default `<Slot/>` receives the caller's children.
  - A named slot (`<Slot name="rowTemplate"/>`, whose name must end in
    `Template`) receives a `<property name="rowTemplate">`.
  - Slot content can have fallback markup.
  - Slot attributes (`<Slot item="{$item}">`) become `$item` in the
    caller's template, so data flows from the component back to the caller.
- **Scope.** A UDC is an isolation boundary. Parent variables are not
  visible inside it, and the caller's slot content is evaluated in the
  caller's scope. Exception: `receivesContextVars` opts into selected
  ambient `$` variables (`$cell`, `$rowIndex`, …).
- **Theme.** Theme variables referenced in a UDC's layout props are
  collected, so UDCs can be themed too.
- **Sandbox.** A UDC can declare its props, events, methods and slots,
  list the primitives it may use, be marked trusted or untrusted, and ship
  a manifest.
- **Behaviors** (tooltip, label, variant, …) are *skipped* on a UDC tag;
  they apply only to built-ins inside it.

**Why UDCs fit compilation especially well:**

| Aspect | XMLUI today | With our compiler |
|--------|-------------|-------------------|
| Runtime form | A `CompoundComponent` container with its own state reducer; slot content wrapped in `Container`s; `React.memo` and shallow-compare layers on top. | One `.pfui` file compiles to **one JS module exporting one React component**. Variables become signals, slots become `children` and render-prop functions, and methods are exposed through a ref handle. No wrapper layers. |
| Unit of work | The whole tree is parsed at startup. | The file is the unit of **compilation, caching** (keyed by content hash), **code splitting**, **file watching** (recompile one file) and **source maps**. |
| Contract | Inferred from `$props.*` usage; checked at runtime. | Inferred **plus optionally declared** (types, defaults, required, events, methods, slots). Checked **at every call site at compile time**, and the same metadata drives editor completion. |
| Scope isolation | Enforced while evaluating. | Enforced while **resolving names at compile time**: a reference to a parent variable inside a UDC is a compile error, not a silent `undefined`. |
| Slot context variables | Collected at runtime; `receivesContextVars` is an opt-in escape hatch. | Slot props are render-prop arguments the compiler knows statically, and context variables a UDC receives are declared and checked. |
| One component model | UDCs, wrapped React components and built-ins are handled by different code paths. | **All three share one metadata contract.** A caller can't tell (and doesn't need to know) whether `<Foo>` is built-in, wrapped React or a UDC. |

**Open questions (UDCs):**

1. Prop declarations: inferred only (as in XMLUI), optional explicit
   declarations, or required for components that are shared or packaged?
2. Should behaviors attach to a UDC tag? For example, by forwarding them to
   a designated root element.
3. Keep the "named slots end in `Template`" rule, or allow any name?
4. Can a UDC be packaged and distributed like an extension package
   (precompiled, with its metadata)?

### Managed React

XMLUI's umbrella promise: **the framework, not the app author, owns the
dangerous and repetitive parts of React development**. Authors describe
intent in markup; the framework adds guardrails, and turns mistakes into
diagnostics instead of silent misbehavior. It is also positioned as what
makes AI-generated markup safe to accept, because it gives the AI a small,
checkable vocabulary. Source: `pages/managed-react/overview.md`; one page per
guarantee in `pages/managed-react/`.

Grouped by what our compiler architecture means for each:

**1. Correctness checks: become compiler diagnostics.** These are a natural
fit, because a compiler sees the whole app before it runs.

| Guarantee | What it does | Source |
|-----------|--------------|--------|
| Verified type contracts | Component metadata checks markup for unknown or missing props, invalid enum values, wrong literal types, unknown events and methods, and deprecated props. | `verified-type-contracts.md` |
| Build-validation analyzers | Typo'd component names, undeclared attributes and events, always-true conditions, and handlers missing parentheses, all reported as `file:line:col` diagnostics with suggested fixes. | `build-validation-analyzers.md` |
| Reactive cycle detection | A dependency graph of variables, code-behind functions and loaders; cycles are reported as strongly connected components. | `reactive-cycle-detection.md` |
| Enforced versioning | Each public API element has a lifecycle; deprecation gives an actionable warning, removal gives a loud error. | `enforced-versioning.md` |
| Sealed theming sandbox | Typed validation of theme variables, and a rule table for `style` and the layout shorthand props. | `sealed-theming-sandbox.md` |
| Themevars namespace | Extension packages prefix their theme variables so they can't collide. | `themevars-namespace.md` |

**2. Security sandbox: must be redesigned for compiled code.** XMLUI
enforces these in its interpreter (`code-injection-prevention.md` says that
every expression goes through an AST interpreter and never through `eval`).
Once we emit plain JS, **the compiler becomes the sandbox**. It must
statically resolve every identifier and member access against an allowlist,
and emit guarded access wherever a value can't be resolved statically.
Standalone mode also compiles in the browser and so needs `new Function`
(or blob scripts), which conflicts with a strict Content Security Policy
(`unsafe-eval`). That needs an explicit answer, such as using build-time
compilation whenever a strict CSP is required.

| Guarantee | What it does | Source |
|-----------|--------------|--------|
| Code-injection prevention | `eval`, `new Function` and the `Function` constructor are unreachable from expressions. | `code-injection-prevention.md` |
| DOM API isolation | Expressions can't touch the DOM or platform APIs; safe replacements are exposed on `App.*`, `Log.*`, `Clipboard.*` and managed components (`<WebSocket>`, `<EventSource>`). | `dom-api-isolation.md` |
| Centralized HTTP | All traffic goes through one gate (`DataSource`, `APICall`, `App.fetch()`) that adds CSRF and transaction headers and enforces an origin allowlist. Raw `fetch`, XHR and sockets are unreachable. | `http-centralization.md` |
| XSS protection | Values always go through React's escaping; DOM APIs that would bypass it are blocked. | `xss-protection.md` |
| UDC sandbox | A user-defined component can declare its contract and allowed primitives, be marked trusted or untrusted, ship a manifest, and be audited from the CLI. | `udc-sandbox.md` |

**3. Runtime behavior: runtime services that compiled code calls into.**

| Guarantee | What it does | Source |
|-----------|--------------|--------|
| Fetch lifecycle | Requests are deduplicated, cached and cancelled when stale; no race conditions, no `AbortController` in markup. | `fetch-lifecycle.md` |
| Cooperative concurrency | Every handler gets a cancellation token; policies decide what happens when handlers stack up; hung handlers time out. | `cooperative-concurrency.md` |
| Concurrent-state determinism | A happens-before contract for handlers, writes and renders; an optional FIFO scheduler; replay of a captured trace to detect divergence. | `concurrent-state-determinism.md` |
| Managed lifecycle vocabulary | `onMount`, `onUnmount` and `onError` on every component, plus `<Lifecycle>` and `onBeforeDispose`. | `managed-lifecycle-vocabulary.md` |
| Structured exception model | Every error becomes an `AppError` (`code`, `category`, `retryable`, `correlationId`); `<App onError>`, `<RetryPolicy>`, `<Fallback>`. | `structured-exception-model.md` |
| Forms validation discipline | A named validator registry, cross-field validators, server 422 responses mapped to field errors, a double-submit guard. | `forms-validation-discipline.md` |
| Defended routing | Typed and validated route and query parameters declared on `<Page>`; bad URLs rejected before rendering; navigation guards. | `defended-routing.md` |
| Internationalization foundations | Locale resolver, bundle store, ICU MessageFormat, `Intl` formatters, an RTL contract; framework strings are translated too. | `i18n-foundations.md` |
| Enforced accessibility | Generates ARIA attributes where possible; asks for intent (labels, names) where only the author knows it; keyboard and contrast checks. | `enforced-accessibility.md` |

**4. Observability: instrumentation the compiler can generate.**

| Guarantee | What it does | Source |
|-----------|--------------|--------|
| Observability substrate | One structured trace of state changes, navigation, API calls and sandbox events; drives the Inspector. | `observability-substrate.md` |
| Audit-grade observability | The same stream with PII redaction, sampling and retention, W3C Trace Context, and OTLP export. | `audit-grade-observability.md` |

With compilation, tracing can be emitted only when it's enabled (a
development build, or a production build with auditing), so it costs
nothing otherwise. Source maps (requirement 3) let traces point at markup
lines.

**Open question:** do we keep all of Managed React, or only some groups?
Group 2, the sandbox, is the most expensive to rebuild on compiled code. It
is also the part that most distinguishes the framework.

## What we change

| XMLUI today | Problem | Direction |
|-------------|---------|-----------|
| Layout model (`website/content/docs/pages/layout.md`) | The concepts aren't clear enough. | Redesign: a small, explicit set of layout primitives and rules (design area 6). |
| Expressions are interpreted from an AST and re-evaluated through runtime dependency tracking and change detection (`.ai/xmlui/expression-eval.md`, `.ai/xmlui/container-state.md`) | Slow, and hard to reason about. | Compile expressions and handlers to JS. The compiler knows each binding's dependencies and emits the exact update code for each change. |
| The component tree is parsed at startup | Slow startup. | Parse and compile once, either at build time or at first load with caching. |

Note: XMLUI has itself started moving toward compilation (a script compiler,
source maps and strict compilation mode); see `.plan/retire-the-interpreter.md`,
`.plan/strict-compilation-mode.md` and `.plan/source-maps-for-compiled-scripts.md`.
Those plans are worth reading for the pitfalls they found, especially that
*the interpreter is the spec*. We need a written semantics and a conformance
suite from the start.

## Delivery modes (requirements)

1. **Standalone:** one HTML file plus one JS file. Markup files are fetched,
   parsed and compiled in the browser on first load. Compiled output can
   optionally be cached in `localStorage`. The engine watches markup files
   for changes.
2. **Build time:** markup is compiled during the build. The shipped app does
   no parsing or compiling at all.
3. **Source maps:** compiled code maps back to the original markup and
   scripts, so authors can debug their markup in browser devtools.
4. **Static generation:** generate static HTML that shows the app before the
   engine has loaded. The engine then takes over that HTML.

## Ecosystem requirement

5. **Wrap existing React components.** Any existing React component can be
   made available in markup with a small, declarative wrapper. Once wrapped,
   it behaves like a built-in component: it receives props, raises events,
   accepts templates, takes part in theming, and gets behaviors.

## Implementation roadmap

The framework is built in small proof-of-concept steps, each with its own
tests: see [poc-steps.md](poc-steps.md).

## Design areas (worked through in order)

Each area is settled before the next one starts. Later areas may reopen
earlier ones if they expose a problem.

1. **Rendering foundation.** What compiled code targets. **Decided: React**
   (see below). Still open: how compiled reactivity drives React. *(current)*
2. **Compilation pipeline.** Stages from markup to JS module, the
   intermediate representation, one compiler shared by browser and build
   tool, and where source maps are produced.
3. **Scripting language.** A written spec of the JS subset, sync versus async
   semantics and how they compile, the sandbox, and the conformance suite.
4. **Reactivity model.** Reactive variables, derived values, context
   variables (`$item`, `$event`, …), and dependency analysis at compile time.
5. **Component model.** Built-in components, user-defined components (the
   centerpiece), wrapped React components, slots and templates, events,
   methods, and behaviors, all under one metadata contract.
6. **Layout model.** The redesign. The App shell part is in progress (see
   below).
7. **Theming.** Themes, tones, derived tokens, and per-component variables.
   Decide how much of this happens at compile time.
8. **Delivery modes.** Standalone loader, caching and file watching;
   build-tool integration; static generation and takeover.
9. **Tooling and verification.** Test strategy, devtools, and language
   server (later).

---

## Area 1: Rendering foundation

### Decision: React

Compiled output targets React. The deciding reason is requirement 5:
existing React components must be usable from markup with a thin wrapper,
and we don't want to rebuild accessible primitives such as menus, popovers
and selects. React also brings server rendering and hydration
(`renderToString` / `hydrateRoot`), which requirement 4 needs.

Rejected: our own fine-grained runtime, Solid, and Lit. Each would cut us off
from the React component ecosystem.

**Consequence:** "no change detection" can't mean "no React reconciliation".
It means our layer never interprets expressions or diffs state to find out
what changed. The compiler knows each binding's dependencies, so a change
re-renders exactly the React components that read the changed value, and
React reconciles only those components. Wrapped third-party components
receive ordinary props and don't need to know about our reactivity.

### React version: 19

Mantine 9 reportedly requires React 19.2+ (⚠ verify against Mantine's
peer dependencies). Most components written for React 18.3 run unchanged on
React 19. The breaking changes listed in the React 19 upgrade guide
(https://react.dev/blog/2024/04/25/react-19-upgrade-guide) only affect
components that use legacy APIs:

- `defaultProps` on function components is silently ignored. The default
  values disappear, which is the most common runtime break.
- `propTypes`, legacy context (`contextTypes`), string refs, `createFactory`,
  `findDOMNode` and `ReactDOM.render`/`hydrate` are removed.
- Reading `element.ref` is deprecated (`ref` is now a regular prop).
- TypeScript type changes (for example, `useRef` requires an argument, and
  the global `JSX` namespace is gone) can break type-checking of older
  `.d.ts` files, but not the runtime.
- Packages whose `peerDependencies` say `"react": "^18"` fail `npm install`
  (ERESOLVE) until updated. Workaround: `overrides` in `package.json`.

Our own consequences:

1. Wrapping a third-party component includes a React 19 compatibility
   check: test it, and flag the components that need a patch or shim.
2. **React 19 no longer ships UMD builds.** Our standalone bundle must
   include React. Extension bundles must use the engine's single React
   instance, which the engine exposes for them, and must never bundle their
   own copy, because two React copies on one page break hooks.

Sources: `.ai/xmlui/wrapcomponent.md`, `xmlui/src/components-core/wrapComponent.tsx`,
`website/content/docs/pages/wrap-component/*.md`, `packages/xmlui-tiptap-editor/src/`.

**The pieces**

- **Metadata** (`createMetadata`) declares props with `valueType`, events,
  APIs (methods), `defaultAriaLabel` and template context variables. It is
  also used for documentation and the language server.
- **`wrapComponent(name, ReactComponent, metadata, config?)`** returns a
  renderer. The config handles only the exceptions:
  - `rename`: change a prop name, e.g. `minValue` becomes `min`.
  - `exclude`: don't forward a prop.
  - `events`: map event names, by default `click` becomes `onClick`.
  - `callbacks`: pass a synchronous function prop.
  - `templates`: a markup child becomes a static React node.
  - `renderers`: a markup template becomes a render-prop function whose
    arguments become context variables, e.g. `optionTemplate(item)` gives `$item`.
  - `stateful`: a controlled-value contract using `value`, `initialValue`
    and `updateState`.
  - `exposeRegisterApi`: the component registers methods callable from markup.
  - `captureNativeEvents`: library events are traced.
  - `customRender`: an escape hatch.
- **`wrapCompound`** is a variant whose render component sees a plain React
  contract (`value`, `onChange(v)`, `registerApi(api)`), so the component
  needs no XMLUI imports. It also has `parseInitialValue` and
  `formatExternalValue` hooks.
- **Forwarding by default.** Props that aren't handled specially pass
  straight through, so a library's new props work immediately. A blocked
  list (`id`, `style`, layout props, `bindTo`, …) is kept for the framework.
- **Theme bridging** comes in three strategies: map tokens to the library's
  CSS variables in SCSS, inject runtime styles via `useTheme()`, or merge
  tokens into JS option objects (`wrap-component/_overview.md`, Level 3).
- **Packaging.** An extension is a package whose `index.tsx` exports
  `{ namespace, components: [...] }`. `xmlui build-lib` builds a UMD bundle
  with React and xmlui left external, and the bundle registers itself when
  loaded by a `<script>` tag (`wrap-component/extension-packaging.md`).
- **Real size:** the TipTap wrapper is 78 lines, almost all metadata; the
  render component is 273 lines of plain React
  (`packages/xmlui-tiptap-editor/src/`).

**What to keep:** metadata as the single description of a component;
forwarding by default; config only for exceptions; templates with context
variables; the plain controlled-value contract (`value` / `onChange` /
`registerApi`); self-registering extension bundles; the three
theme-bridging strategies.

**What to improve.** Most of these problems exist because XMLUI works out
at runtime what a compiler could know ahead of time:

| XMLUI pain point | Cause | With compilation |
|------------------|-------|------------------|
| Props without `valueType` get the wrong value conversion (`wrapcomponent.md` "Critical" note) | Attribute values are strings converted at runtime | The compiler reads metadata and emits the correctly typed value, or reports a compile error. |
| Template context variables must be declared twice: renderer `contextVars` and metadata `childInjectedVars`, kept in sync by a CI drift test | Scope analysis and rendering use separate declarations | Declare once in the wrapper; the compiler uses it for scope analysis and code generation. |
| Two overlapping wrappers (`wrapComponent` vs `wrapCompound`), and `createComponentRenderer` is still needed for anything non-trivial | Different state-plumbing contracts | One wrapper primitive, with the plain controlled contract as the default. |
| `CallbackSync` / `MemoizedInner` exist to avoid stale closures and extra re-renders | Handlers are recreated on each evaluation | Compiled handlers are stable functions that read current values, so the problem doesn't arise. |
| No hooks allowed in `customRender` | It runs in renderer context, not as a React component | Make the escape hatch a real React component. |

### Open question for area 1: how compiled reactivity drives React

| Option | Mechanism | Trade-off |
|--------|-----------|-----------|
| **a. Signals, with a subscription per component** | Reactive state lives in signals outside React. Each compiled component subscribes, via `useSyncExternalStore`, to just the signals its bindings read. Derived values are computed signals. Handlers write signals directly. | A change re-renders only the subscribing components, with no prop diffing above them. Fits compile-time dependency analysis. Works with concurrent React and server rendering. We own the signal store. |
| **b. Plain React state** | Compile to idiomatic React: `useState` / `useMemo` / `useCallback`, with state lifted to the declaring component. | Simplest and "just React", but a change re-renders the declaring component's whole subtree unless everything is memoized. That brings back the cost we want to avoid. |
| **c. Signals that also update the DOM directly** | Like (a), but text and attribute bindings on our own components bypass React and write to the DOM. | Fastest for hot text, but creates two update paths. It conflicts with wrapped components and with hydration. It could be added later as an optimization of (a). |

Recommendation: **(a)**.

## Notes for area 5: candidate React component libraries

Not decided yet; these were researched in Nov 2026.

Selection criterion: **our theming system owns the styling.** A headless
library (behavior and accessibility, no styles) fits that directly. A styled
library brings its own theme system, which we would have to bridge to ours.
Simple elements (text, headings, stacks) don't need a library at all. They
sit on the startup and server-rendering hot path, so they should be our own
tiny components. A library earns its place on complex interactive pieces:
menus, select and combobox, dialogs, popovers, date pickers, tables and
drag-and-drop.

| Library | Kind | Notes |
|---------|------|-------|
| Base UI (`@base-ui/react`) | Headless | From the MUI team. v1 shipped Dec 2025, about 35 components, frequent releases since. Now shadcn/ui's default. Primary candidate. |
| React Aria Components (Adobe) | Headless | The deepest accessibility and i18n (locales, RTL, date and number handling); has Table, DatePicker, Tree and drag-and-drop. Releases monthly; Spectrum 2 is built on it. Candidate for what Base UI lacks, or the sole choice if accessibility and i18n come first. |
| Radix Primitives | Headless | What XMLUI uses (12 `@radix-ui/*` packages in `xmlui/package.json`). Widely used, but reports of slower maintenance, and shadcn/ui moved its default to Base UI. Not a first pick for a new project. |
| Mantine | Styled | CSS Modules plus CSS variables, no runtime CSS-in-JS, good server rendering, 100+ components. The best styled option if we want a look out of the box. |
| MUI | Styled | Largest ecosystem, but uses Emotion (runtime CSS-in-JS) and a heavy theme system. Poor fit. |

shadcn/ui is not a dependency (its code is copied into a project and uses
Tailwind). It is still a useful reference for how to style Base UI or Radix.

**Decided: Mantine is the base component library.** Its styling is exposed
to authors **through XMLUI's theming mechanism** (theme definitions, tones and
`property-part-Component-variant--state` theme variables), not through
Mantine's own theme API. Mantine is an implementation detail behind our
theme variables.

- Our compiled theme drives Mantine's `--mantine-*` CSS variables. Mantine's
  Styles API (named inner parts, `classNames` per part, `theme.components`
  with `extend`) is where per-component, per-part theme variables are
  mapped. This is worked out in area 7.
- Radix or Base UI only for primitives Mantine lacks, chosen case by case.
  We don't add a second library for things Mantine already has, such as
  dialogs. That would mean two systems for portals, focus trapping, scroll
  locking, z-index and outside-click handling.

### List and Table (virtualized)

**Requirement: at least feature parity with XMLUI's `List` and `Table`.**
Sources: `website/content/docs/reference/components/List.md`, `Table.md`,
`Column.md`.

- *Both:*
  - Virtualization with dynamic row heights, a render cache
    (`renderCache`, `renderCacheSize`) and an overscan buffer (`virtualBufferSize`).
  - `idKey`.
  - Single and multi selection with checkboxes, `rowUnselectablePredicate`,
    `initiallySelected` and `syncWithVar`.
  - Clipboard and keyboard actions: copy, cut, paste, delete, select all
    and `keyBindings`.
  - Pagination.
  - Loading state (`loading`, `loadingDelay`) and an empty-state template.
  - Events: `scroll`, `visibleRangeDidChange` and `selectionDidChange`.
  - Methods: `scrollToTop`, `scrollToBottom`, `scrollToIndex`, `scrollToId`,
    `selectAll`, `selectId`, `getSelectedIds`, `getVisibleRange` and
    `preserveStateOnNextDataRefresh`.
  - `dataRefreshMode`.
- *List only:*
  - Item templates.
  - `groupBy` with group header and footer templates, `availableGroups`,
    `defaultGroups`, expand and collapse, and `hideEmptyGroups`.
  - `orderBy` and `limit`.
  - `scrollAnchor="bottom"` (chat-style lists).
  - Copy, cut, paste and delete actions.
- *Table only:*
  - Columns are declared in markup, or inferred from the data
    (`columnInference`, `columnSizing`).
  - Typed cells (dates, numbers, currency, links, enums, JSON).
  - Editable typed cells (checkbox, switch, color) with
    `willChange`/`didChange`.
  - Arbitrary markup as cell content.
  - Sorting: `sortBy`, `sortDirection`, `defaultSortDirection`, and
    `willSort`, which can cancel a sort.
  - Column resizing, star sizing, and pinning left/right (RTL-aware).
  - Header options (`hideHeader`, `alwaysShowHeader`), `striped`, and
    highlighting the hovered column.
  - Row events: click, double-click, enter and leave.
  - A page-size selector.
  - Parts and theme variables.

**Hard constraints from our architecture:**

1. Cells and items are arbitrary compiled markup, which means React DOM
   rendering. That rules out canvas grids such as Glide Data Grid.
2. Styling must come from our theme variables. That favors headless
   libraries.
3. Static generation must be able to render an initial window of rows.

**Candidates (researched Nov 2026):**

| Option | Fit | Verdict |
|--------|-----|---------|
| **TanStack Table v9** (headless; stable Aug 2026) + a headless virtualizer, rendered with Mantine primitives (`Table`, `Checkbox`, `Pagination`, …) | Total control over markup, parts and theme variables. XMLUI already proves this combination reaches the full feature set (`@tanstack/react-table` + `virtua` in `xmlui/package.json`). Cost: we build the UI layer. | **Recommended.** |
| mantine-react-table | TanStack Table + TanStack Virtual + Mantine with a huge feature set, but upstream targets Mantine 7 / TanStack Table v8. Mantine 8/9 support exists only in an unofficial fork (`mantine-react-table-open`). | Rejected: maintenance risk. |
| mantine-datatable | Maintained (9.4, Mantine 9), but no virtualization (open discussion #311). | Rejected: fails virtualization. |
| AG Grid Community (MIT) | Nearly every Table feature, React cell renderers, and a Theming API built on CSS custom properties. But it's heavy, has its own DOM and accessibility model, renders on the client only, and its row grouping is Enterprise (paid). | Fallback if building the Table UI proves too costly. |
| react-data-grid (adazzle) | Has been in 7.0 betas for years. | Rejected. |

**Virtualizer (shared by List and Table):** still open, to be decided by a
prototype.

- `virtua`: what XMLUI uses. Small, with mature reverse scrolling, prepending
  (`shift`) and dynamic sizes.
- TanStack Virtual: active, with a performance release in May 2026 and a
  chat/reverse-scroll guide, and it pairs naturally with TanStack Table.
- react-virtuoso: the most complete out of the box (grouped lists,
  `followOutput`), but more opinionated, and its maintenance status is
  unverified.

The prototype should test the hard cases: `scrollAnchor="bottom"` with
prepending, dynamic heights, the render cache, iOS Safari, and rendering
an initial window on the server.

## Component implementation map

Every XMLUI component (`website/content/docs/reference/components/*.md`,
112 files) mapped to a suggested implementation. This is a proposal to
review, not a decision.

**Legend**

- **Own** means a small component of ours, styled only by our theme
  variables. It's used where a library adds nothing, or where the component
  is on the startup and server-rendering hot path.
- **Runtime** means the compiler or runtime handles it; there is no UI library.
- ⚠ means the API or maintenance status hasn't been verified yet. Check
  before relying on it.
- "XMLUI uses" is from `xmlui/package.json` dependencies.

### App shell, routing, navigation

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| App | Own shell (CSS grid) or Mantine `AppShell`; `MantineProvider` inside | See "Area 6: the App shell" |
| AppHeader | Own, or `AppShell.Header`; Mantine `Burger` for the drawer toggle | |
| NavPanel | `AppShell.Navbar` or own; Mantine `Drawer` below the breakpoint; `ScrollArea` | |
| NavLink | Mantine `NavLink` rendered as a router link (`component={Link}`) | Has an active state, icons and nesting |
| NavGroup | Mantine `NavLink` with children (side nav); Mantine `Menu` (top or header nav) | |
| NavPanelCollapseButton | Mantine `ActionIcon` / `Burger` | |
| Footer | Own, or `AppShell.Footer` | |
| Logo | Own, on Mantine `Image` | |
| Pages, Page, Redirect | React Router (`Routes`/`Route`/`Navigate`) | XMLUI uses `react-router-dom` |
| PageMetaTitle | React 19's built-in `<title>` hoisting | Replaces `react-helmet-async`, which XMLUI uses |
| TableOfContents | Mantine `TableOfContents` ⚠, or own with Mantine's `useScrollSpy` | |
| Bookmark | Own (an anchor with an `id`) | |
| SkipLink | Own; Mantine `VisuallyHidden` until focused | |

### Layout and containers

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| Stack, HStack, VStack, CHStack, CVStack | Own | Hot path; semantics come from the layout redesign (area 6). Mantine `Stack`/`Group`/`Flex` have different sizing rules (no star sizing). |
| FlowLayout | Own (flex-wrap), or Mantine `SimpleGrid` for uniform columns | |
| SpaceFiller | Own | Layout primitive |
| Card | Mantine `Card` / `Paper` | |
| ScrollViewer | Mantine `ScrollArea` | Replaces `overlayscrollbars`, which XMLUI uses |
| Splitter, HSplitter, VSplitter | `react-resizable-panels` ⚠ | Mantine has no splitter |
| StickyBox, StickySection | Own, with CSS `position: sticky` | Replaces `react-sticky-el`, which XMLUI uses |
| ResponsiveBar | Own (`ResizeObserver` measures overflow; overflowing items go into a Mantine `Menu`) | No library equivalent |
| TileGrid | Own, on the shared virtualizer (grid / lanes mode) | |
| ContentSeparator | Mantine `Divider` | |
| Tabs, TabItem | Mantine `Tabs` | |
| ExpandableItem | Mantine `Accordion` (single item), or `Collapse` with a header button | |
| Stepper, Step | Mantine `Stepper` | |

### Text and display

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| Text | Own; variants use Mantine `Code`, `Kbd`, `Mark`, `Highlight` | Hot path |
| Heading, H1–H6 | Mantine `Title` (`order` 1–6), or own | |
| Markdown | `react-markdown` + `remark-gfm` (XMLUI uses both); code blocks via `@mantine/code-highlight` ⚠ | |
| Link | Mantine `Anchor` rendered as a router link | |
| Icon | Own registry; default icon set `@tabler/icons-react` | Tabler is Mantine's customary icon set |
| Image | Mantine `Image` | |
| Avatar | Mantine `Avatar` | Has initials fallback |
| Badge | Mantine `Badge` | |
| ProgressBar | Mantine `Progress` | |
| Spinner | Mantine `Loader` | |
| NoResult | Own | Mantine has no empty-state component |
| Value | Own (`Intl` formatting) | |
| QRCode | `react-qr-code` (XMLUI uses) | |
| IFrame | Own (native `<iframe>`) | |
| MediaPlayer | Own (native `<video>`/`<audio>`) | |
| PointerLayer | Own, with `perfect-freehand` (XMLUI uses) | |
| Tooltip | Mantine `Tooltip` | Also backs the tooltip behavior |
| Theme | Own (scoped theme-variable CSS) | Area 7 |
| ToneSwitch, ToneChangerButton | Mantine `Switch` / `ActionIcon`, bridged from our tone to Mantine's color scheme | `ToneChangerButton` is deprecated in XMLUI; drop it |
| I18n, Locale | Own runtime on `intl-messageformat` (ICU) ⚠; Mantine `DatesProvider` for date locale | |

### Inputs

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| Button | Mantine `Button` / `ActionIcon` (icon-only) | |
| TextBox | Mantine `TextInput` | |
| PasswordInput | Mantine `PasswordInput` | |
| TextArea | Mantine `Textarea` (`autosize`) | Replaces `react-textarea-autosize`, which XMLUI uses |
| NumberBox | Mantine `NumberInput` | |
| Checkbox | Mantine `Checkbox` | |
| Switch | Mantine `Switch` | |
| RadioGroup (+ Option) | Mantine `Radio.Group` + `Radio` | |
| Select (+ Option) | Mantine `Select` / `MultiSelect`; custom option templates via Mantine `Combobox` primitives | |
| AutoComplete | Mantine `Combobox` primitives (searchable, multi, creatable) | Mantine's own `Autocomplete` accepts free text, which doesn't match XMLUI's semantics |
| Slider | Mantine `Slider` / `RangeSlider` | |
| ColorPicker | Mantine `ColorInput` / `ColorPicker` | |
| FileInput | Mantine `FileInput` | |
| FileUploadDropZone | `@mantine/dropzone` | Built on `react-dropzone` (XMLUI uses it) |
| DateInput | `@mantine/dates` `DateInput` / `DatePickerInput` (`type="range"`) | |
| DatePicker | `@mantine/dates` `DatePicker` (inline calendar) | Replaces `react-day-picker`, which XMLUI uses |
| TimeInput | `@mantine/dates` `TimeInput` / `TimePicker` ⚠ | |

### Forms

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| Form | Own, on compiled reactivity plus the form-binding and validation behaviors | `@mantine/form` doesn't fit XMLUI's binding model |
| FormItem | Own; uses Mantine's `Input.Wrapper` for label, description and error | |
| FormSegment | Own; Mantine `Fieldset` for the visual group | |

### Overlays and menus

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| ModalDialog | Mantine `Modal` | |
| Drawer | Mantine `Drawer` | |
| DropdownMenu, MenuItem, MenuSeparator | Mantine `Menu`, `Menu.Item`, `Menu.Divider` | |
| SubMenuItem | Mantine `Menu.Sub` ⚠ | Submenus are a recent Mantine addition |
| ContextMenu | Mantine `Menu` positioned at the pointer (controlled, virtual anchor), or `mantine-contextmenu` ⚠ | |
| FocusScope | Mantine `FocusTrap` | |
| (global) `toast()` | `@mantine/notifications` | Replaces `react-hot-toast`, which XMLUI uses |
| (global) `confirm()` | Mantine `Modal` (own imperative API) | |

### Data display

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| List | Own, on the shared virtualizer (`virtua` or TanStack Virtual) | See "List and Table" |
| Table, Column | TanStack Table v9 + the virtualizer, rendered with Mantine `Table`, `Checkbox`, `Pagination` | See "List and Table" |
| Items | Own (plain iteration, no virtualization) | |
| Tree | Own, on the virtualizer; Mantine `Tree` / `useTree` ⚠ is possibly fine for small, non-virtualized data | Needs virtualization for parity |
| Pagination | Mantine `Pagination` | |
| (extension) charts | `@mantine/charts` (built on Recharts) | XMLUI uses `recharts` |

### Non-visual, data and runtime constructs

| XMLUI | Suggested implementation | Notes |
|-------|--------------------------|-------|
| DataSource, APICall | `@tanstack/react-query` (XMLUI uses it) | |
| Fallback | Own, with React error boundaries plus loader state | |
| ChangeListener | Runtime (a compiled effect on its dependencies) | |
| Timer, Queue | Runtime | |
| MessageListener | Runtime (`window` message listener) | |
| AppState | Runtime | Marked with a warning in XMLUI's docs; reconsider whether to keep it |
| Fragment, Slot | Runtime / compiler | |
| IncludeMarkup | Runtime: fetch, compile and cache (the standalone pipeline) | |
| LiveRegion | Own (`aria-live`) | |

**Net effect on dependencies compared with XMLUI:**

- **Mantine replaces:** Radix, Ark UI, `react-day-picker`, `react-hot-toast`,
  `overlayscrollbars`, `react-textarea-autosize`, `react-sticky-el` and
  `react-popper`/`@popperjs`.
- **Unchanged:** `react-query`, React Router, TanStack Table, a virtualizer,
  `react-markdown`, `react-qr-code`, `perfect-freehand` and `react-dropzone`
  (via `@mantine/dropzone`).
- **New:** `react-resizable-panels` and `@tabler/icons-react`.

## Area 6 (part): the App shell

**Keep:** `App` as the hub: the root of the app, the owner of routing
(`Pages`/`Page`), navigation (`NavPanel`/`NavLink`), theme and tone, locale
and direction, and app-level events (`willNavigate`, `didNavigate`, `ready`,
`keyDown`, …). Source: `website/content/docs/reference/components/App.md`.

**Rethink:** the `layout` property.

### Why XMLUI's `layout` is confusing

Sources: `App.md` § `layout`, `scrollWholePage`, `fitContent`;
`xmlui/src/components/App/AppReact.tsx` (`layoutConfigs`, lines ~873–945;
nav visibility, lines ~326–332).

`layout` takes 8 enum values (`vertical`, `vertical-sticky`,
`vertical-full-header`, `horizontal`, `horizontal-sticky`, `condensed`
(the default), `condensed-sticky`, `desktop`). Each value secretly bundles
several independent decisions, and not every combination exists:

| Hidden dimension | Where it lives today |
|------------------|----------------------|
| Nav placement: side column, bar under the header, merged into the header, or none | Encoded in the layout name; `desktop` silently has no nav position |
| Does the header span the full width, or only the content column? | `vertical` vs `vertical-full-header` |
| What sticks: header, nav, footer | The `-sticky` suffix (header and nav together), **plus** a separate `Footer sticky` prop |
| Which element scrolls: the page or the content area | `scrollWholePage`, **plus** `fitContent`, **plus** `desktop`, **plus** an internal `containerScrollRef` flag, with override rules between them |
| Max content width and padding | Theme variables; `desktop` silently ignores them |
| Where the logo shows | Silently hidden from the header in `vertical` and `vertical-sticky` |
| Small screens | An implicit rule: the nav moves into a drawer only if a header exists, except that condensed layouts always use the header |
| Collapsing the nav to icons | Works only in `vertical-full-header` |

So an author can't predict what a layout name does without reading the
docs or the source, and can't ask for a combination that has no name.

### Proposal: each region owns its own behavior

Split the bundle into independent settings, and put each setting on the
region it affects. `App` keeps only truly global concerns.

```xml
<App scroll="page">
  <AppHeader sticky="true" span="full" />
  <NavPanel placement="side" drawerBelow="md" collapsible="true" />
  <Pages> … </Pages>
  <Footer sticky="true" />
</App>
```

| Setting | On | Values | Replaces |
|---------|----|--------|----------|
| `placement` | `NavPanel` | `side` · `top` (bar under the header) · `header` (merged into the header). No `NavPanel` means no nav. | The nav part of the layout names |
| `span` | `AppHeader` | `full` (header above the side nav) · `content` (header beside the side nav). Only meaningful with `placement="side"`. | `vertical` vs `vertical-full-header` |
| `sticky` | `AppHeader`, `NavPanel`, `Footer` (each independently) | boolean | The `-sticky` suffix and `Footer sticky` |
| `scroll` | `App` | `page` (the window scrolls) · `content` (only the main area scrolls; header, nav and footer stay fixed) · `none` (the app sizes to its content, for embedding) | `scrollWholePage`, `fitContent`, `desktop`, `containerScrollRef` |
| `drawerBelow` | `NavPanel` | Breakpoint name or `never`. Below it, the nav moves into a drawer and a toggle button appears in the header. | The implicit small-screen rule |
| `collapsible` | `NavPanel` | boolean (collapse to icons). Works for every side placement. | Only `vertical-full-header` |
| Content width and padding | Theme variables only (`maxWidth-content-App`, …) | | `desktop`'s silent override |

With `sticky` on each region, `scroll="content"` is the "desktop app"
shape. Nothing about the shell is implicit; every behavior comes from a
visible attribute or a documented default.

**Compile-time help:** the compiler validates combinations and reports
clear errors. For example, `span` without a side nav, or `sticky` with
`scroll="none"`.

**Optional presets as shorthand.** `App preset="sidebar"` (or `topbar`,
`condensed`, `desktop`) expands at compile time to a documented set of the
settings above. Any explicit attribute overrides the preset. A preset is
sugar, never a hidden mode.

### Coverage: each XMLUI layout expressed with the new settings

| XMLUI `layout` | New settings |
|----------------|--------------|
| `vertical` | nav `side`; header `span="content"`; `scroll="page"`; nothing sticky |
| `vertical-sticky` | same as above, with header, nav and footer sticky |
| `vertical-full-header` | nav `side`; header `span="full"`; header, nav and footer sticky |
| `horizontal` | nav `top`; `scroll="page"` |
| `horizontal-sticky` | nav `top`; header, nav and footer sticky |
| `condensed` | nav `header` |
| `condensed-sticky` | nav `header`; header sticky |
| `desktop` | no nav; `scroll="content"`; content width `none` and padding `0` via theme variables |

New combinations become possible with no extra design: for example a
condensed header with a scrolling content area, or a collapsible side nav
under a full-width header.

**Implementation note:** Mantine's `AppShell` models nearly the same
dimensions:

- `navbar.breakpoint` and `collapsed.mobile`/`collapsed.desktop` match
  `drawerBelow` and `collapsible`.
- `layout="alt"` matches `span="content"`.
- `header.offset` matches header behavior.

It is fixed-position based, though. Whether it can do `scroll="page"` with
non-sticky regions needs checking; if it can't, we implement the shell as a
small CSS grid of our own and use Mantine only for the drawer and the burger
button.

### Open questions (App shell)

1. Region-owned settings (as proposed), or all settings as attributes on `App`?
2. Do we want presets at all?
3. Logo: keep the automatic placement ("the logo shows in the top-left
   region"), or make authors place an explicit `<AppLogo/>` in the header or
   nav?
4. Is `top` vs `header` (a separate bar vs merged into the header) a
   distinction worth keeping?

## Open questions

Tracked per design area as we reach it.
