// Turns compiled binding code (compiler CompileResult.code) into a function.
//
// This is the standalone path: it needs `new Function`, so it does not work
// under a Content Security Policy without 'unsafe-eval'. Build-time compiled
// modules will import $$g and $$r instead (step 12).

import { scriptGlobals, scriptRuntime } from "./sandbox";

/** A loaded binding: evaluates against a scope object. */
export type Binding = (scope: object) => unknown;

/** Thrown when a binding produces a value bindings may not have. */
export class BindingError extends Error {
  override name = "BindingError";
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** Bindings are synchronous: a promise (any thenable) as a binding's value throws. */
export function assertBindingValue<T>(value: T): T {
  if (isThenable(value)) {
    throw new BindingError("A binding cannot produce a promise; call async functions from an event handler");
  }
  return value;
}

/**
 * Instantiates compiled binding code (`($$s) => …`). Bindings are synchronous:
 * a promise (any thenable) as the result throws a BindingError.
 */
export function loadBinding(code: string): Binding {
  const factory = new Function("$$g", "$$r", `"use strict"; return (${code});`) as (
    globals: unknown,
    runtime: unknown,
  ) => (scope: object) => unknown;
  const compiled = factory(scriptGlobals, scriptRuntime);
  return (scope) => assertBindingValue(compiled(scope));
}
