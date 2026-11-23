// Loads a compiled module in the "function" format (compiler compileModule).
//
// This is the standalone path: it needs `new Function`, so it does not work
// under a Content Security Policy without 'unsafe-eval'. The "esm" format is
// for build tools and needs no eval.

import type { ComponentType } from "react";
import * as runtime from "../index";

export interface ModuleImports {
  /** The components the module uses, by name (normally `@patchfuil/components`). */
  components: Record<string, unknown>;
}

/** Instantiates a compiled module; returns its root component. */
export function loadModule(code: string, imports: ModuleImports): ComponentType {
  const factory = new Function("$$imports", `"use strict";\n${code}`) as (imports: unknown) => ComponentType;
  return factory({ runtime, components: imports.components });
}
