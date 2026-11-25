# Step 17: Theming

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Theme definitions (`extends`, light and dark tones, derived tokens,
`$references`) compile to CSS custom properties `--gfui-*`. Components
consume XMLUI-style theme variables (`backgroundColor-Button`). A `<Theme>`
element scopes overrides, a tone, or another theme. The app switches tones
at runtime.

**Step 16 (Mantine) was skipped at the user's request.** Theme variables
therefore style our own built-ins, through a small stylesheet.
Mapping the variables onto Mantine's `--mantine-*` variables and Styles API
parts moves to step 16, whenever it is done. The theme engine doesn't depend
on how components consume the variables.

## Background (XMLUI)

Sources:
- `.ai/xmlui/theming-styling.md`;
- `website/content/docs/reference/components/Theme.md`;
- `pages/globals.md` (`activeThemeTone`, `setThemeTone`, `toggleThemeTone`,
  `activeThemeId`, `setTheme`).

- **The pipeline:** a theme chain (`extends`, with root first) → base
  variables merged left to right → the active tone's variables → derived
  tokens (spacing scale, color tones, …) → `$name` becomes
  `var(--xmlui-name)` → CSS variables.
- **Component defaults** (`defaultThemeVars` in metadata) come first in the
  merge.
- **Naming:** `property[-part][-Component][-variant][--state]`, as in
  `backgroundColor-Button--hover`.
- **`<Theme>`** takes `tone`, `themeId`, and theme variables as attributes.
  - It injects the **full** compiled set when the tone or theme changes or
    a base variable (no component segment) is overridden. A CSS variable
    is resolved where it is declared, so derived values must be
    recomputed in the scope.
  - Otherwise it injects only the overrides.
- **XMLUI computes concrete colors** for its 13-tone palettes in
  JavaScript.

## Design

### The engine (`components/src/theming/`, React-free, pure)

- **`ThemeDefinition`:** `{ id, extends?, themeVars?, tones?: { light?, dark? } }`.
- **`compileTheme({ themeId, tone, themes, componentDefaults })`:**
  - `Record<"--gfui-name", value>`;
  - merge order: component defaults → root → … → the theme (base
    variables), then the same chain's tone variables;
  - derived tokens; `$ref` resolution.
- **Derived tokens:**
  - **Spacing:** `space-0` … `space-12` as `calc(var(--gfui-space-base) * n)`.
  - **Color tones:** for every `color-<family>`, tones `50` … `950`. Each
    is a CSS `color-mix(in srgb, var(--gfui-color-<family>) p%, white|black)`.
    Unlike XMLUI's JavaScript color math, they follow a runtime change of
    the base color.
- **Built-in themes:** `gfui` (the default), plus `gfui-green` and `gfui-red`,
  which change `color-primary`. All extend the root theme, which holds the
  tokens (colors, surface, spacing, radius, typography) and their light and
  dark tones.
- **`themeVariableNames()`** lists every known variable. The compiler uses
  it to check `<Theme>` attributes.
- **It lives in the components package** (React-free, under `./metadata`),
  so the compiler can read it and the runtime stays generic.

### Component theme variables

- `ComponentMetadata.themeVars?: Record<string, string>` holds the
  defaults (`"backgroundColor-Button": "$color-primary-500"`).
- **One stylesheet** (`components/src/styles.ts`) reads the variables:
  `.gfui-Button { background-color: var(--gfui-backgroundColor-Button) }`,
  with `:hover` and `:focus` states.
- **`App` renders it** as `<style href="gfui-base" precedence="gfui">`.
  React 19 hoists and dedupes it: on the server it is emitted before the
  app's HTML, so the prerendered page is styled without JavaScript.

### Runtime theme state (`runtime/src/render/theme-state.ts`)

- **Signals:** the explicit theme ID and tone, plus the app's defaults
  (`App defaultTheme`/`defaultTone`).
- **App globals** (compiler `APP_GLOBALS`, checked by the drift test):
  - `activeThemeId` and `activeThemeTone`, reactive;
  - `setTheme(id)`, `setThemeTone(tone)` and `toggleThemeTone()`.
- **One state per page:** the state is shared by every app on the page,
  as the app globals are.

### Components

- **`App`:**
  - props `defaultTheme` (an enum of the built-in themes) and `defaultTone`
    (`light | dark`);
  - it renders the compiled variables of the active theme and tone as
    inline custom properties on `.gfui-App`, plus the stylesheet.
- **`Theme`:**
  - props `themeId`, `tone`, and any theme variable as an attribute (a
    literal or a binding, with `$refs`);
  - it renders `<div class="gfui-Theme" style="display: contents; …">`;
  - it injects the full set or only the overrides, by XMLUI's rule.

### Contracts

- **`<Theme>` attributes** other than its props must be known theme
  variables: E025 "unknown theme variable", with a suggestion.
- `defaultTone`, `tone` and `defaultTheme` are enums.

### Not in this step

- Custom theme files (`themes/*.json`) and fonts or resources.
- Layout props with `$space-2` values: step 19.
- Variants, parts, and the Mantine mapping (step 16).

## Tests

- **Unit, the theme compilation tables:**
  - chains and cycles, merge order, tone overlays, derived tokens;
  - `$ref` resolution;
  - component defaults, names;
  - the `Theme` injection rule.
- **Unit, components:** `App` and `Theme` render the right variables; the
  tone globals; E025.
- **E2E (hello app, dev and prerendered build):** computed styles.
  - A Button's background follows its theme variable.
  - A scoped `<Theme backgroundColor-Button>` changes only its subtree.
  - `toggleThemeTone()` switches the app's background and text colors.
  - A `<Theme tone="dark">` region stays dark.
  - Takeover is still DOM-stable.

## Outcome

Implemented as designed. Details: [`../docs/theming.md`](../docs/theming.md).

- **The hello app has a theming section:** a tone toggle, a scoped
  `Theme` override, and a dark region. In Chromium, both on the dev server
  and in the prerendered build:
  - computed styles follow the variables;
  - the toggle switches the app's background and text;
  - the dark region stays dark;
  - takeover remains DOM-stable.
- `npm run check` after this step: 1,844 unit tests in 60 files and
  53 E2E tests.

## Findings

- **React 19's hoisted `<style href precedence>` solves stylesheet
  delivery for static generation.**
  - The server emits it ahead of the app (measured with
    `renderToString`), the client dedupes it into `<head>`, and hydration
    adopts it without DOM changes.
  - There is no separate CSS file and no injection code.
- **Theme variables are inline custom properties on `.gfui-App`** (about
  150 for the built-in theme). They serialize with server rendering and
  hydrate like any attribute.
- **`color-mix()` instead of JavaScript color math:** the derived tones
  follow a runtime change of the base color (a `<Theme color-primary="…">`
  recomputes all derived variables in its scope, as XMLUI's rule
  requires).
- **The production bundle now includes the React-free metadata module:**
  `App` needs the components' theme defaults at runtime. The compiler
  itself still stays out (checked by `tools/build-output.test.ts`).
- **The tone and theme are app-wide signals in the runtime:** the runtime
  stays independent of the engine, which lives in the components package
  where the compiler can read it.

## Open for later steps

- Mapping the variables onto Mantine (step 16).
- Custom theme files, fonts and resources.
- Variants and parts (`backgroundColor-Button-primary`, `color-label-Input`).
- Layout props with `$space-*` values (step 19).
- Following the system tone (`prefers-color-scheme`).
