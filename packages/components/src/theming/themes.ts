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
    // The spacing ladder (steps 19D–19E): automatic gaps and paddings by
    // nesting level (styles.ts LAYOUT). Steps of space-base, so it scales.
    "space-level0": "$space-6",
    "space-level0-phone": "$space-4",
    "space-level1": "$space-4",
    "space-level2": "$space-3",
    "space-level3": "$space-2",
    // XMLUI's named sizes (xmlui/src/components-core/theming/themes/root.ts L254-266).
    "gap-none": "$space-0",
    "gap-tight": "$space-2",
    "gap-normal": "$space-4",
    "gap-loose": "$space-8",
    "padding-none": "$space-0",
    "padding-tight": "$space-2",
    "padding-normal": "$space-4",
    "padding-loose": "$space-8",
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
  { id: "gfui" },
  { id: "gfui-green", extends: "gfui", themeVars: { "color-primary": "#16a34a" } },
  { id: "gfui-red", extends: "gfui", themeVars: { "color-primary": "#dc2626" } },
];

/** The theme an app uses unless it says otherwise. */
export const DEFAULT_THEME = "gfui";

/** The selectable built-in themes (not the root). */
export const THEME_IDS: readonly string[] = BUILT_IN_THEMES.filter((t) => t.id !== "root").map((t) => t.id);

export const BUILT_IN_THEME_MAP: ReadonlyMap<string, ThemeDefinition> = new Map(BUILT_IN_THEMES.map((t) => [t.id, t]));
