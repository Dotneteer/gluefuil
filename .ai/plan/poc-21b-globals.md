# Step 21B: Global variables in user components

**Status:** Done

Part of [poc-steps.md](poc-steps.md), inserted between step 21 (routing)
and step 22 (forms). Forms will share state across user components (a
form's data, a dirty flag); without globals that state has to be passed
through props and events by hand.

## Goal

```xml
<!-- Main.gui -->
<App global.unsaved="{false}" global.session="{ { user: 'Ada' } }">
  <EditorPanel/>
  <Text>Unsaved: {unsaved}</Text>
</App>

<!-- components/EditorPanel.gui -->
<Component name="EditorPanel">
  <Text>Editing as {session.user}</Text>
  <Checkbox label="Dirty" initialValue="{unsaved}" onDidChange="(v) => unsaved = v"/>
</Component>
```

- A `global.*` variable (or `<global>`) on the root of `Main.gui` is
  visible in every file and every inline component, at any depth, without
  props. Reading it is reactive, and writing it from anywhere updates every
  reader.
- A user component's own name (a variable, a code-behind declaration, an
  ID) shadows a global of the same name.
- Part B: top-level `var` and `function` declarations in `Globals.xs`
  (beside `Main.gui`) are globals too.

## Background

### XMLUI

- **Docs.**
  - `website/content/docs/pages/scoping.md`, lines 146–210: a global
    declared on the root of `Main.xmlui`, or in `Globals.xs`, "is visible in
    all files and inline components at any level". Local variables can
    shadow it. Assigning an undeclared name is a runtime error toast.
  - `pages/markup.md`, lines 359–394: globals can be declared only on the
    root of `Main.xmlui` or in `Globals.xs`; anywhere else is an error.
  - `pages/howto/manage-app-wide-state-with-reactive-globals.md`: the
    pattern (reassign the whole object), and when to prefer `var.` on a
    common ancestor.
- **Source.**
  - `xmlui/src/components-core/state/global-variables.ts`: globals are
    passed down the render tree at runtime (`globalVars`). They can depend
    on each other, and a runtime write overrides the initial expression.
  - `xmlui/src/components-core/rendering/ComponentWrapper.tsx`, line 108 and
    after: narrows `globalVars` per node so that unrelated global changes
    don't re-render it.
  - Names are not checked at compile time.

### Here

- `global.x` / `<global>` already compiles, but only as a variable of the
  root element. It is allowed only there (E006) and is not visible inside
  user components ([../docs/modules.md](../docs/modules.md), line 131).
- **Names resolve at compile time** ([../docs/scoping.md](../docs/scoping.md)).
  A user component sees only its own names, `$props`/`$self`/…, app globals
  and sandbox globals; anything else is C001. So **the compiler of a
  component file has to know the global names.**
- **Each component file compiles separately:**
  - the Vite plugin's `transform`, with the other files' interfaces
    (`userComponents`);
  - the standalone loader, after fetching `Main.gui` and the component files
    it uses.
- **At runtime** a user component's scope (`useComponent`,
  `runtime/src/render/user-components.ts`) inherits from its module's root
  scope, `createAppScope()` (the app globals). Variables are accessors
  resolved through the prototype chain, so a child scope reads and writes a
  parent's variable as plain JavaScript (`$$s.count++`).
- **The playground has several app files** (`playground/src/layouts/*.gui`)
  sharing one components folder.

## Options considered

1. **Runtime only, as XMLUI.** Drop compile-time checking for unknown names
   in component files. Rejected: C001 for a typo is one of the main benefits
   of compiling.
2. **A module-level global store in the runtime,** read by name. Rejected:
   it outlives the App (tests, the prerender's routes, two apps on a page)
   and needs its own reset.
3. **Chosen: the compiler learns the global names; React context carries
   the global scope.** The app's root provides a scope object holding only
   the globals; `useComponent` uses it as its parent instead of the module's
   app scope. Reads, writes, deep writes and shadowing then work through the
   existing prototype chain, with no new code paths in generated handlers.

## Design

### Declaring (the app file)

- **Unchanged:**
  - `global.x` and `<global name="x">` on the root of an app file;
  - E006 anywhere else, including `<Component>`;
  - E007 for a duplicate (a `var.x` and a `global.x` on the root);
  - E012 for a name that is also an ID.
- **The root's globals become their own container, outside its `var.*`:**
  `<App global.a var.b>` compiles as if `a` were declared on a wrapper
  around the App. The wrapper's scope holds only the globals (over the app
  scope); that is what the user components get. The root's `var.*` and the
  app's code-behind (`Main.gui.xs`, local to Main, as in XMLUI) stay in
  the inner scope.
  - **Consequence:** a global's initializer can read other globals but not
    the root's `var.*` (C001). The other way round works. XMLUI evaluates
    globals in a separate pass too (`useGlobalVariables`), so this matches
    it in practice.
