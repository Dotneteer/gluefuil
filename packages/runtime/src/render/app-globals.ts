// App globals: functions every binding and handler can call (XMLUI globals.md).
// For now only `delay`; more arrive with later steps.

import { createScope, type ScopeEntry } from "../reactivity/scope";
import { APP_GLOBAL_NAMES } from "./app-global-names";
import { delay } from "./handlers";

const APP_GLOBALS: Record<string, ScopeEntry> = {
  delay: { value: delay },
};

/** The root scope of a compiled module: the app globals. */
export function createAppScope(): object {
  return createScope(APP_GLOBALS);
}

export { APP_GLOBAL_NAMES };
