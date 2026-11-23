// The scope object compiled code reads and writes (`$$s` in compiler output).
//
// Every name is an accessor:
//   - a variable: a getter that reads it (tracked) and a setter that assigns it;
//   - a signal: a getter;
//   - a plain value (functions, component APIs, constants): a data property.
//
// A child scope's prototype is its parent, so names resolve with shadowing, and
// `scope.x = v` in a child reaches the setter of the scope that declares `x`.
// Compiled handlers therefore write variables as plain JavaScript
// (`$$s.count++`, `[$$s.a, $$s.b] = [$$s.b, $$s.a]`).

import type { ReadonlySignal } from "./signals";
import type { Variable } from "./variable";

export type ScopeEntry =
  | { variable: Variable<unknown> }
  | { signal: ReadonlySignal<unknown> }
  | { value: unknown };

/** Builds a (frozen) scope object, optionally inheriting from `parent`. */
export function createScope(entries: Record<string, ScopeEntry>, parent: object | null = null): object {
  const scope = Object.create(parent) as object;
  for (const [name, entry] of Object.entries(entries)) {
    let descriptor: PropertyDescriptor;
    if ("variable" in entry) {
      const v = entry.variable;
      descriptor = { get: () => v.get(), set: (value: unknown) => v.set(value), enumerable: true };
    } else if ("signal" in entry) {
      const s = entry.signal;
      descriptor = { get: () => s.get(), enumerable: true };
    } else {
      descriptor = { value: entry.value, enumerable: true };
    }
    Object.defineProperty(scope, name, descriptor);
  }
  return Object.freeze(scope);
}