- **The wrapper provides the scope** with a runtime component,
  `GlobalScope` (`runtime/src/render/global-scope.ts`): a React context
  provider of the globals' scope object. Only the app root renders it.

### Using (any file)

- **`useComponent`** takes `useContext(GlobalScopeContext) ?? appScope` as
  its parent. Without an App that declares globals, nothing changes.
- **Name resolution in a `<Component>` body** gains one rank, below the
  component's own names and above the app globals:

  | # | Kind |
  |---|------|
  | 1–3 | Locals, the component's variables and code-behind, context variables, its IDs, `$props`/`$self`/… (unchanged) |
  | **3b** | **Global variable** (writable, like a variable) |
  | 4–5 | App globals, sandbox globals (unchanged) |

  So the component's own names shadow a global, as XMLUI's docs say.
  Generated code is the same as for a variable (`$$s.unsaved = v`); the
  prototype chain finds the global.
- **Inline components** in `Main.gui` get the same names; the compiler
  takes them from the file's own root.
- **Slot content** a caller passes in is compiled in the caller's scope, as
  today; in `Main.gui` it sees the globals anyway.

### Telling each file the names

- **The compiler:** `compileModule(source, { globals })`, where `globals`
  is a list of names. `analyzeModule` returns `globals` for an app file.
