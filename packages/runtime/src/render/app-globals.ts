// App globals: functions every binding and handler can call (XMLUI globals.md).
// `delay` (step 7); the theme and tone (step 17).

import { createScope, type ScopeEntry } from "../reactivity/scope";
import { APP_GLOBAL_NAMES } from "./app-global-names";
import { delay } from "./handlers";
import { activeThemeId, activeThemeTone, setTheme, setThemeTone, toggleThemeTone } from "./theme-state";

const APP_GLOBALS: Record<string, ScopeEntry> = {
  delay: { value: delay },
  activeThemeId: { signal: activeThemeId },
  activeThemeTone: { signal: activeThemeTone },
  setTheme: { value: setTheme },
  setThemeTone: { value: setThemeTone },
  toggleThemeTone: { value: toggleThemeTone },
};

/** The root scope of a compiled module: the app globals. */
export function createAppScope(): object {
  return createScope(APP_GLOBALS);
}

export { APP_GLOBAL_NAMES };
