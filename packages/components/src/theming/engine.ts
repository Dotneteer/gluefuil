// The theme engine (step 17): theme definitions to CSS custom properties.
// React-free and pure: the compiler reads it (theme variable names), the
// components use it (App, Theme). Design: .ai/plan/poc-17-theming.md
//
// Pipeline (as XMLUI's, .ai/xmlui/theming-styling.md):
//   component defaults → theme chain (root first, `extends`) base variables
//   → the chain's tone variables → derived tokens → `$ref` → var(--pfui-ref)

export type Tone = "light" | "dark";

export const TONES: readonly Tone[] = ["light", "dark"];

/** The CSS custom property prefix: `--pfui-backgroundColor-Button`. */
export const THEME_VAR_PREFIX = "--pfui-";

export interface ThemeDefinition {
  id: string;
  /** Parent themes, applied before this one (in order). Every chain starts with the root theme. */
  extends?: string | readonly string[];
  /** Variables, by name without the prefix: `"color-primary": "#2563eb"`. */
  themeVars?: Readonly<Record<string, string>>;
  /** Variables for one tone, applied after all base variables of the chain. */
  tones?: Partial<Record<Tone, { themeVars?: Readonly<Record<string, string>> }>>;
}

export class ThemeError extends Error {
  override name = "ThemeError";
}

/** The chain of a theme: root first, then parents (depth-first, in `extends` order), then the theme. */
export function themeChain(themeId: string, themes: ReadonlyMap<string, ThemeDefinition>, rootId = "root"): ThemeDefinition[] {
  const chain: ThemeDefinition[] = [];
  const visiting = new Set<string>();
  const added = new Set<string>();
  const visit = (id: string) => {
    if (added.has(id)) return;
    if (visiting.has(id)) throw new ThemeError(`Theme '${id}' extends itself (${[...visiting, id].join(" → ")})`);
    const theme = themes.get(id);
    if (!theme) throw new ThemeError(`Unknown theme '${id}'`);
    visiting.add(id);
    const parents = theme.extends === undefined ? [] : typeof theme.extends === "string" ? [theme.extends] : theme.extends;
    for (const parent of id === rootId ? [] : [rootId, ...parents]) visit(parent);
    visiting.delete(id);
    added.add(id);
    chain.push(theme);
  };
  visit(themeId);
  return chain;
}

/** Color tones derived for every `color-<family>` variable. */
export const COLOR_TONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Spacing steps derived from `space-base`. */
export const SPACE_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12] as const;

/** `space-1_5` (dots become underscores, as in XMLUI). */
export const spaceName = (step: number) => `space-${String(step).replace(".", "_")}`;

/**
 * Derived tokens: `space-*` from `space-base`, `color-<family>-<tone>` from
 * each `color-<family>`. Colors use `color-mix()`, so they follow the base
 * color at runtime. A tone 500 is the color itself; lighter tones mix in
 * white, darker ones black.
 */
export function derivedTokens(vars: Readonly<Record<string, string>>): Record<string, string> {
  const derived: Record<string, string> = {};
  if ("space-base" in vars) {
    for (const step of SPACE_STEPS) derived[spaceName(step)] = step === 0 ? "0" : `calc(var(${THEME_VAR_PREFIX}space-base) * ${step})`;
  }
  for (const name of Object.keys(vars)) {
    const family = /^color-([a-z][a-zA-Z0-9]*)$/.exec(name)?.[1];
    if (!family) continue;
    const base = `var(${THEME_VAR_PREFIX}color-${family})`;
    for (const tone of COLOR_TONES) {
      derived[`color-${family}-${tone}`] =
        tone === 500
          ? base
          : tone < 500
            ? `color-mix(in srgb, ${base} ${Math.round((tone / 500) * 100)}%, white)`
            : `color-mix(in srgb, ${base} ${Math.round(((1000 - tone) / 500) * 100)}%, black)`;
    }
  }
  return derived;
}

/** `$color-primary-500` → `var(--pfui-color-primary-500)`, anywhere in a value. */
export function resolveRefs(value: string): string {
  return value.replace(/\$([a-zA-Z][a-zA-Z0-9_]*(?:-{1,2}[a-zA-Z0-9_]+)*)/g, (_, name: string) => `var(${THEME_VAR_PREFIX}${name})`);
}

export interface CompileThemeOptions {
  themeId: string;
  tone: Tone;
  themes: ReadonlyMap<string, ThemeDefinition>;
  /** Defaults declared by components (metadata `themeVars`); every theme can override them. */
  componentDefaults?: Readonly<Record<string, string>>;
  /** Overrides applied last (a `<Theme>` element's attributes). */
  overrides?: Readonly<Record<string, string>>;
}

/** The variables of a theme in a tone, by name without the prefix, before `$ref` resolution. */
export function themeVariables(options: CompileThemeOptions): Record<string, string> {
  const chain = themeChain(options.themeId, options.themes);
  const vars: Record<string, string> = { ...options.componentDefaults };
  for (const theme of chain) Object.assign(vars, theme.themeVars);
  for (const theme of chain) Object.assign(vars, theme.tones?.[options.tone]?.themeVars);
  Object.assign(vars, options.overrides);
  // Derived tokens never replace a variable set explicitly.
  return { ...derivedTokens(vars), ...vars };
}

/** The CSS custom properties of a theme in a tone: `{ "--pfui-color-primary": "#2563eb", … }`. */
export function compileTheme(options: CompileThemeOptions): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(themeVariables(options))) result[`${THEME_VAR_PREFIX}${name}`] = resolveRefs(value);
  return result;
}

/** A component-scoped variable names a component (a PascalCase segment): `backgroundColor-Button--hover`. */
export function isComponentVariable(name: string): boolean {
  return name.split(/-{1,2}/).some((segment) => /^[A-Z]/.test(segment));
}

/**
 * What a `<Theme>` element injects (XMLUI ThemeNative's rule). A different
 * theme or tone, or a base-variable override (`color-primary`), changes values
 * other variables are computed from, and a CSS variable resolves where it is
 * declared: the full set is recompiled in the scope. Otherwise only the
 * overrides.
 */
export function scopedThemeVars(options: CompileThemeOptions & { changesThemeOrTone: boolean }): Record<string, string> {
  const overrides = options.overrides ?? {};
  if (options.changesThemeOrTone || Object.keys(overrides).some((name) => !isComponentVariable(name))) return compileTheme(options);
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(overrides)) result[`${THEME_VAR_PREFIX}${name}`] = resolveRefs(value);
  return result;
}
