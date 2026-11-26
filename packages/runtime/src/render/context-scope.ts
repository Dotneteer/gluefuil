// Context variables a component gives its children without making them a
// template (step 22: Form's `$data`). The compiler wraps the element in a
// container that creates this scope (`useContextScope`) and passes it to the
// component as `contextScope`; the component fills it while it renders
// (`provideContext`), before its children render. IDs inside stay file-scoped.

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { signal, type Signal } from "../reactivity/signals";
import { createScope, type ScopeEntry } from "../reactivity/scope";

const SLOTS = Symbol("gfui.contextSlots");

interface Slots {
  getters: Record<string, (() => unknown) | undefined>;
  /** Bumped when a getter arrives for a name that was read before it existed. */
  version: Signal<number>;
  /** Names read while their getter was missing (the component's own attributes). */
  early: Set<string>;
  scheduled: boolean;
}

/**
 * A scope over `parent` with a getter per name, reading what the component
 * provides (undefined before). The component's own attributes are computed
 * before it renders, so they may read a name before its getter exists (step 27:
 * `<ModalDialog title="Edit {$param}">`): those reads depend on a version signal,
 * bumped once the getter arrives, and are computed again.
 */
export function createContextScope(parent: object, names: readonly string[]): object {
  const slots: Slots = { getters: {}, version: signal(0), early: new Set(), scheduled: false };
  const entries: Record<string, ScopeEntry> = {};
  for (const name of names) {
    entries[name] = {
      get: () => {
        const getter = slots.getters[name];
        if (getter) return getter();
        slots.early.add(name);
        slots.version.get();
        return undefined;
      },
    };
  }
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
  let late = false;
  for (const [name, getter] of Object.entries(getters)) {
    if (slots.getters[name] === undefined && slots.early.has(name)) late = true;
    slots.getters[name] = getter;
  }
  // Not during this render (that would update the element's Bound while its child renders).
  if (late && !slots.scheduled) {
    slots.scheduled = true;
    queueMicrotask(() => {
      slots.scheduled = false;
      slots.early.clear();
      slots.version.set(slots.version.peek() + 1);
    });
  }
}

// --- Per-child context variables (step 28: ResponsiveBar's `$overflow`) ------------------

/** What a component tells one of its children (`perChildContextVars`): the values by name. */
export const ChildContextValues = createContext<Readonly<Record<string, unknown>> | undefined>(undefined);

/**
 * The context scope of one child of a `perChildContextVars` component: each name
 * reads a signal that follows the nearest `ChildContextValues`. The signals change
 * in a layout effect, never while a component renders.
 */
export function usePerChildScope(parent: object, names: readonly string[]): object {
  const values = useContext(ChildContextValues);
  const [state] = useState(() => {
    const signals = Object.fromEntries(names.map((name) => [name, signal<unknown>(values?.[name])]));
    const scope = createContextScope(parent, names);
    provideContext(scope, Object.fromEntries(names.map((name) => [name, () => signals[name]!.get()])));
    return { scope, signals };
  });
  useLayoutEffect(() => {
    for (const name of names) state.signals[name]!.set(values?.[name]);
  });
  return state.scope;
}
