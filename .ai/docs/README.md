# Development documentation

Documentation of **the code as it is**, for developers and AI agents working
on this repository. Plans (what we intend to build) live in
[`../plan/`](../plan/); this folder describes what exists.

| Document | Contents |
|----------|----------|
| [code-structure.md](code-structure.md) | **Start here.** The cornerstone: packages, entry points, dependency rules, tooling, tests, conventions. |
| [markup-parser.md](markup-parser.md) | The markup parser: API, syntax tree, lexical rules, diagnostics, recovery, tests, measurements. |
| [script-parser.md](script-parser.md) | The script parser: entry points, positions, the supported language, ASI, implementation, interpolation, diagnostics, tests. |
| [reactivity.md](reactivity.md) | The reactivity core: signal store algorithm, React integration, scope object, tests, measurements. |
| [modules.md](modules.md) | Compiled modules: `compileModule`, generated code, compilation rules, `Bound`/`TextNode`/`loadModule`, built-in components, build-time integration. |
| [build-time.md](build-time.md) | Build-time compilation: the Vite plugin, its options and errors, what a production build contains (no compiler, no eval). |
| [ssg.md](ssg.md) | Static generation and takeover: the prerender, `mountApp`, the server view, what matches and what doesn't. |
| [behaviors.md](behaviors.md) | Behaviors (`label`, `tooltip`, `variant`): the attachment rule, compile-time wrapping, the order, user-defined components. |
| [theming.md](theming.md) | Theming: the engine (chains, tones, derived tokens, references), the stylesheet, `App` and `Theme`, the tone and theme globals. |
| [contracts.md](contracts.md) | Component metadata (one format for every component) and the compile-time contract checks: props, types, enums, events, API members, deprecations. |
| [user-components.md](user-components.md) | User-defined components: definitions and files, `$props`, events, methods, slots, isolation, code-behind; compiling, runtime, delivery. |
| [standalone.md](standalone.md) | Standalone mode: `pfui.js`, loading, the compile cache, watching, the error overlay, the bundle. |
| [visibility-templates.md](visibility-templates.md) | `when`/`when-*`, lifecycle handlers, templates, `Items`. |
| [source-maps.md](source-maps.md) | Source maps: markers, encoding, delivery (Vite, `loadModule`), evidence. |
| [scoping.md](scoping.md) | Scoping: name resolution order, the scope chain, component IDs and APIs, `TextBox`. |
| [async-handlers.md](async-handlers.md) | Async handlers: segments and the watchdog, `$cancel`, policies, timeouts, async-aware array methods, app globals. |
| [codegen.md](codegen.md) | Code generation and the sandbox: API, generated code, name resolution, closed escape paths, interpolation, dependencies, tests, measurements. |

## Rules

- **Accurate or absent.** Every statement here must match the current code.
  A stale document misleads more than a missing one.
- **Updated with every step.** Each proof-of-concept step (see
  [`../plan/poc-steps.md`](../plan/poc-steps.md)) ends by updating
  `code-structure.md`, and any other document here it affects, in the same
  change as the code.
- **Describe, don't plan.** Intentions and open questions belong in plans;
  link to them instead of repeating them.
- When a subsystem grows large enough to need its own document (for example
  the parser or the reactivity core), add it here, link it from
  `code-structure.md`, and list it in the table above.
