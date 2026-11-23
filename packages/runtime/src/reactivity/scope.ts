// The scope object compiled bindings read (`$$s` in compiler output): every
// name is a getter. A reactive name reads its signal, so a binding evaluated
// inside a computed tracks exactly the variables it touches; other names are
// plain values (functions, component APIs, constants).

import type { ReadonlySignal } from "./signals";

export type ScopeEntry = { signal: ReadonlySignal<unknown> } | { value: unknown };

/** Builds a scope object. A later `parent` lookup is not implemented yet (step 8). */
export function createScope(entries: Record<string, ScopeEntry>): object {
  const scope = Object.create(null) as object;
  for (const [name, entry] of Object.entries(entries)) {
    const descriptor: PropertyDescriptor =
      "signal" in entry ? { get: () => entry.signal.get(), enumerable: true } : { value: entry.value, enumerable: true };
    Object.defineProperty(scope, name, descriptor);
  }
  return Object.freeze(scope);
}
