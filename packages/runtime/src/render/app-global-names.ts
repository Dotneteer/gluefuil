// Names of the app globals (scope names every binding and handler sees).
// Kept free of platform code so the compiler-runtime drift test can import it.
// The compiler's copy is APP_GLOBALS in compiler src/codegen/names.ts.
export const APP_GLOBAL_NAMES: readonly string[] = ["delay", "activeThemeId", "activeThemeTone", "setTheme", "setThemeTone", "toggleThemeTone", "navigate", "$pathname", "$queryParams", "$routeParams", "navPanelCollapsed", "setNavPanelCollapsed", "navDrawerOpen", "setNavDrawerOpen"];
