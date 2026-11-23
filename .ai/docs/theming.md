# Theming

> Subsystem reference: theme definitions compiled to `--pfui-*` CSS custom
> properties, how components consume them, `<Theme>` scopes, and tone and
> theme switching. Describes the code as it is. Design and XMLUI comparison:
> [`../plan/poc-17-theming.md`](../plan/poc-17-theming.md).
>
> **Last updated:** step 17.

## Using it

```xml
<App defaultTone="dark" defaultTheme="pfui-green">
  <Button label="Toggle" onClick="toggleThemeTone()"/>
  <Text>{activeThemeTone}</Text>
  <Theme backgroundColor-Button="$color-danger-500">   <!-- this subtree only -->
    <Button label="Delete"/>
  </Theme>
  <Theme tone="light"><Text>always light</Text></Theme>
</App>
```

**App globals** (runtime `theme-state.ts`; compiler `APP_GLOBALS`):

| Global | What it is |
|--------|------------|
| `activeThemeTone` | `"light"` or `"dark"` (reactive) |
| `activeThemeId` | `"pfui"`, `"pfui-green"`, `"pfui-red"` (reactive) |
| `toggleThemeTone()` | Switches the tone |
| `setThemeTone(t)` | Sets the tone; anything else throws |
| `setTheme(id)` | Sets the theme |

An explicit choice wins over `App defaultTone` / `defaultTheme`. The state is
shared by every app on the page, as all app globals are.

## The engine (`components/src/theming/engine.ts`, React-free)

The pipeline is `themeVariables()`, then `compileTheme()`:

1. **Merge, left to right:**
   1. the component defaults (each metadata's `themeVars`);
   2. the **chain's base variables:** root first, then `extends` parents
      depth-first in order, each once, then the theme;
   3. the **chain's tone variables**, in the same order: a tone variable
      beats every base variable, as in XMLUI;
   4. the overrides.
2. **Derived tokens** (`derivedTokens`). An explicit variable always wins
   over a derived one.
   - **Spacing:** `space-0`, `space-0_5` … `space-12` =
     `calc(var(--pfui-space-base) * n)`.
   - **Color tones:** for every `color-<family>`, `color-<family>-50` …
     `-950`, using `color-mix(in srgb, var(--pfui-color-<family>) p%,
     white|black)`; tone 500 is the color itself. **This differs from
     XMLUI,** which computes concrete colors in JavaScript. CSS mixing
     follows a runtime change of the base color.
3. **`$name` → `var(--pfui-name)`** anywhere in a value (`resolveRefs`).
4. **The prefix:** `--pfui-name`.

- **Errors:** an unknown theme or an `extends` cycle throws `ThemeError`.
- **Names** follow XMLUI's convention, `property[-part][-Component][-variant][--state]`.
  `isComponentVariable` tells component variables (a PascalCase segment)
  from base variables.

**Built-in themes** (`themes.ts`):

| Theme | What it sets |
|-------|--------------|
| `root` | The tokens: colors (primary, secondary, success, warn, danger, surface), `space-base`, `fontFamily`, `fontSize`, `lineHeight`, `borderRadius`. Light and dark tones of `backgroundColor`, `textColor`, `textColor-secondary`, `borderColor`. |
| `pfui` (the default), `pfui-green`, `pfui-red` | Change `color-primary` |

## Components

- **The stylesheet:** `styles.ts` reads every visual value from a theme
  variable (`.pfui-Button { background-color:
  var(--pfui-backgroundColor-Button) }`, `:hover`, `:focus`).
  - The defaults are in each metadata's `themeVars` (`"backgroundColor-Button": "$color-primary-500"`).
  - `componentThemeDefaults()` merges them, and `themeVariableNames()`
    lists every known name.
- **`App`** (`theme.tsx`):
  - it sets the theme defaults during render, so a server render uses them
    too;
  - it puts the compiled active theme on `.pfui-App` as inline custom
    properties, with `data-tone`;
  - it renders the stylesheet as `<style href="pfui-base" precedence="pfui">`.
    React 19 hoists and dedupes it: on the client into `<head>`, on the
    server ahead of the app's HTML. A prerendered page is styled without
    JavaScript, and takeover stays DOM-stable (E2E).
- **`Theme`** (`<div class="pfui-Theme" style="display: contents; …">`):
  - props `themeId`, `tone` (enums), plus any theme variable as an
    attribute, literal or bound;
  - **`scopedThemeVars` decides what it injects**, by XMLUI's rule:
    - a theme, a tone, or a base variable recompiles the **full** set in
      the scope, because a CSS variable resolves where it is declared;
    - otherwise only the overrides go in.
  - Without its own tone, it follows the app's.

## Contracts

- **E025:** a `<Theme>` attribute that is neither a prop nor a known
  theme variable (with "did you mean"). `themeVarAttributes` in the
  metadata turns the check on.
- `tone`, `themeId`, `defaultTone` and `defaultTheme` are enums (E023).

## Files

| File | Contents |
|------|----------|
| `components/src/theming/engine.ts` | `themeChain`, `themeVariables`, `compileTheme`, `derivedTokens`, `resolveRefs`, `isComponentVariable`, `scopedThemeVars`, `ThemeDefinition`, `ThemeError` |
| `components/src/theming/themes.ts` | `ROOT_THEME`, `BUILT_IN_THEMES`, `THEME_IDS`, `DEFAULT_THEME` |
| `components/src/metadata.ts` | `themeVars` defaults, `componentThemeDefaults`, `themeVariableNames`; re-exports the engine |
| `components/src/styles.ts` | `BASE_STYLESHEET` |
| `components/src/theme.tsx` | `App`, `Theme` |
| `runtime/src/render/theme-state.ts` | The theme and tone signals, the app globals, `setThemeDefaults`, `resetThemeState` |

## Tests

| File | Covers |
|------|--------|
| `components/tests/theming.test.ts` | The compilation tables: chains and errors, merge order with tones, derived tokens, references, the injection rule, the built-in themes, `themeVariableNames` |
| `components/tests/theme-components.test.tsx` | `App` variables and stylesheet, `defaultTone`/`defaultTheme`, the globals, `Theme` (overrides, bound values, tone, `themeId`, base variables, following the app) |
| `compiler/tests/module/contracts.test.ts` | E025, the theme enums, the globals compile |
| `e2e/theming.spec.ts` (dev and build) | Computed styles: a Button follows its variable, a scoped `Theme`, tone switching, a dark region |
