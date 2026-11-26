# Code structure

> **Cornerstone document.** Describes the repository as it is now. It is
> updated at the end of every proof-of-concept step.
>
> **Last updated:** step 29 (the virtualized List).

## What this repository is

**gluefuil** (short name **gfui**) is a re-invention of the XMLUI framework:
XML markup (`.gui` files, using XMLUI's markup syntax) plus a JavaScript subset,
**compiled** to JavaScript that renders with React (and Mantine for most
components). The design rationale is in
[`../plan/architecture.md`](../plan/architecture.md); the build order is in
[`../plan/poc-steps.md`](../plan/poc-steps.md).

Current state:

- The workspace and the test infrastructure exist.
- The compiler has its two parsing stages: the **markup parser**
  ([markup-parser.md](markup-parser.md)) and the **script parser** for
  expressions, handlers and code-behind ([script-parser.md](script-parser.md)).
- The compiler compiles **bindings** to sandboxed JavaScript, and the runtime
  loads and runs them ([codegen.md](codegen.md)).
- The runtime has the **reactivity core**: a signal store and one
  `useSyncExternalStore` subscription per component ([reactivity.md](reactivity.md)).
- **The pipeline runs end to end:** a `.gui` document compiles to one
  JavaScript module that renders with the runtime and four minimal built-in
  components (`App`, `Text`, `Button`, `Stack`) ([modules.md](modules.md)).
- **Variables and handlers** work: `var.*`, `<variable>`, `global.*`,
  `<global>` (follow until assigned), `on*` and `<event>` handlers with
  deep writes and array mutations (copy-on-write on frozen values).
  Globals (the app root's `global.*` and `Globals.xs`) reach every file and
  user component, known at compile time ([scoping.md § Globals](scoping.md#globals)).
- **Handlers are async** with implicit await, segment batching that cannot
  freeze the store, `$cancel`, handler policies, timeouts and unmount
  cancellation ([async-handlers.md](async-handlers.md)).
- **Component IDs** expose APIs to the whole file (`box.value`,
  `box.setValue()`), and name resolution is complete for variables, IDs,
  app globals and context variables ([scoping.md](scoping.md)). `TextBox`
  is the first component with an API.
- **Source maps:** every compiled module maps back to its `.gui` file
  (expressions, statements, handlers, elements), on both the Vite and the
  standalone path ([source-maps.md](source-maps.md)).
- **Conditional rendering and templates:** `when`/`when-*`,
  `onMount`/`onUnmount`, template properties and `Items` with
  component-injected context variables
  ([visibility-templates.md](visibility-templates.md)).
- **Standalone mode:** `gfui.js` (one file, React included) fetches,
  compiles, caches and watches `Main.gui` in the browser
  ([standalone.md](standalone.md)).
- **Build-time compilation:** `@gluefuil/vite-plugin` compiles `.gui`
  files in Vite. A production build contains no compiler and needs no
  eval: it runs under `script-src 'self'` ([build-time.md](build-time.md)).
- **Static generation:** a build can prerender the app into `index.html`;
  `mountApp` takes it over with hydration, reusing the DOM. A responsive
  `When` hydrates at the prerender breakpoint and switches afterwards
  ([ssg.md](ssg.md)).
- **User-defined components:** `<Component>` in component files or inline,
  with `$props`, events, methods and `$self`, default and named slots with
  slot props, complete scope isolation, and code-behind (`.gui.xs`), in
  every delivery mode ([user-components.md](user-components.md)).
- **Contracts:** one metadata format describes every component (built-ins
  declare it, user components get it derived). Markup is checked for
  unknown props, events and API members (with "did you mean"), missing
  required props, wrong literal types and enums, and deprecations
  ([contracts.md](contracts.md)).
- **Theming:** theme definitions (with `extends`, tones, derived tokens and
  `$refs`) compile to `--gfui-*` CSS variables. The built-ins are styled
  through them, `<Theme>` scopes them, and the app globals switch the tone
  and theme ([theming.md](theming.md)).
- **Wrapped React components:** `wrapComponent` makes React components
  usable from markup. `Button` and the inputs are
  Mantine's, styled only through gfui theme variables, and `Text` variants
  and `Heading`/`H1`–`H6` are our own ([mantine.md](mantine.md)).
- **Routing:** `Pages`/`Page`/`Link`, `navigate()` and
  `$pathname`/`$routeParams`/`$queryParams`, on our own small router (hash
  routing by default). `App onWillNavigate` guards every navigation (back
  and forward too, holding the old page while it decides) and
  `onDidNavigate` follows them. With browser routing, the build prerenders
  every static route into its own file ([routing.md](routing.md),
  [ssg.md](ssg.md#prerendered-routes)). `navigate(-1)` moves through the
  history under the same guard, `navigate(to, { target: "_blank" })` opens
  a new tab, and an app under a sub-path takes its basename from Vite's
  `base`.
- **Forms:** `Form` edits a copy of `data`; any input with a value API binds
  a path of it with `bindTo` (the `formBinding` and `validation` behaviors;
  no `FormItem`). XMLUI's rules with severities, late error display,
  `onValidate` (async too), `$data`, dirty tracking, reset, and a submit
  that validates first ([forms.md](forms.md)). `submitUrl` (or `data` as a
  URL, loaded once) through the data layer; the server's validation errors
  (RFC 7807, Spring, Laravel, XMLUI's) on the inputs; `cancel()`.
- **The App shell:** `AppHeader`, `NavPanel` and `Footer` around the
  content, placed by a few literal settings (`scroll`, `sticky`,
  `placement`, `fullHeight`, `drawerBelow`, `collapsible`) instead of
  XMLUI's `layout`. The compiler passes the regions to `App`; CSS does the
  layout, including the drawer at small widths. `NavLink`, `NavGroup`,
  `NavPanelCollapseButton` ([app-shell.md](app-shell.md)).
- **Layout:** `Stack` with the aliases `VStack`, `HStack`, `CVStack` and
  `CHStack`, wrapping (`wrapContent`, which replaces `FlowLayout`),
  `SpaceFiller`, star sizes, and layout props (`width`, `padding`,
  `backgroundColor`, …) on every visual component. Gaps and paddings are
  automatic: a four-level ladder by nesting, orientation, surfaces and
  screen size, all multiples of `space-base` ([layout.md](layout.md)).
- **Data:** `DataSource` and `APICall` on one HTTP gate with structured
  errors, retries, timeouts and cancellation (tied to the calling handler),
  over `@tanstack/query-core` bridged to signals; `Items data="/api/…"`
  ([data.md](data.md)). A **mock backend** the app can't tell from a server
  (`@gluefuil/mock-backend`: a service worker, dev-server middleware or a
  test server answer real `fetch` requests; faults, holds and a request log
  under `/__mock`) ([mock-backend.md](mock-backend.md)).
- **Inputs (step 24):** `TextBox` (types, adornments, password),
  `PasswordInput`, `TextArea` (auto size, Enter submits, Escape resets),
  `NumberBox` (a number value, limits), `Checkbox`, `Switch`, `RadioGroup`
  with `Option` children, `Slider` (a value or a range), `ColorPicker`, all
  on Mantine through `wrapComponent`. Each has `readOnly`, `autoFocus`,
  `validationStatus`, focus events, and binds to a `Form` with `bindTo`
  ([inputs.md](inputs.md)).
- **Choice inputs (step 25):** `Select` and `AutoComplete` on Mantine's
  Combobox: `Option` children (also from `Items`) compile to one reactive
  options array (`childrenAsOptions`, so the prerender shows the
  selection), or `data` with `valueField`/`labelField`; search by value,
  label and keywords, several values as pills, groups, templates, creatable
  options ([choice.md](choice.md)).
- **Date and time inputs (step 26):** `DateInput`, `TimeInput` and
  `DatePicker` (inline or a popup, ranges, presets) on `@mantine/dates`, in
  a lazy chunk; XMLUI's string values (a date in `dateFormat`, `HH:mm`) and
  `isoValue()` ([dates.md](dates.md)).
- **Structure (step 28):** `Tabs`/`TabItem` and `Stepper`/`Step` (their
  headers compiled to data, so they are prerendered, while the content keeps
  file-scoped IDs; E038), `ExpandableItem`, our own `Splitter` (`HSplitter`,
  `VSplitter` aliases; px/% sizes and limits, resize modes, keyboard),
  `ScrollViewer` (Mantine ScrollArea styles, fades), CSS-sticky `StickyBox`
  and `StickySection`, and `ResponsiveBar` (overflow into a menu, `$overflow`
  in a scope per child) ([structure.md](structure.md)).
- **The virtualized List (step 29):** `List` on TanStack Virtual: only the
  rows in view are mounted (dynamic heights, a render cache), in its own scroll
  box or its container's; `scrollAnchor="bottom"` follows new rows and keeps
  the view when rows are prepended; `orderBy`, `limit`, groups that fold;
  selection by mouse, keys and checkboxes (`selection.ts`, for Table too),
  `syncWithVar` (a variable's name, resolved at compile time: E039), keyboard
  actions; the first window prerendered and taken over ([list.md](list.md)).
- **Overlays and menus (step 27):** `ModalDialog` (opened by `open(...params)`
  with `$param` inside, or by `when`; a dirty guard; a Form inside closes it),
  `Drawer`, `DropdownMenu` with `MenuItem`, `SubMenuItem` and `MenuSeparator`
  (E037 outside a menu), `ContextMenu` (`openAt(ev, context)`, `$context`),
  `Tooltip` (the tooltip behavior too, with `tooltipOptions` and
  `tooltipMarkdown`), and the app globals `toast()` and `confirm()`, on Mantine
  and `@mantine/notifications`. They portal into an overlay layer of the App
  or the nearest Theme. Pointer handlers (`click`, `contextMenu`) receive a
  frozen pointer snapshot, and handlers of argument-free events declare no
  `$param`, so a dialog's shows through ([overlays.md](overlays.md)).
- **Display components (step 23):** `Icon` (XMLUI's names, drawn with
  Lucide; `registerIcon`), `Image`, `Avatar`, `Badge`, `ProgressBar`,
  `Spinner`, `ContentSeparator` (Mantine), and `Card` (a Stack that is a
  surface of the spacing ladder); `Text`, `Heading` and `Link` gained the
  overflow props, anchors, external URLs and their APIs. **`Markdown`** (GFM)
  is our own renderer in a lazy chunk: prerendered, and hydrated without
  touching the server HTML. Raw HTML passes an allowlist. `@{…}` in the nested
  text is compiled like any binding; runtime strings are never evaluated
  ([display.md](display.md)).
- **Behaviors:** `label`, `formBinding`, `validation`, `tooltip` and `variant` attach by trigger props,
  decided at compile time and compiled to `Bound` wrappers, on built-ins
  and user-defined components ([behaviors.md](behaviors.md)).

## Subsystem documents

| Document | Subsystem |
|----------|-----------|
| [markup-parser.md](markup-parser.md) | `packages/compiler/src/markup/` and `src/source/`: `.gui` markup text to a syntax tree with positions and diagnostics |
| [script-parser.md](script-parser.md) | `packages/compiler/src/script/`: gfui script (a JavaScript subset) to an ESTree-subset tree with file offsets; interpolated values |
| [reactivity.md](reactivity.md) | `packages/runtime/src/reactivity/`: signals, computed values, batching, the React hooks, the scope object |
| [modules.md](modules.md) | `packages/compiler/src/module/`, `packages/runtime/src/render/`, the built-in components: `.gui` document to a JavaScript module, and how it renders |
| [build-time.md](build-time.md) | `packages/vite-plugin`: the Vite plugin, its options and errors, what a production build contains |
| [routing.md](routing.md) | `runtime/src/render/router.ts`, `components/src/routing.tsx` |
| [app-shell.md](app-shell.md) | `components/src/shell.tsx`, `icons.tsx`, the shell CSS in `styles.ts`, `compiler/src/module/shell.ts`, `runtime/src/render/shell-state.ts` |
| [layout.md](layout.md) | `components/src/layout.tsx`, `layout-metadata.ts`, the `LAYOUT` CSS in `styles.ts`, the Stack family in `metadata.ts`, aliases, layout props and E031/E032 in the compiler |
| [data.md](data.md) | `runtime/src/data/`, `runtime/src/render/deferred.ts`, `components/src/data.tsx`; the compiler's `whenIsProp`, `deferred`, `code`, `nullishUnresolved`, `eventResults` |
| [mock-backend.md](mock-backend.md) | `packages/mock-backend`, the Vite plugin's `gfuiMockBackend` (`vite-plugin/src/mock.ts`), `test-apps/data` |
| [mantine.md](mantine.md) | `runtime/src/render/wrap.ts`, `components/src/mantine.tsx`, `text.tsx` |
| [dates.md](dates.md) | `components/src/date-format.ts`, `dates.tsx`, `dates-native.tsx` (lazy); `PropMetadata.exclusive` |
| [choice.md](choice.md) | `components/src/choice.tsx`; the compiler's options (`childrenAsOptions`); runtime `optionItems`, `OptionContent` |
| [inputs.md](inputs.md) | `components/src/inputs.tsx`, `layout-wrap.tsx`; `wrapComponent`'s `readOnly` and API context; props shared by a component and a behavior |
| [structure.md](structure.md) | `components/src/structure.tsx`; `childrenAsHeaders` (E038), `perChildContextVars` in the compiler; `usePerChildScope` |
| [list.md](list.md) | `components/src/list.tsx`, `list-model.ts`, `selection.ts`, `virtual.ts`; `PropMetadata.variableName` (E039) in the compiler |
| [overlays.md](overlays.md) | `components/src/overlays.tsx`, `overlay-context.tsx`; `runtime/src/render/overlay-state.ts`, `pointer.ts`; E037, `$$whenOpen`, `EventMetadata.args` |
| [display.md](display.md) | `components/src/display.tsx`, `icons.tsx`, `icon-names.ts`, `markdown*.ts(x)`, the text overflow of `text.tsx`, `Link`; `compiler/src/script/markdown-bindings.ts`; `runtime/src/render/lazy.ts` |
| [behaviors.md](behaviors.md) | `components/src/behaviors*.ts(x)`, `attachedBehaviors`, the compiler's `withBehaviors` |
| [forms.md](forms.md) | `runtime/src/forms/`, `runtime/src/render/context-scope.ts`, the field binding in `wrap.ts`, `components/src/forms.tsx`, `childContextVars` in the compiler, `test-apps/forms` |
| [theming.md](theming.md) | `components/src/theming/` (the engine, built-in themes), `styles.ts`, `App`/`Theme`, `runtime/src/render/theme-state.ts` |
| [contracts.md](contracts.md) | `ComponentMetadata`; the contract checks (E001, E004, E020–E024, C015); `strictContracts` |
| [user-components.md](user-components.md) | `<Component>` definitions, analysis, compilation, `BoundUser`/`useComponent`/`Slot`, discovery in the plugin and standalone, code-behind |
| [ssg.md](ssg.md) | Prerendering (`vite-plugin/src/prerender.ts`), takeover (`runtime/src/render/mount.ts`), the server view, `@gluefuil/runtime/server` |
| [standalone.md](standalone.md) | `packages/standalone`: the one-file engine, loading, the compile cache, watching, the bundle |
| [visibility-templates.md](visibility-templates.md) | `when`/`when-*`, lifecycle, templates and context variables, `Items` |
| [source-maps.md](source-maps.md) | Source markers, Source Map v3, delivery through Vite and `loadModule`, the evidence |
| [scoping.md](scoping.md) | Name resolution (compile time), the scope chain (runtime), component IDs and APIs |
| [async-handlers.md](async-handlers.md) | Handlers at runtime: implicit await, segments (batching across `await`), the watchdog, `$cancel`, policies, timeouts, async-aware array methods, app globals |
| [codegen.md](codegen.md) | `packages/compiler/src/codegen/` and `packages/runtime/src/script/`: bindings compiled to JavaScript, static name resolution, the sandbox, dependencies |

## Repository layout

```
.
├── packages/
│   ├── compiler/        @gluefuil/compiler    markup + script compiler
│   │   ├── src/source/      positions (LineMap), diagnostics, source maps and suggestions ("did you mean"), shared by all stages
│   │   ├── src/markup/      markup parser: text -> syntax tree
│   │   ├── src/script/      script parser: expressions, statements, interpolation
│   │   ├── src/codegen/     bindings -> JavaScript; name resolution and the sandbox
│   │   ├── src/module/      .gui document -> JavaScript module; analyze.ts (what a file defines and uses)
│   │   ├── tests/           unit tests (mirrors src/)
│   │   └── bench/           benchmarks (npm run bench)
│   ├── runtime/         @gluefuil/runtime     what compiled code calls into
│   │   ├── src/script/      sandbox globals and helpers; the binding-value check; loadBinding (standalone only)
│   │   ├── src/reactivity/  signal store, React hooks, scope object
│   │   ├── src/render/      what compiled modules render with (Bound, BoundUser, useComponent, Slot, TextNode, useScope, loadModule, deferredValue), handler runtime, app globals, mountApp, wrapComponent, the router
│   │   ├── src/data/        the HTTP gate, data errors, the retry policy, the query client, Loader (DataSource) and ApiCaller (APICall)
│   │   ├── src/server.ts    @gluefuil/runtime/server: renderStatic (static generation; never in client bundles)
│   │   ├── src/errors.ts    the runtime error reporter
│   │   └── bench/           benchmarks (npm run bench)
│   ├── standalone/      @gluefuil/standalone  the one-file engine (dist/gfui.js): fetch, compile, cache, watch
│   ├── vite-plugin/     @gluefuil/vite-plugin build-time compilation: .gui -> ES module in Vite; component discovery; prerendering; gfuiMockBackend
│   ├── mock-backend/    @gluefuil/mock-backend a mock backend (Request -> Response) and its hosts: service worker, dev-server middleware, test server
│   └── components/      @gluefuil/components  built-in components (+ React-free metadata)
│       ├── src/layout.tsx   Stack (VStack, HStack, … are compile-time aliases), SpaceFiller, the layout context and props (+ layout-metadata.ts, React-free)
│       ├── src/mantine.tsx  Button, SubmitButton (Mantine, through wrapComponent), MANTINE_STYLESHEET
│       ├── src/choice.tsx   Select, AutoComplete (Mantine Combobox; Option children compiled to data)
│       ├── src/dates.tsx    DateInput, TimeInput, DatePicker (+ date-format.ts; dates-native.tsx: the lazy chunk with @mantine/dates)
│       ├── src/inputs.tsx   TextBox, PasswordInput, TextArea, NumberBox, Checkbox, Switch, RadioGroup, Option, Slider, ColorPicker (+ layout-wrap.tsx: withLayout)
│       ├── src/text.tsx     Text (variants), Heading, H1–H6, the text-overflow props
│       ├── src/display.tsx  Image, Avatar, Badge, ProgressBar, Spinner, ContentSeparator (Mantine), Card (a Stack)
│       ├── src/icons.tsx    the icon registry (Lucide drawings, XMLUI's names), Icon (+ icon-names.ts, React-free)
│       ├── src/markdown.tsx Markdown; markdown-render.tsx its lazy renderer (mdast → React); markdown-html.ts the HTML allowlist
│       ├── src/routing.tsx  Pages, Page, Link (routes and URLs)
│       ├── src/shell.tsx    the App shell: AppHeader, NavPanel, Footer, NavLink, NavGroup, NavPanelCollapseButton
│       ├── src/theme.tsx    App, Theme; src/styles.ts the stylesheet; src/theming/ the theme engine (React-free)
│       ├── src/structure.tsx Tabs, TabItem, ExpandableItem, Stepper, Step, Splitter, ScrollViewer, StickyBox, StickySection, ResponsiveBar
│       ├── src/overlays.tsx ModalDialog, Drawer, DropdownMenu, MenuItem, SubMenuItem, MenuSeparator, ContextMenu, Tooltip, TooltipBehavior, the App's toasts and confirm() (+ overlay-context.tsx: the overlay layer, the Escape stack, the dialog host)
│       ├── src/behaviors.tsx  LabelBehavior, VariantBehavior (+ behaviors-metadata.ts, React-free)
│       ├── src/data.tsx     DataSource, APICall, DataUrl
│       ├── src/forms.tsx    Form, FormBindingBehavior, ValidationBehavior (the store is runtime/src/forms/)
│       ├── src/items.tsx    Items (templates with $item; a URL in data loads it)
│       └── src/list.tsx     List, virtualized (+ list-model.ts: the rows; selection.ts: row selection, for Table too; virtual.ts: the TanStack Virtual setup)
├── tools/               repository tooling: package-boundary checker, XMLUI corpus test, sandbox drift test, build-output check, static-server.mjs (E2E)
├── test-apps/
│   ├── smoke/           @gluefuil/smoke-app   E2E fixture: packages load, parser runs in the browser
│   ├── routing/         @gluefuil/routing-app E2E fixture: a dashboard of buttons and links opening routed pages, a navigation guard and log (dev and prerendered build)
│   ├── routing-browser/ @gluefuil/routing-browser-app E2E fixture: browser routing, every static route prerendered, a guard and log
│   ├── forms/           @gluefuil/forms-app   E2E fixture: a sign-up form with bound inputs; a profile form against a mock backend (dev 5186, prerendered build 5187)
│   ├── hello/           @gluefuil/hello-app   E2E fixture: the step demos in Main.gui (+ components/, code-behind), compiled by @gluefuil/vite-plugin, prerendered in builds
│   └── data/            @gluefuil/data-app    E2E fixture: DataSource and APICall against the mock backend (worker host 5182, middleware host 5183)
├── playground/          @gluefuil/playground  manual testing: a dashboard of 45 scenarios (steps 2–29), one page each with its source, and a live compiler, on the App shell; layouts.html: one App shell demo per XMLUI layout, and the spacing demo (see playground/README.md)
├── e2e/                 Playwright specs; fixtures/standalone-site (served from .tmp/ by tools/static-server.mjs)
├── .tmp/                (ignored) test work folders: the standalone site copy, the hello app's production build, throwaway apps
├── .ai/                 AI working material: plans (plan/), docs (docs/)
├── README.md            product overview and quick start
├── package.json         workspace root: scripts, pinned dev dependencies
├── tsconfig.base.json   shared TypeScript settings
├── vitest.config.ts     unit-test projects
└── playwright.config.ts E2E configuration
```

## Packages

All packages are private npm workspaces, ES modules (`"type": "module"`), at
version `0.0.0`.

| Package | Role | Entry points (`exports`) | Runs in |
|---------|------|--------------------------|---------|
| `@gluefuil/compiler` | Turns `.gui` markup and scripts into JS modules. | `.` → `src/index.ts` | Node (build tools, static generation, editor) **and** the browser (standalone mode) |
| `@gluefuil/runtime` | Reactivity, scheduling, theming engine, wrapping API: everything compiled code calls. | `.` → `src/index.ts`; `./server` → `src/server.ts` | Browser; `./server` in Node (static generation) |
| `@gluefuil/components` | Built-in components (own and Mantine-wrapped). | `.` → `src/index.ts`; `./metadata` → `src/metadata.ts` | Browser; Node for server rendering |
| `@gluefuil/standalone` | The one-file engine for standalone mode; built into `dist/gfui.js` (IIFE, global `gfui`). | `.` → `src/index.ts` | Browser |
| `@gluefuil/vite-plugin` | Build-time compilation: the Vite plugin `gfui()`; `gfuiMockBackend()`. | `.` → `src/index.ts` | Node (Vite) |
| `@gluefuil/mock-backend` | A mock backend for development and tests, and its hosts. Never imported by the app's packages. | `.` → `src/index.ts`; `./worker`, `./node`, `./middleware` | Browser (worker host), Node (middleware and test hosts) |

**Current contents:**

| File | Exports |
|------|---------|
| `packages/compiler/src/index.ts` | **Markup:** `parseMarkup`, the markup tree types, `MarkupDiagnostics`, `decodeEntities`, `decodeEntitiesWithOffsets`. **Script:** `parseExpression`, `parseStatements`, `parseInterpolation`, the segment types, `ScriptAst` (namespace of AST types), `ScriptDiagnostics`, `ScriptSourceOptions`. **Code generation:** `compileExpression`, `compileInterpolation`, `compileHandler`, `CompileOptions`, `CompileHandlerOptions`, `CompileResult`, `ScopeNames`, `EmitterOptions`, `CodegenDiagnostics`, and the sandbox tables `ALLOWED_GLOBALS`, `APP_GLOBALS`, `BANNED_GLOBALS`, `BANNED_MEMBERS`, `CONSTRUCTIBLE`, `RESTRICTED_GLOBAL_MEMBERS`. **Modules:** `compileModule`, `CompileModuleOptions`, `CompileModuleResult`, `ModuleDiagnostics`, `analyzeModule`, `ModuleAnalysis`, `UserComponentInfo`, `DEFAULT_SLOT`, `COMPONENT_NAME`, `compileFunction`. **Source maps:** `buildSourceMap`, `encodeMappings`, `decodeMappings`, `encodeVlq`, `decodeVlq`, `originalPositionFor`, `offsetSourceMapLines`, `SourceMap`, `Mapping`. **Shared:** `LineMap`, `Diagnostic`, `formatDiagnostic`, `codeFrame`, `editDistance`, `closestMatch`, `didYouMean`. |
| `packages/runtime/src/index.ts` | **Script:** `loadBinding`, `assertBindingValue`, `Binding`, `BindingError`, `scriptGlobals`, `scriptRuntime`, `BANNED_MEMBERS`, `SandboxError`. **Reactivity:** `signal`, `computed`, `batch`, `startBatch`, `endBatch`, `isBatching`, `watch`, `untracked`, `observerCount`, `ReactivityError`, the signal types, `useSignal`, `useComputed`, `shallowEqual`, `createScope`, `ScopeEntry`, `variable`, `Variable`, `freezeDeep`. **Rendering:** `Bound`, `TextNode`, `useScope`, `VariableDefinition`, `HandlerFactory`, `loadModule` (with `map`/`sourceURL`), `ModuleSourceMap`, `ARRAY_MUTATORS`, `ASYNC_ARRAY_METHODS`, `createAppScope`, `APP_GLOBAL_NAMES`. **Handlers:** `HandlerSlot`, `Invocation`, `HandlerCancelledError`, `HandlerTimeoutError`, `HANDLER_POLICIES`, `setDefaultHandlerTimeout`, `currentInvocation`, `delay`, their types. **Component APIs:** `createFileScope`, `useFileScope`, `apiRegistrar`, `useComponentApi`, `API_REFS`, `RegisterApi`. **Visibility and templates:** `When`, `resolveVisibility`, `breakpoint`, `breakpointIndex`, `BREAKPOINTS`, `BREAKPOINT_NAMES`, `TemplateInstance`, `templateRenderer`, their types. **Routing:** `navigate`, `redirect`, `setNavigationHandlers`, `currentLocation`, `currentRouteParams`, `matchRoute`, `findRoute`, `parseLocation`, `routePath`, `hrefFor`, `registerRoutes`, `registeredRoutes`, `setRoutingMode`, `routingMode`, `setServerPath`, `setBasename`, `getBasename`, `normalizeBasename`, `resetRouter`, their types. **Wrapping:** `wrapComponent`, `coerceLiteral`, `WrapConfig` and its parts. **Theme state:** `activeThemeId`, `activeThemeTone`, `setTheme`, `setThemeTone`, `toggleThemeTone`, `setThemeDefaults`, `resetThemeState`. **Shell state:** `navPanelCollapsed`, `setNavPanelCollapsed`, `navDrawerOpen`, `setNavDrawerOpen`, `resetShellState`. **Forms:** `extractServerProblem`, `ServerProblem`, `ServerFieldError`, `FormStore`, `FormField`, `FieldOptions`, `DEFAULT_FIELD_OPTIONS`, `ValidationSummary`, `validateRules`, `customResults`, `highestSeverity`, `isEmptyValue`, `parseRegex`, `PATTERNS`, `FieldRules`, `RuleResult`, `Severity`, `isShown`, `INITIAL_FLAGS`, `InteractionFlags`, `ValidationMode`, `parseFieldPath`, `getAt`, `setAt`, `deleteAt`, `FormProvider`, `useFormStore`, `FieldBindingProvider`, `useFieldBinding`, `FieldBinding`; `createContextScope`, `useContextScope`, `provideContext`, `usePerChildScope`, `ChildContextValues`. **User components:** `BoundUser`, `useComponent`, `Slot`, `SLOTS`, `DEFAULT_SLOT`, `ComponentInput`, `SlotProps`, `GlobalScope`, `useGlobalScope`. **Static generation:** `mountApp`, `MountOptions`, `PRERENDERED_ATTRIBUTE`, `PATH_ATTRIBUTE`, `BASE_ATTRIBUTE`, `READY_ATTRIBUTE`, `inServerView`, `isServerView`, `currentBreakpoint`, `setServerBreakpoint`, `breakpointFromName`. **Errors:** `reportRuntimeError`, `setErrorReporter`. **Overlays (step 27):** `toast`, `confirm`, `toasts`, `confirmQueue`, `removeToast`, `answerConfirm`, `resetOverlayState`, `TOAST_POSITIONS`, their types; `pointerData`, `isPointerLike`, `PointerData`. Also `createElement`, `Fragment`. |
| `packages/components/src/index.ts` | `App`, `Theme`, `AppHeader`, `NavPanel`, `Footer`, `NavLink`, `NavGroup`, `NavPanelCollapseButton`, `isActiveRoute`, `ShellConfig`, `Icon`, `ICON_NAMES`, `Text`, `Heading`, `H1`–`H6`, `Button`, the inputs, `Select`, `AutoComplete`, `Stack`, `SpaceFiller`, `LayoutContext`, `layoutStyle`, `useLayout`, `withoutLayoutProps`, `childCount`, `BAR_SCOPE`, `Items`, `Pages`, `Page`, `Link`, the behavior components, the structure components (`Tabs`, `TabItem`, `ExpandableItem`, `Stepper`, `Step`, `Splitter`, `ScrollViewer`, `StickyBox`, `StickySection`, `ResponsiveBar`, `splitterSize`, `splitterSizeAfterDrag`, `fittingCount`), the overlays (`ModalDialog`, `Drawer`, `DropdownMenu`, `MenuItem`, `SubMenuItem`, `MenuSeparator`, `ContextMenu`, `Tooltip`, `parseTooltipOptions`), `BASE_STYLESHEET`, `MANTINE_STYLESHEET`; re-exports the metadata and the theme engine |
| `packages/components/src/metadata.ts` | `componentMetadata` (every built-in, with `themeVars` defaults; props with value types and enums, events, API, templates; App's `regions` and `removedProps`), `LAYOUT_EQUIVALENTS`, `DRAWER_BREAKPOINTS`, `ComponentMetadata`, `PropMetadata`, `EventMetadata`, `PropValueType` |

### Compiler source layout

| Folder | Contents |
|--------|----------|
| `src/source/` | Stage-independent source utilities: `LineMap` (offset ↔ 0-based line and column), the `Diagnostic` shape plus `formatDiagnostic` and `codeFrame`, and source maps. Every compiler stage reports positions and problems through these. |
| `src/markup/` | The markup parser ([markup-parser.md](markup-parser.md)) |
| `src/script/` | The script parser ([script-parser.md](script-parser.md)) |
| `src/codegen/` | Binding compilation and the sandbox tables ([codegen.md](codegen.md)) |
| `src/module/` | Whole documents to modules ([modules.md](modules.md)) |

Positions everywhere in the compiler are **UTF-16 offsets** into the `.gui`
file, converted to line and column only when needed (diagnostics, and later
source maps). Script inside markup is parsed with its offset in the file
(`offset`, or `offsets` for entity-decoded text), so script nodes point
straight into the markup.

**How the stages connect:** `compileModule` (`src/module/`) drives the
others:

1. `parseMarkup` produces elements, attributes and text.
2. Each attribute value and each text node is entity-decoded with
   `decodeEntitiesWithOffsets`, split by `parseInterpolation`, and compiled
   by `compileInterpolation` against the scope.
3. The results become `createElement` calls, plus `Bound` wrappers and
   hoisted binding objects where there are bindings.

Handlers (`on*` attributes, `<event>` content) go through
`parseStatements` and `compileHandler`. `tools/xmlui-corpus.test.ts` checks
handler parsing across the XMLUI corpus with a heuristic (`on*` and
`method.*` are handlers).

### No build step (yet)

Each package's `exports` points directly at TypeScript source. Vite, Vitest
and `tsc` (with `moduleResolution: "bundler"`) all resolve it through the
workspace symlinks in `node_modules/@gluefuil/`. Vite configs that use
the workspace packages need `--configLoader runner`. Building the packages
themselves (compiled JS plus type declarations, for publishing) is not done
yet: apps compile their `.gui` files at build time, and Vite bundles the
packages' source.

### Dependency rules

```
compiled app ──► @gluefuil/runtime ◄── @gluefuil/components
                                            │
@gluefuil/compiler ──► @gluefuil/components/metadata (React-free)

delivery (imported by no package):
  @gluefuil/standalone  ──► compiler, runtime, components
  @gluefuil/vite-plugin ──► compiler, components/metadata, vite
```

| Package | May import | Must not import |
|---------|-----------|-----------------|
| compiler | relative files; `@gluefuil/components/metadata` | anything else: React, runtime, components' main entry, Node built-ins (`node:*`), third-party packages |
| runtime | React, relative files | compiler, components (its *tests* may import the compiler, a devDependency) |
| components | runtime, React, Mantine (`@mantine/core`, `@mantine/dates`, `@mantine/notifications`), `lucide-react`, `@tanstack/react-virtual` (step 29), the Markdown parser (`mdast-util-from-markdown`, `mdast-util-gfm`, `micromark-extension-gfm`, `mdast-util-to-string`; only in the lazy `markdown-render.tsx`) | compiler (its *tests* may import the compiler, a devDependency) |
| everything reachable from `components/src/metadata.ts` | relative files only | any bare import (React, Mantine, runtime, …) |
| standalone | compiler, runtime, components, React | (no package imports it) |
| vite-plugin | compiler, `@gluefuil/components/metadata`, `vite`, `node:*`, relative files | React, runtime, components' main entry (no package imports it) |

**Why:** the packages ship in different combinations. Standalone mode
bundles all three; a build-time compiled app ships only runtime plus
components and must contain no compiler (`tools/build-output.test.ts`
checks a real build); Node tooling uses the compiler
without React or a DOM. Built-ins use only the runtime's public API, the same
one extension packages use.

**Enforcement:**

- `tools/boundaries.test.ts` scans every `.ts`/`.tsx` file under
  `packages/` and fails on any violation. It also unit-tests the checker on
  fixtures.
- The compiler's `tsconfig.json` sets `lib: ["ES2023"]` (no DOM), so using
  `document`, `window` and similar is a type error in the compiler.

Adding a third-party dependency to the compiler requires extending the
allowlist in `tools/boundaries.ts`. That's deliberate: it should be a
conscious decision.

## Tooling

| Tool | Version | Configuration |
|------|---------|---------------|
| Node | ≥ 22.12 (`engines`) | |
| npm workspaces | npm 10 | `workspaces: ["packages/*", "test-apps/*", "playground"]` in the root `package.json` |
| TypeScript | 7.0.2 | `tsconfig.base.json` plus one `tsconfig.json` per package or folder |
| Vite | 8.3.8 | `test-apps/*/vite.config.ts` (with `@vitejs/plugin-react`), `packages/standalone/vite.config.ts` |
| Vitest | 5.1.1 | `vitest.config.ts` (tests and benchmarks) |
| Playwright | 1.65.1 | `playwright.config.ts` |
| React / React DOM | 19.3.1 | peer dependencies `^19.2.0` of runtime and components |

All dev dependencies are pinned to exact versions in the root `package.json`.

### TypeScript settings

`tsconfig.base.json` is shared:

- target ES2023, `module: ESNext`, `moduleResolution: bundler`,
  `jsx: react-jsx`
- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`
- `isolatedModules`, `verbatimModuleSyntax` (write `import type` for types),
  `noEmit`, and `types: []` (no ambient globals unless a tsconfig opts in)

| tsconfig | Differs from the base |
|----------|-----------------------|
| `packages/compiler` | `lib: ["ES2023"]` (no DOM); includes `src`, `tests` and `bench` |
| `packages/runtime` | includes `src`, `tests` and `bench` |
| `packages/standalone` | `types: ["node"]`; includes `src`, `tests` and `vite.config.ts` |
| `packages/vite-plugin` | `lib: ["ES2023"]` (no DOM), `types: ["node"]` |
| `packages/components`, `test-apps/smoke` | none (`components/src/css.d.ts` declares `*.css?inline`; `mantine.tsx` references it) |
| `test-apps/hello` | `types: ["node"]` (for its `vite.config.ts`) |
| `tools` | `lib: ["ES2023"]`, `types: ["node"]` |
| `e2e` | `types: ["node"]`; also covers `playwright.config.ts` |

## Commands

Run from the repository root.

| Command | Does |
|---------|------|
| `npm install` | Installs everything and links the workspace packages (`packages/*`, `test-apps/*`, `playground`) |
| `npm test` | All unit tests (Vitest, every project) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright; starts a server per fixture: `test-apps/smoke` (Vite, 5173), `test-apps/hello` (Vite dev, 5174), the standalone site (builds `gfui.js`, then `tools/static-server.mjs`, 5175), the hello app's production build (`vite build` into `.tmp/hello-dist`, then `vite preview` with a strict CSP, 5176), the routing fixture (dev 5177, build 5178), the forms fixture (dev 5186, build 5187), the browser-routing fixture's prerendered build (5184) and the same built under `base: "/app/"` (5185), the playground (dev 5180, production build 5181), the data fixture (worker host 5182, middleware host 5183) |
| `npm run playground` | The manual-testing playground on the Vite dev server, port 5190 (`playground:build`, and `playground:preview` on 5191, for the prerendered build) |
| `npm run build:standalone` | Builds `packages/standalone/dist/gfui.js` (also run by the E2E web server) |
| `npm run bench` | Benchmarks (`vitest bench --run --reporter=verbose`); not part of `check` |
| `npm run typecheck` | `tsc -p` for each package and folder, each with its own settings |
| `npm run check` | typecheck, then unit tests, then E2E. Must pass before a step is done. |

One-time machine setup for E2E: `npx playwright install chromium`.

## Tests

### Unit tests (Vitest)

`vitest.config.ts` defines one project per package:

| Project | Root | Environment | Files |
|---------|------|-------------|-------|
| `compiler` | `packages/compiler` | `node` (no DOM, matching the compiler's constraint) | `tests/**/*.test.ts`; benchmarks: `bench/**/*.bench.ts` |
| `runtime` | `packages/runtime` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}`; benchmarks: `bench/**/*.bench.{ts,tsx}` |
| `components` | `packages/components` | `jsdom`, React plugin, `tests/jsdom-setup.ts` (Mantine stubs; standalone loads it too) | `tests/**/*.test.{ts,tsx}` |
| `standalone` | `packages/standalone` | `jsdom`, React plugin | `tests/**/*.test.{ts,tsx}` |
| `vite-plugin` | `packages/vite-plugin` | `node` | `tests/**/*.test.ts` |
| `tools` | `tools` | `node` | `**/*.test.ts` |

Test files run **isolated** (`isolate: true`, set explicitly in
`vitest.config.ts`): one fresh worker per file. `--no-isolate` gave no
measurable wall-clock gain (files already run in parallel), and isolation
keeps module state and the jsdom DOM from leaking between files.

Conventions:

- Tests live in each package's `tests/` folder and import from `../src/…`.
- Import test functions explicitly (`import { test, expect } from "vitest"`);
  there are no globals.
- React tests use `@testing-library/react` (`render`, `screen`). Without
  Vitest globals its automatic cleanup is not registered: call
  `afterEach(cleanup)` in files that render more than once.
- Behavior that defines the language goes into data-driven conformance
  tables (`test.each`), which act as the written spec.
- Compiler tests mirror `src/` (`tests/markup/`, `tests/source/`). Shared
  test helpers live next to the tests that use them (for example
  `tests/markup/helpers.ts`).
- Positions are asserted through the source text they cover
  (`markup.slice(start, end)`), not raw numbers, so tables stay readable.

| Test file | Covers |
|-----------|--------|
| `packages/compiler/tests/markup/*.test.ts` | The markup parser: valid markup, positions, diagnostics, recovery, entities (see [markup-parser.md](markup-parser.md#tests)) |
| `packages/compiler/tests/script/*.test.ts` | The script parser: expressions, statements and ASI, diagnostics and recovery, positions, interpolation (see [script-parser.md](script-parser.md#tests)) |
| `packages/compiler/tests/codegen/*.test.ts` | Code generation: emitted code, diagnostics, dependencies, interpolation (see [codegen.md](codegen.md#tests)) |
| `packages/compiler/tests/source/line-map.test.ts` | `LineMap`, `formatDiagnostic` and `codeFrame` |
| `packages/runtime/tests/smoke.test.tsx` | Package loads; React 19 renders in jsdom |
| `packages/runtime/tests/reactivity/*` | The signal store, the React integration (StrictMode, unmounting, server rendering, tearing) and the scenario that compares signals with plain React state (see [reactivity.md](reactivity.md#tests)) |
| `packages/runtime/tests/script/*.test.ts` | Compiled bindings run in the sandbox: semantics table, equivalence with native JavaScript, escape attempts (see [codegen.md](codegen.md#tests)) |
| `packages/components/tests/smoke.test.ts` | Package loads; every component has metadata; the metadata entry point loads on its own |
| `packages/components/tests/first-app.test.tsx` | Markup → `compileModule` → `loadModule` → DOM (see [modules.md](modules.md#tests)) |
| `packages/compiler/tests/module/*.test.ts` | `compileModule` (see [modules.md](modules.md#tests)) |
| `packages/runtime/tests/render/*.test.tsx` | `Bound`, `TextNode`, `loadModule`; the server view and `mountApp` (`server-view.test.tsx`, see [ssg.md](ssg.md#tests)) |
| `packages/runtime/tests/render/router.test.ts`, `router-events.test.ts`, `packages/components/tests/routing.test.tsx` | The router and its navigation events; Pages, Page, Link (see [routing.md](routing.md#tests)) |
| `packages/runtime/tests/render/wrap.test.tsx`, `packages/components/tests/mantine.test.tsx`, `text-heading.test.tsx` | `wrapComponent`; the Mantine components; Text and Heading (see [mantine.md](mantine.md#tests)) |
| `packages/components/tests/inputs.test.tsx` | Step 24: every input through markup and bound in a Form (see [inputs.md](inputs.md#tests)) |
| `packages/components/tests/dates.test.tsx` | Step 26: the formats, matchers, presets and times; the three date inputs through markup, in a Form, prerendered (see [dates.md](dates.md#tests)) |
| `packages/compiler/tests/module/choice.test.ts`, `packages/components/tests/choice.test.tsx` | Step 25: Option children compiled to data; Select and AutoComplete through markup, in a Form, prerendered (see [choice.md](choice.md#tests)) |
| `packages/components/tests/display.test.tsx`, `markdown.test.tsx`, `markdown-lazy.test.tsx`, `packages/compiler/tests/script/markdown-bindings.test.ts`, `packages/runtime/tests/render/lazy.test.ts` | Step 23: the display components, icons and E033; text overflow; Markdown (conformance, the HTML allowlist, `@{…}`, the lazy chunk and the prerender's second render) (see [display.md](display.md#tests)) |
| `packages/compiler/tests/module/list.test.ts`, `packages/components/tests/list-model.test.ts`, `list.test.tsx` | Step 29: E039 and `syncWithVar`'s code; the row model, selection and key-binding tables; the List in jsdom (see [list.md](list.md#tests)) |
| `packages/compiler/tests/module/structure.test.ts`, `packages/components/tests/structure.test.tsx` | Step 28: headers as data, E038, `$overflow` scopes, the splitter aliases; the structure components in jsdom (see [structure.md](structure.md#tests)) |
| `packages/compiler/tests/module/overlays.test.ts`, `packages/runtime/tests/render/pointer.test.ts`, `overlay-state.test.ts`, `packages/components/tests/overlays.test.tsx` | Step 27: E037, `$$whenOpen`, context variables; the pointer snapshot; toasts and confirmations; the overlays in jsdom (see [overlays.md](overlays.md#tests)) |
| `packages/compiler/tests/module/behaviors.test.ts`, `packages/components/tests/behaviors.test.tsx` | Behaviors: attachment, order, generated code; rendering (see [behaviors.md](behaviors.md#tests)) |
| `packages/components/tests/theming.test.ts`, `theme-components.test.tsx` | The theme engine tables; `App`/`Theme` and the globals (see [theming.md](theming.md#tests)) |
| `packages/components/tests/user-components.test.tsx` | User-defined components, one test per feature (see [user-components.md](user-components.md#tests)) |
| `packages/compiler/tests/module/contracts.test.ts` | The contract diagnostics table (see [contracts.md](contracts.md#tests)) |
| `packages/compiler/tests/module/shell.test.ts`, `packages/components/tests/shell.test.tsx` | The App shell: settings, diagnostics and migration messages; the structure, attributes, drawer, collapsing, navigation items (see [app-shell.md](app-shell.md#tests)) |
| `packages/compiler/tests/module/layout.test.ts`, `packages/components/tests/layout.test.tsx` | The layout system: aliases, layout props, E031/E032, `$$layoutFrom`; levels, stack attributes, `layoutStyle`, the space-base rule (see [layout.md](layout.md#tests)) |
| `packages/compiler/tests/module/user-components.test.ts` | Analysis, file forms, slots, isolation, code-behind diagnostics and code (see [user-components.md](user-components.md#tests)) |
| `packages/vite-plugin/tests/components.test.ts` | Component discovery and code-behind in the plugin |
| `packages/components/tests/ssg.test.tsx` | Compile, render statically, take over (see [ssg.md](ssg.md#tests)) |
| `tools/boundaries.test.ts` | Import extraction, relative-import closure, every boundary rule (positive and negative), the real repo has no violations |
| `tools/xmlui-corpus.test.ts` | Compatibility with the XMLUI repo (`$XMLUI_REPO` or the sibling folder `../xmlui`; skipped if absent). Every `.xmlui` file parses as markup, all script inside each file parses, and every `.xs` code-behind file parses, all with zero diagnostics. Every binding compiles to valid JavaScript; its expected findings (host functions) are listed in `EXPECTED_BINDING_DIAGNOSTICS`. Deliberate exclusions are listed, with reasons, in `EXCLUDED`. |
| `tools/sandbox-drift.test.ts` | The compiler's sandbox tables agree with the runtime's globals object |
| `tools/data-build.test.ts` | A production build of `test-apps/data` has no mock code and no worker script unless `build: true` (see [mock-backend.md](mock-backend.md#tests)) |
| `mock-backend/tests/*.test.ts`, `runtime/tests/data/*.test.ts`, `compiler/tests/module/data.test.ts`, `components/tests/data.test.tsx` | The mock backend and its hosts; the HTTP gate, retries, Loader and ApiCaller; the compiler's data features; DataSource and APICall in markup (see [data.md](data.md#tests), [mock-backend.md](mock-backend.md#tests)) |
| `tools/build-output.test.ts` | A real production build of `test-apps/hello` is one entry chunk (with a chunk it shares with the lazy ones) plus two lazy chunks, Markdown's renderer and the date inputs, contains no compiler module and no eval, drops the standalone loader and the server renderer, maps back to `Main.gui` with `build.sourcemap`, and has the app prerendered in `index.html`; prerender failures fail the build (see [build-time.md](build-time.md#tests), [ssg.md](ssg.md#tests)) |
| `packages/vite-plugin/tests/plugin.test.ts` | The plugin's hooks: ids, output, source-map modes, errors (see [build-time.md](build-time.md#tests)) |
| `packages/vite-plugin/tests/globals.test.ts`, `packages/compiler/tests/module/globals.test.ts`, `packages/components/tests/globals.test.tsx` | Globals in user components: the plugin's `entry` and `Globals.xs`, the compiler's tables, jsdom (see [scoping.md](scoping.md#tests)) |
| `packages/vite-plugin/tests/prerender.test.ts` | Prerender options, HTML injection, when the hook runs, the routes to render and their files, the preview rewrite (see [ssg.md](ssg.md#tests)) |

Count after step 29: 3,010 unit tests in 108 files, 247 E2E tests. After step 28: 2,926 unit tests in 105 files, 235 E2E tests. After step 27: 2,882 unit tests in 103 files, 220 E2E tests. After step 22B: 2,550 unit tests in 90 files. The totals per package
are current; the breakdowns in parentheses were last counted after steps
19A–19C and are updated only where steps 21–22B changed them.

- Compiler: 1,105, of which markup 115, script 331, codegen 207, module 378
  (user components 57, contracts 74, behaviors 19, the shell 33, globals 41,
  forms 18) and
  source 26.
- Runtime: 619, of which forms 113, the script sandbox and async arrays 210,
  reactivity 65, rendering 148 (the server view and `mountApp` 12,
  `wrapComponent` 19, the router 72, of which its events, history moves,
  new tabs and the basename are 45), and the
  smoke test 2.
- Standalone: 28 (the cache 10, the loader 17, the hash 1).
- Vite plugin: 108 (the transform 27, the prerender 62, components 10,
  globals 9).
- Tools: 383, of which the corpus is 327, the boundaries 35, the build
  output 14, the data build 2 and the sandbox drift test 5.
- Mock backend: 20.
- Components: 287 (static generation 12, user components 11, globals 9, forms 27, the theme
  engine 29, theme components 5, behaviors 7, Mantine 6, Text and Heading
  21, routing 12, the shell 36).

### Benchmarks (Vitest 5)

- Files: `packages/<pkg>/bench/*.bench.ts(x)`, selected by the project's
  `benchmark.include`. Only `npm run bench` runs them.
- Vitest 5 API: a benchmark is a test that uses the `bench` fixture:
  `test("…", async ({ bench }) => { await bench("name", fn).run(); })`.
  There is no top-level `bench` export.
- `suppressExportGetterWarnings` is on: Vitest's dev module runner adds
  roughly 15–20% overhead through export getters, which bundled production
  code doesn't have, so the results are slightly pessimistic (rationale in
  `vitest.config.ts`).

| Benchmark | Measures |
|-----------|----------|
| `packages/compiler/bench/markup.bench.ts` | `parseMarkup` on generated realistic markup: 10 KiB, 100 KiB, 1 MiB (about 120 MB/s) |
| `packages/runtime/bench/reactivity.bench.tsx` | 1,000 rows, one or all updated: signals 0.15 ms / 2.3 ms; React state 2.3 ms / 2.6 ms; with memo 1.2 ms / 2.7 ms |
| `packages/compiler/bench/codegen.bench.ts` | Compiling typical bindings (about 0.45 µs each); compiled against hand-written evaluation (within about 10–15%); `compileModule` with a source map (about 38 µs for a small module) and without (26 µs) |
| `packages/components/bench/layout.bench.tsx` | 1,000 stacks: the layout context against a plain div stack. Mount 27 ms vs 22 ms; a re-render 12 ms vs 7 ms (about 5 µs per stack, mostly the context provider) |
| `packages/compiler/bench/script.bench.ts` | `parseInterpolation` on typical bindings (about 2 µs each), `parseStatements` on a 15-line handler (about 15 µs) |

### E2E tests (Playwright)

- Specs live in `e2e/*.spec.ts`; the browser is Chromium.
- **Projects** pick specs by file and set `baseURL`:
  - `smoke` (5173);
  - `hello-dev` (5174: the hello specs `first-app`, `variables`,
    `async-handlers`, `ids`, `conditionals-templates`, `user-components`,
    `theming`, `behaviors`, `mantine` and `globals`, plus `source-maps`);
  - `hello-build` (5176: the same hello specs plus `build` and `ssg`,
    against the prerendered production build under `script-src 'self'`);
  - `standalone` (5175, full URLs);
  - `routing-dev` (5177) and `routing-build` (5178): `routing.spec.ts`
    against `test-apps/routing`;
  - `routing-browser-build` (5184): `routing-browser.spec.ts` against
    `test-apps/routing-browser`'s prerendered build (`.tmp/routing-browser-dist`,
    on `vite preview` with the plugin's route rewrite);
  - `routing-base-build` (5185): `routing-base.spec.ts` against the same
    fixture built with `--base /app/` (`.tmp/routing-base-dist`): the
    router's basename;
  - `forms-dev` (5186) and `forms-build` (5187): `forms.spec.ts` against
    `test-apps/forms` (`.tmp/forms-dist`, prerendered);
  - `playground` (5180): `playground.spec.ts` (every scenario opens without
    errors and shows its source; the side nav), `playground-scenarios.spec.ts`
    (each scenario does what its page says), `app-shell.spec.ts` (the
    layout demos, measured), `layout.spec.ts` (the spacing demo,
    measured), `overlays.spec.ts` (step 27: focus, Escape, outside clicks,
    placement, in the overlay scenarios), `structure.spec.ts` (step 28:
    splitter drags, sticky elements, overflow, measured) and `list.spec.ts`
    (step 29: virtualized scrolling, anchoring, selection);
  - `playground-build` (5181): `app-shell-prerender.spec.ts`, against the
    playground's prerendered production build (`.tmp/playground-dist`);
  - `data-worker` (5182) and `data-server` (5183): `data.spec.ts` against
    `test-apps/data` with the mock backend in a service worker and in the
    dev server. `data-server` runs one test at a time (`workers: 1`): its
    backend is shared.
- `webServer` starts one server per fixture (reused locally if already
  running).
- **The output stays quiet (`npm run check` prints no warnings), on purpose:**
  - the standalone build filters Mantine's `"use client"` directive messages
    (`MODULE_LEVEL_DIRECTIVE`, 800+ lines; meaningless in a client bundle);
  - the fixture apps raise `chunkSizeWarningLimit` to 900 kB (React,
    ReactDOM, Mantine and every built-in are a known ~820 kB since step 24);
  - the fixtures' `optimizeDeps.include` lists `lucide-react` and the
    Markdown parser's packages (step 23): the parser is found only on the
    chunk's dynamic import, and the dev server would reload the page
    mid-test to pre-bundle it;
  - the fixture dev servers turn off Vite's `server.forwardConsole`. It is on
    by default under an AI agent, and would print the source-map tests'
    deliberate throws. The playground turns it off only under the E2E suite
    (`GFUI_E2E`).

  A new warning is therefore worth a look. `test-apps/hello` runs with `--configLoader runner` (see
  [build-time.md](build-time.md#using-it)). CI settings (retries,
  `forbidOnly`, the GitHub reporter) switch on when `CI` is set.
- Fixture apps live in `test-apps/<name>/`, each a workspace package with
  `index.html`, `src/main.tsx` and `vite.config.ts`.

| Spec | Covers |
|------|--------|
| `e2e/smoke.spec.ts` | The smoke app loads all three packages and **runs the markup parser in a real browser** (it renders a parse summary), with no page or console errors |
| `e2e/playground-scenarios.spec.ts` | Each playground scenario's key interactions (one test per scenario page) |
| `e2e/app-shell.spec.ts` | The App shell: each layout demo at desktop width (placement, what sticks and scrolls, measured) and phone width (the drawer, focus, Escape, navigation); collapsing; dropdown groups; the active link |
| `e2e/app-shell-prerender.spec.ts` | The App shell prerendered: right without JavaScript at both widths (including the layout levels and gaps); a takeover that replaces no node |
| `e2e/layout.spec.ts` | The layout system: every gap and surface padding of the spacing demo measured against the ladder, at desktop and phone widths and three space-base values; star sizes, percentages, flows, density |
| `e2e/playground.spec.ts` | The playground's dashboard lists its scenarios; each opens, shows its source (monospace, line breaks and indentation), has no page or console errors, and leads back |
| `e2e/routing.spec.ts` | Routing in the routing fixture, dev and build (projects `routing-dev`, `routing-build`), the navigation guard and log |
| `e2e/routing-browser.spec.ts` | Browser routing and prerendered routes (project `routing-browser-build`) |
| `e2e/routing-base.spec.ts` | The browser-routing fixture under `base: "/app/"` (project `routing-base-build`) |
| `e2e/forms.spec.ts` | Forms (steps 22, 22B): late errors, Save with errors, keyboard only with Enter, an async check, the select and required marks; a profile form against the mock backend (422 on the inputs, save, cancel, 500) (projects `forms-dev`, `forms-build`) |
| `e2e/data.spec.ts` | Data binding against the mock backend in both hosts: real requests, deduplication, slow network, out-of-order answers, retries, offline, hang and cancel, a rename with invalidation, validation errors, a slow double click (see [data.md](data.md#tests)) |
| `e2e/mantine.spec.ts` | Mantine TextInput, Select (step 25's), Checkbox and Button round-trips and theming; text variants and headings (dev and build) |
| `e2e/behaviors.spec.ts` | A tooltip on hover, a labeled input, a variant color (dev and build) |
| `e2e/list.spec.ts` | Step 29 in the playground: 10,000 rows (few mounted, no blank viewport while scrolling fast, exact `scrollToIndex`), a page-scrolled List, the chat feed (follow, stop, prepend), groups, selection by mouse and keys, actions, a context menu (see [list.md](list.md#tests)) |
| `e2e/structure.spec.ts` | Step 28 in the playground: tabs by keyboard, splitter drags and limits (measured), keys, hidden panes, resize modes; ScrollViewer styles and fades; sticky sections and boxes; ResponsiveBar overflow |
| `e2e/overlays.spec.ts` | Step 27 in the playground: dialogs (focus trap and return, Escape only for the topmost, outside clicks, `willClose`, a Form, the tone), drawers, menus by keyboard, a context menu at the pointer, tooltip delay and flipping, toasts, `confirm()`, APICall |
| `e2e/theming.spec.ts` | Computed styles follow theme variables, a scoped `Theme`, and the tone switch (dev and build) |
| `e2e/user-components.spec.ts` | The XMLUI user-defined-components examples (component files, code-behind, an inline component; `$props`, events, methods, slots), in dev and in the prerendered build |
| `e2e/globals.spec.ts` | Globals (step 21B) in the hello app: a component file writes them, Main and another component read them, a local variable shadows one; dev and prerendered build |
| `e2e/ssg.spec.ts` | Static generation: the content with JavaScript disabled (prerendered Markdown included); takeover at the prerendered breakpoint changes no DOM node; with Markdown's chunk held back, the takeover still changes none and the Markdown is live afterwards; at desktop width only the responsive text switches; the app is live afterwards |
| `e2e/build.spec.ts` | The production build under a strict CSP: no violations (with a page-level eval as the control that the policy is enforced), no `.gui` fetched |
| `e2e/standalone.spec.ts` | Standalone mode against the built `gfui.js`: compile on first load, cache on reload, live edit, error overlay and recovery; a component file with code-behind, and editing it (serial: the tests edit the served files) |
| `e2e/conditionals-templates.spec.ts` | Responsive `when` at three viewport sizes; `Items` add and remove |
| `e2e/source-maps.spec.ts` | Through CDP: a handler's exception resolves to its `throw` line in `Main.gui` |
| `e2e/ids.spec.ts` | Reading and writing another component through its id |
| `e2e/async-handlers.spec.ts` | A slow handler's progress, responsiveness while waiting, double-click under each handler policy |
| `e2e/variables.spec.ts` | Counter and source/mirror (follow until assigned) in the hello app, with real clicks |
| `e2e/first-app.spec.ts` | **The first compiled app**: `test-apps/hello/src/Main.gui`, compiled by `@gluefuil/vite-plugin`, renders the expected texts and buttons, lays out a horizontal `Stack` in a row, with no errors |

## Conventions

- **Naming:** the product is **gluefuil**, short name **gfui**. The npm
  scope is `@gluefuil/*` and markup files are `.gui`. "XMLUI" refers only
  to the original framework (the reference implementation, compatibility
  tests and research notes). See *Decisions* in `AGENTS.md`.

- **Branches:** each proof-of-concept step is developed on `poc/NN-topic`,
  reviewed by the user, then merged.
- **Commits:** only when the user asks.
- **Placeholders:** the `*Info` exports existed only to prove the wiring.
  All are gone: `compilerInfo` was removed in step 1, `runtimeInfo` and
  `componentsInfo` in step 5.
- **Documentation:** every step ends by updating this file (see
  [README.md](README.md)).
