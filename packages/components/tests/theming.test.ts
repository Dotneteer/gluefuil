// The theme engine (step 17): compilation tables. Pure; no React.
import { describe, expect, test } from "vitest";
import { componentThemeDefaults, themeVariableNames } from "../src/metadata";
import {
  compileTheme,
  derivedTokens,
  isComponentVariable,
  resolveRefs,
  scopedThemeVars,
  themeChain,
  themeVariables,
  type ThemeDefinition,
} from "../src/theming/engine";
import { BUILT_IN_THEME_MAP } from "../src/theming/themes";

const themes = (...list: ThemeDefinition[]) => new Map([{ id: "root" } as ThemeDefinition, ...list].map((t) => [t.id, t]));

describe("theme chains", () => {
  test.each<[label: string, map: Map<string, ThemeDefinition>, id: string, chain: string[]]>([
    ["root alone", themes(), "root", ["root"]],
    ["a theme without extends still starts at the root", themes({ id: "a" }), "a", ["root", "a"]],
    ["one parent", themes({ id: "a" }, { id: "b", extends: "a" }), "b", ["root", "a", "b"]],
    ["several parents, in order, each once", themes({ id: "a" }, { id: "b", extends: "a" }, { id: "c", extends: ["b", "a"] }), "c", ["root", "a", "b", "c"]],
  ])("%s", (_, map, id, chain) => {
    expect(themeChain(id, map).map((t) => t.id)).toEqual(chain);
  });

  test("cycles and unknown themes are errors", () => {
    expect(() => themeChain("a", themes({ id: "a", extends: "b" }, { id: "b", extends: "a" }))).toThrow("Theme 'a' extends itself (a → b → a)");
    expect(() => themeChain("nope", themes())).toThrow("Unknown theme 'nope'");
    expect(() => themeChain("a", themes({ id: "a", extends: "nope" }))).toThrow("Unknown theme 'nope'");
  });
});

describe("merging", () => {
  const map = themes(
    { id: "base", themeVars: { a: "base", b: "base", c: "base" }, tones: { dark: { themeVars: { b: "base-dark" } } } },
    { id: "child", extends: "base", themeVars: { a: "child", c: "child" }, tones: { dark: { themeVars: { c: "child-dark" } } } },
  );

  test.each<[tone: "light" | "dark", expected: Record<string, string>]>([
    ["light", { a: "child", b: "base", c: "child", d: "default" }],
    // Tone variables come after every base variable of the chain (as in XMLUI).
    ["dark", { a: "child", b: "base-dark", c: "child-dark", d: "default" }],
  ])("component defaults, then the chain's base variables, then its %s tone", (tone, expected) => {
    expect(themeVariables({ themeId: "child", tone, themes: map, componentDefaults: { a: "default", d: "default" } })).toEqual(expected);
  });

  test("overrides come last", () => {
    expect(themeVariables({ themeId: "child", tone: "dark", themes: map, overrides: { c: "mine" } }).c).toBe("mine");
  });
});

describe("derived tokens", () => {
  test("spacing from space-base", () => {
    const derived = derivedTokens({ "space-base": "4px" });
    expect(derived["space-0"]).toBe("0");
    expect(derived["space-1_5"]).toBe("calc(var(--gfui-space-base) * 1.5)");
    expect(derived["space-12"]).toBe("calc(var(--gfui-space-base) * 12)");
    expect(Object.keys(derivedTokens({}))).toEqual([]);
  });

  test("color tones from each color-<family>, mixed in CSS", () => {
    const derived = derivedTokens({ "color-brand": "#123456", "color-brand-500": "ignored: not a family" });
    expect(derived["color-brand-500"]).toBe("var(--gfui-color-brand)");
    expect(derived["color-brand-100"]).toBe("color-mix(in srgb, var(--gfui-color-brand) 20%, white)");
    expect(derived["color-brand-900"]).toBe("color-mix(in srgb, var(--gfui-color-brand) 20%, black)");
    expect(Object.keys(derived).filter((k) => k.startsWith("color-brand-500-"))).toEqual([]);
  });

  test("an explicit variable wins over a derived one", () => {
    const vars = themeVariables({ themeId: "a", tone: "light", themes: themes({ id: "a", themeVars: { "color-x": "red", "color-x-100": "pink" } }) });
    expect(vars["color-x-100"]).toBe("pink");
    expect(vars["color-x-200"]).toContain("color-mix");
  });
});

