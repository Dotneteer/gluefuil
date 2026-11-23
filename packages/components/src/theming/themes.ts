// The built-in themes (step 17). The root theme holds the design tokens; the
// others change the primary color. Variable names follow XMLUI's convention:
// property[-part][-Component][-variant][--state].

import type { ThemeDefinition } from "./engine";

export const ROOT_THEME: ThemeDefinition = {
  id: "root",
  themeVars: {
    "color-primary": "#2563eb",
    "color-secondary": "#64748b",
    "color-success": "#16a34a",
    "color-warn": "#d97706",
    "color-danger": "#dc2626",
    "color-surface": "#64748b",
    "space-base": "4px",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: "15px",
    lineHeight: "1.5",
    borderRadius: "6px",
  },
  tones: {
    light: {
      themeVars: {
        backgroundColor: "#ffffff",
        textColor: "$color-surface-900",
        "textColor-secondary": "$color-surface-600",
        borderColor: "$color-surface-300",
      },
    },
    dark: {
      themeVars: {
        backgroundColor: "$color-surface-950",
        textColor: "$color-surface-50",
        "textColor-secondary": "$color-surface-300",
        borderColor: "$color-surface-700",
      },
    },
  },
};

export const BUILT_IN_THEMES: readonly ThemeDefinition[] = [
  ROOT_THEME,
  { id: "pfui" },
  { id: "pfui-green", extends: "pfui", themeVars: { "color-primary": "#16a34a" } },
  { id: "pfui-red", extends: "pfui", themeVars: { "color-primary": "#dc2626" } },
];

/** The theme an app uses unless it says otherwise. */
export const DEFAULT_THEME = "pfui";

/** The selectable built-in themes (not the root). */
export const THEME_IDS: readonly string[] = BUILT_IN_THEMES.filter((t) => t.id !== "root").map((t) => t.id);

export const BUILT_IN_THEME_MAP: ReadonlyMap<string, ThemeDefinition> = new Map(BUILT_IN_THEMES.map((t) => [t.id, t]));
