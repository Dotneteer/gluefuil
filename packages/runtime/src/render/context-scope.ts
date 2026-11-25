// Context variables a component gives its children without making them a
// template (step 22: Form's `$data`). The compiler wraps the element in a
// container that creates this scope (`useContextScope`) and passes it to the
// component as `contextScope`; the component fills it while it renders
// (`provideContext`), before its children render. IDs inside stay file-scoped.

import { useState } from "react";
import { createScope, type ScopeEntry } from "../reactivity/scope";

const SLOTS = Symbol("gfui.contextSlots");

type Slots = Record<string, (() => unknown) | undefined>;

/** A scope over `parent` with a getter per name, reading what the component provides (undefined before). */
export function createContextScope(parent: object, names: readonly string[]): object {
  const slots: Slots = {};
  const entries: Record<string, ScopeEntry> = {};
  for (const name of names) entries[name] = { get: () => slots[name]?.() };
  const scope = createScope(entries, parent);
  // createScope freezes: the slots object stays mutable behind a symbol defined before.
  return Object.freeze(Object.create(scope, { [SLOTS]: { value: slots } }));
}

export function useContextScope(parent: object, names: readonly string[]): object {
  const [scope] = useState(() => createContextScope(parent, names));
  return scope;
}

/** Called by the component while it renders: each name's getter (tracked reads are fine). */
export function provideContext(scope: unknown, getters: Record<string, () => unknown>): void {
  const slots = (scope as { [SLOTS]?: Slots } | undefined)?.[SLOTS];
  if (!slots) return;
  for (const [name, getter] of Object.entries(getters)) slots[name] = getter;
}