describe("references", () => {
  test.each([
    ["$color-primary-500", "var(--gfui-color-primary-500)"],
    ["1px solid $borderColor", "1px solid var(--gfui-borderColor)"],
    ["$space-1_5 $space-3", "var(--gfui-space-1_5) var(--gfui-space-3)"],
    ["$backgroundColor-Button--hover", "var(--gfui-backgroundColor-Button--hover)"],
    ["#ffffff", "#ffffff"],
    ["$", "$"],
    ["price: 5$", "price: 5$"],
  ])("%s", (value, expected) => {
    expect(resolveRefs(value)).toBe(expected);
  });

  test("compileTheme prefixes names and resolves references", () => {
    const css = compileTheme({ themeId: "a", tone: "light", themes: themes({ id: "a", themeVars: { x: "$y", y: "1px" } }) });
    expect(css).toEqual({ "--gfui-x": "var(--gfui-y)", "--gfui-y": "1px" });
  });
});

describe("scoped <Theme> variables (XMLUI's injection rule)", () => {
  const options = { themeId: "gfui", tone: "light" as const, themes: BUILT_IN_THEME_MAP, componentDefaults: componentThemeDefaults() };

  test.each([
    ["backgroundColor-Button", true],
    ["backgroundColor-Button--hover", true],
    ["color-label-Input", true],
    ["color-primary", false],
    ["space-base", false],
    ["textColor-secondary", false],
  ])("isComponentVariable(%s) = %s", (name, expected) => {
    expect(isComponentVariable(name)).toBe(expected);
  });

  test("component variables only: just the overrides", () => {
    expect(scopedThemeVars({ ...options, overrides: { "backgroundColor-Button": "$color-danger-500" }, changesThemeOrTone: false })).toEqual({
      "--gfui-backgroundColor-Button": "var(--gfui-color-danger-500)",
    });
  });

  test("a base variable, a tone or a theme: the full set, recomputed in the scope", () => {
    const base = scopedThemeVars({ ...options, overrides: { "color-primary": "green" }, changesThemeOrTone: false });
    expect(base["--gfui-color-primary"]).toBe("green");
    expect(base["--gfui-backgroundColor-Button"]).toBe("var(--gfui-color-primary-500)");
    const dark = scopedThemeVars({ ...options, tone: "dark", changesThemeOrTone: true });
    expect(dark["--gfui-backgroundColor"]).toBe("var(--gfui-color-surface-950)");
  });
});

describe("the built-in themes", () => {
  test("every built-in theme compiles in both tones; the color themes change only the primary color", () => {
    const compile = (themeId: string, tone: "light" | "dark") =>
      compileTheme({ themeId, tone, themes: BUILT_IN_THEME_MAP, componentDefaults: componentThemeDefaults() });
    const gfui = compile("gfui", "light");
    const green = compile("gfui-green", "light");
    expect(Object.keys(green)).toEqual(Object.keys(gfui));
    expect(Object.entries(green).filter(([k, v]) => gfui[k] !== v)).toEqual([["--gfui-color-primary", "#16a34a"]]);
    expect(compile("gfui", "dark")["--gfui-textColor"]).toBe("var(--gfui-color-surface-50)");
  });

  test("themeVariableNames: tokens, derived tokens, component variables", () => {
    const names = themeVariableNames();
    for (const name of ["color-primary", "color-primary-500", "space-3", "backgroundColor", "backgroundColor-Button", "backgroundColor-Button--hover", "textColor-Text"]) {
      expect(names, name).toContain(name);
    }
  });
});
