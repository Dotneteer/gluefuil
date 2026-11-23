# Step 8: Scoping, component IDs, context variables

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

- **Scoping:** variables flow downward through nested components; inner
  declarations shadow outer ones; unknown names are compile errors.
- **Component IDs:** `id` exposes a component's values and methods
  (`textBox.value`, `textBox.setValue('x')`, `textBox.focus()`), reactively.
- **Context variables:** `$`-names are resolved by the compiler.

## Background (XMLUI)

Sources: `website/content/docs/pages/scoping.md`, `context-variables.md`;
`.ai/xmlui/container-state.md`;
`xmlui/src/components-core/rendering/Container.tsx:133`,
`StateContainer.tsx:515`.

- **Variables** flow downward to nested built-in components at any depth
  and stop at a user-defined component (step 14). An inner declaration
  shadows an outer one.
- **IDs:**
  - an `id` exposes the component's API (its values and methods);
  - it is visible to the other components of the file, siblings included;
  - in `scoping.md`, a `Text` reads `textBox.value` from a sibling's
    subtree.
- **Where an ID registers.** An `id` alone doesn't create a container.
  Implicit containers (created by `var.*`) **forward `registerComponentApi`
  to their parent** (`Container.tsx:133`). So an ID registers in the
  nearest explicit container: the root of the file, or a user-defined
  component. The effect is that **IDs are scoped to the file, and their
  order doesn't matter.**
- **Shadowing:** in a container's state, variables (layer 5) shadow
  component APIs (layer 3).
- **APIs appear after mount;** until then, reads see `undefined`.
- **Context variables** (`$item`, `$param`, …) are injected by a
  component or the runtime. A `$`-name nobody injected is stripped from
  dependencies by XMLUI's optimizer (`expression-eval.md`).

## Design

### IDs are scoped to the file

- **The compiler collects every `id` of a file first, so order doesn't
  matter.** An `id` must be a constant identifier, without `$` (E011),
  and unique in the file (E010).
- **The file component (`Main`) creates a file scope**
  (`useFileScope(appScope, ids)`), with one entry per ID:
  - a getter reads the ID's **API signal**, tracked, so
    `{textBox.value}` re-evaluates when the TextBox registers or its value
    changes;
  - `undefined` until the component mounts.
- **Name resolution order:**
  1. locals;
  2. variables, innermost container first;
  3. file IDs;
  4. app globals;
  5. sandbox globals.

  A variable with the same name as a file ID is E012: it would hide the
  ID in its whole subtree, which can only be a mistake.
- **IDs are not writable** (C012). Changes go through API methods:
  `textBox.setValue('x')`.

### Component APIs: explicit opt-in, never a raw DOM node

- **The registrar.** `Bound` gives a component with an `id` a
  `registerApi` prop. The component publishes its API with
  `useComponentApi(registerApi, api)`, which registers after mount and
  unregisters on unmount.
- **Why not React's `ref`.** A component may forward a `ref` to a DOM
  element, and Mantine components do. A raw DOM node would then enter the
  scope, which breaks the sandbox invariant of step 3. `registerApi` is
  explicit and opt-in.
- **APIs are frozen** (`useComponentApi`), so script cannot replace their
  methods through an alias.
- **Reactive values** are getters over signals inside the component.
  `TextBox` keeps its text in a signal, which drives both rendering and
  `api.value`.

### New component: `TextBox`

| Part | Members |
|------|---------|
| Props | `initialValue`, `placeholder` |
| Event | `didChange` (`$param` is the new text) |
| API | `value`, `setValue(v)`, `focus()` |

Metadata gains `api`.

### Context variables

- **Unknown `$`-names** are a compile error with a specific message: C014,
  "context variable '$x' is not available here".
- **The names that exist today** are the handler locals `$param`,
  `$params` and `$cancel`.
- **Component-injected context variables** (`$item`, `$itemIndex`, …)
  belong to templates, which arrive in step 10 (`Items`, conditional
  rendering). Step 10 adds the metadata (`contextVars`), and the
  resolution path is ready for it.

### Diagnostics

| Code | Meaning |
|------|---------|
| E010 | Duplicate `id` in the file |
| E011 | Invalid `id` (not a constant identifier, or `$`-prefixed) |
| E012 | A variable has the same name as a component ID |
| C014 | Context variable not available here |

## Tests

- **Compiler:**
  - ID collection and emission;
  - resolution (variable over ID, ID visible from siblings and nested
    containers, order independence);
  - E010–E012, C012 (writing an ID), C014.
- **Runtime:**
  - the file scope (API signal, undefined before mount);
  - registration and unregistration through `Bound`;
  - frozen APIs.
- **Components (jsdom):**
  - typing in a TextBox updates a `Text` bound to `textBox.value`,
    including one declared before it and one in a nested container;
  - a handler calls `textBox.setValue`;
  - `onDidChange` with `$param`;
  - `focus()`.
- **E2E:** cross-component reads and writes by ID in the hello app.

## Outcome

Implemented as designed. Details: [`../docs/scoping.md`](../docs/scoping.md).

## Findings

- **IDs are file-scoped in XMLUI, by construction.** Implicit containers
  forward API registration to their parent (`Container.tsx:133`). pfui
  makes this explicit: the compiler collects IDs before compiling, and the
  file scope holds them.
- **The step 4 scope design held again.** An ID is a getter over a signal
  in the scope chain, so ID reads in bindings are tracked like variables.
  No new reactivity mechanism was needed.
- **`registerApi` instead of `ref`** keeps the sandbox invariant: a `ref`
  may end up on a DOM element (wrapped libraries forward refs), and a raw
  DOM node in scope would break the step 3 sandbox.
- **Context variables** need a component that owns a template. Only the
  resolution rule and C014 exist now. Component-injected `$item` etc.
  arrive with templates in step 10.

## Open for later steps

- Checking `box.member` against the component's `api` metadata at compile
  time (step 15).
- IDs inside templates (an `id` per rendered item; step 10).
- User-defined components stop variables and IDs at their boundary
  (step 14).
