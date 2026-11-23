// App globals: functions every binding and handler can call (XMLUI globals.md).
// `delay` (step 7); the theme and tone (step 17); routing (step 19); the App
// shell (steps 19A–19C).

import { createScope, type ScopeEntry } from "../reactivity/scope";
import { APP_GLOBAL_NAMES } from "./app-global-names";
import { delay } from "./handlers";
import { currentLocation, currentRouteParams, navigate } from "./router";
import { navDrawerOpen, navPanelCollapsed, setNavDrawerOpen, setNavPanelCollapsed } from "./shell-state";
import { activeThemeId, activeThemeTone, setTheme, setThemeTone, toggleThemeTone } from "./theme-state";

const APP_GLOBALS: Record<string, ScopeEntry> = {
  delay: { value: delay },
  activeThemeId: { signal: activeThemeId },
  activeThemeTone: { signal: activeThemeTone },
  setTheme: { value: setTheme },
  setThemeTone: { value: setThemeTone },
  toggleThemeTone: { value: toggleThemeTone },
  navigate: { value: navigate },
  $pathname: { get: () => currentLocation().pathname },
  $queryParams: { get: () => currentLocation().query },
  $routeParams: { get: currentRouteParams },
  navPanelCollapsed: { signal: navPanelCollapsed },
  setNavPanelCollapsed: { value: setNavPanelCollapsed },
  navDrawerOpen: { signal: navDrawerOpen },
  setNavDrawerOpen: { value: setNavDrawerOpen },
};

/** The root scope of a compiled module: the app globals. */
export function createAppScope(): object {
  return createScope(APP_GLOBALS);
}

export { APP_GLOBAL_NAMES };