- **The Vite plugin:**
  - **One app's globals per project.** A new plugin option `entry`
    (default `src/Main.gui`) names the app file whose globals every other
    file sees. `prerender.entry` defaults to it.
  - `transform` of any other `.gui` file analyzes the entry (cached by its
    source text), passes `globals`, and calls `addWatchFile(entry)`, so a
    changed global list recompiles the components in dev.
  - Other app files (the playground's layout pages) may still declare
    globals for themselves and their inline components; component files
    don't see those (C001 if used). Recorded as a limit.
- **The standalone loader:** it already fetches the entry first. It passes
  the entry's `globals` to every component file's compile, and adds them to
  that file's cache hash: a cached component compiled against other globals
  must not be reused.

### Errors

- **A global used in a component file but not declared** is C001 at compile
  time (XMLUI: a runtime error toast on assignment, nothing on a read).
- **A component file rendered by an app that doesn't provide the global**
  (the entry declares it, another app page uses the component): a read gives
  `undefined`, and a write throws (the app scope is frozen and has no such
  name). Not detectable at
  compile time with one entry; recorded as a limit.

### Part B: `Globals.xs`

- **The file** sits beside the entry (`src/Globals.xs`, standalone: beside
  `Main.gui`). It uses the code-behind language: top-level `var` (a global
  variable) and `function` (a global function, read-only, C012 on
  assignment, as code-behind functions). Nothing else is allowed at the top
  level (the code-behind rules).
- **Compiling:** `compileModule(main, { globalsCode })` compiles it into
  the entry's global container, next to `global.*`. Its functions see only
  the globals, not Main's `var.*`. Its diagnostics come back as
  `globalsDiagnostics`, with `Globals.xs` positions; the plugin and the
  loader report them like `.gui.xs` diagnostics.
- **The names** join `analyzeModule(...).globals`, so component files see
  them. A name declared both in markup and in `Globals.xs` is E007.
- **Cost:** the code-behind parser, its checks and the scope entries exist.
  New are the second diagnostics channel in the plugin and the loader, the
  file's watch in dev, and the cache key. About a third of the step.

### Divergences from XMLUI (proposed)

1. **An unknown name in a component file is a compile error,** not a
   runtime toast.
2. **One app's globals are visible to component files:** the plugin's
   `entry`. XMLUI has one `Main.xmlui` per app, so the case doesn't arise
   there.
3. **A global's initializer can't read the root's `var.*`.**
4. **No per-node narrowing of globals** (`ComponentWrapper.tsx`): each
   reader subscribes to the signals it reads, so a change re-renders only
   the readers of that global already.

## Steps

Part A: `global.*` in markup.

- [x] Compiler: the root's globals as their own container, which renders
      `GlobalScope`; `analyzeModule` returns `globals`; the `globals` option
      and rank 3b in component bodies (inline and file).
- [x] Runtime: `GlobalScopeContext`/`GlobalScope`; `useComponent` takes
      its parent from the context.
- [x] Vite plugin: the `entry` option, the entry's globals for every other
      file, `addWatchFile`.
- [x] Standalone loader: the entry's globals for component files, in the
      cache hash.
- [x] Playground: the routing scenario's "unsaved changes" becomes a global;
      `RoutingScenario` drops its `onUnsavedChange` event.

Part B: `Globals.xs`.

- [x] Compiler: `globalsCode`, `globalsDiagnostics`, its names in
      `globals`, E007 across markup and `Globals.xs`.
- [x] Vite plugin and standalone loader: read the file, report its
      diagnostics, watch it (dev), key the cache.

Both:

- [x] Docs: `scoping.md` (rank 3b), `modules.md` (line 131 and the codes),
      `user-components.md` (isolation), `build-time.md` (`entry`),
      `standalone.md`; `code-structure.md`.
- [x] `npm run check`.

## Verification

- **Compiler (conformance tables):**
  - a global read and written from a component file, from an inline
    component, from a nested component inside another component;
  - shadowing by a component's `var.*`, by its code-behind `var`, by its
    ID;
  - C001 for an undeclared global in a component file;
  - a global initializer reading another global (allowed) and a root
    `var.*` (C001);
  - E006 and E007 unchanged; `analyzeModule(...).globals`.
- **Components (jsdom):** a user component writes a global that Main and a
  second component read; a component's shadowing `var` doesn't touch the
  global; two mounted apps don't share globals; without a provider, a read
  is `undefined`.
- **Plugin:** the `entry` option; a component file's transform gets the
  entry's globals and watches the entry.
- **Standalone:** the cache misses when the entry's globals change.
- **Part B:** `Globals.xs` variables and functions from a component; a
  function writing a global; its diagnostics at `Globals.xs` positions;
  E007 across the two places.
- **E2E:** in the hello app (dev and build, prerendered): a user component
  writes a global that Main shows and another component reads, also after
  the takeover of the prerendered HTML. The playground's routing scenario
  keeps passing with the global.

## Decisions (the user's answers)

1. **`Globals.xs` is included** (part B).
2. **Component files see the globals declared in `Globals.xs` or on the
   root of `Main.gui`** (the plugin's `entry`), not those of other app files.
3. **A global's initializer can't read the root's `var.*`:** accepted.

## Outcome

Implemented as designed. `npm run check`: 2,392 unit tests in 83 files
(+62), 169 E2E tests (+2), no warnings. Details:
[../docs/scoping.md § Globals](../docs/scoping.md#globals).

- **Compiler:** `analyzeModule(...).globals` (`rootGlobalNames`,
  `globalsCodeNames`); `compileModule` options `globals` and `globalsCode`,
  result `globalsDiagnostics`; `globalContainer` (the root's globals and
  `Globals.xs` in a container that renders `GlobalScope`); rank 3b in
  component bodies (`visibleNames`/`visibleVariables`).
- **Runtime:** `GlobalScope`/`useGlobalScope`; `useComponent`'s parent.
- **Vite plugin:** `entry` (also the prerender's default), `AppGlobals`,
  watching the entry and `Globals.xs`, `Globals.xs` errors at its positions.
- **Standalone:** fetches `Globals.xs`; the globals are in the cache hash.
- **Hello app:** `global.likes`, `src/Globals.xs`, `LikeButton`,
  `LikeCount`; `e2e/globals.spec.ts` in dev and on the prerendered build.
- **Playground:** `unsavedChanges` and `navigationLog` are globals;
  `RoutingScenario` reads and writes them (no props, no event).

## Findings

- **A shadowed global must stop being writable.** A component's ID, a
  template's ID or a code-behind function of the same name is read-only;
  without a check the compiler would have accepted `count = 1` and the
  runtime would have thrown. `visibleVariables` drops a global that a
  read-only name of the component shadows (C012).
- **A broken `Globals.xs` can hide behind the components' errors.** Component
  files compile first (the entry needs them loaded), so a `Globals.xs` that
  declares nothing usable shows up as C001 in the first component that uses
  a global. Its own error appears once it parses. Kept as is.
- **No "did you mean" for an unknown name:** C001 never had one; the draft
  of this plan assumed it did.

## Deviations from this plan

- A `Globals.xs` name that is also a `global.*` is reported as E019
  ("declared twice", the code-behind's code) rather than E007; one that is
  also a root `var.*` or a `Main.gui.xs` declaration is E007.
