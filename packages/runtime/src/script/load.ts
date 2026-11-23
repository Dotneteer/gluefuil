// Turns compiled binding code (compiler CompileResult.code) into a function.
//
// This is a standalone path: it needs `new Function`, so it does not work
// under a Content Security Policy without 'unsafe-eval'. Build-time compiled
// modules never reach this file, and tree-shaking drops it (step 12;
// tools/build-output.test.ts checks this).

import { assertBindingValue } from "./binding-value";
import { scriptGlobals, scriptRuntime } from "./sandbox";

/** A loaded binding: evaluates against a scope object. */
export type Binding = (scope: object) => unknown;

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
