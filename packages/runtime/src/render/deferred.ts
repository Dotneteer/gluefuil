// Deferred props (step 20): a prop the component evaluates when it needs it,
// with context variables, instead of a binding Bound keeps up to date.
// APICall's `url` and `body` read `$param`/`$params`, the arguments of
// `execute()`. The compiler emits `$$deferred(scope, ($$s) => …)` for props
// whose metadata says `deferred`.
import { createScope, type ScopeEntry } from "../reactivity/scope";
import { assertBindingValue } from "../script/binding-value";
import type { BindingFunction } from "./elements";

const DEFERRED = new WeakSet<object>();

/** A deferred prop's value: evaluate with `(context)`. */
export type DeferredValue = (context: Record<string, unknown>) => unknown;

/** Compiled code: the binding, evaluated later in a child of `scope` holding the context variables. */
export function deferredValue(scope: object, binding: BindingFunction): DeferredValue {
  const evaluate: DeferredValue = (context) => {
    const entries: Record<string, ScopeEntry> = {};
    for (const [name, value] of Object.entries(context)) entries[name] = { value };
    return assertBindingValue(binding(createScope(entries, scope)));
  };
  DEFERRED.add(evaluate);
  return evaluate;
}

/** Whether a prop value is deferred (a literal prop is passed as it is). */
export function isDeferred(value: unknown): value is DeferredValue {
  return typeof value === "function" && DEFERRED.has(value);
}

/** A prop's value in a context: evaluated when deferred, as it is otherwise. */
export function resolveDeferred(value: unknown, context: Record<string, unknown>): unknown {
  return isDeferred(value) ? value(context) : value;
}
