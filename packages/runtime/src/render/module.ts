// Loads a compiled module in the "function" format (compiler compileModule).
//
// This is the standalone path: it needs `new Function`, so it does not work
// under a Content Security Policy without 'unsafe-eval'. The "esm" format is
// for build tools and needs no eval.
//
// Source maps: with `map`, the code gets a `//# sourceURL` and an inline
// `//# sourceMappingURL`, so DevTools shows the .pfui file and stack frames,
// breakpoints and errors map back to it. The map's generated lines are shifted
// by the lines that precede the module code in the evaluated script.

import type { ComponentType } from "react";
import * as runtime from "../index";

/** The parts of a Source Map v3 object loadModule needs (the whole object is embedded). */
export interface ModuleSourceMap {
  version: 3;
  sources: string[];
  mappings: string;
}

export interface ModuleImports {
  /** The components the module uses, by name (normally `@patchfuil/components`). */
  components: Record<string, unknown>;
  /** The module's source map (compileModule `map`). */
  map?: ModuleSourceMap;
  /** The name DevTools shows for the generated script. Default: the map's source + ".js". */
  sourceURL?: string;
}

/**
 * Lines V8 puts before a `new Function` body: `function anonymous($$imports\n) {\n`.
 * Verified by tests/render/source-maps.test.tsx against real stack positions.
 */
const FUNCTION_HEADER_LINES = 2;
const PROLOGUE = '"use strict";\n';

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Instantiates a compiled module; returns its root component. */
export function loadModule(code: string, imports: ModuleImports): ComponentType {
  let body = `${PROLOGUE}${code}`;
  if (imports.map) {
    const shifted = { ...imports.map, mappings: ";".repeat(FUNCTION_HEADER_LINES + 1) + imports.map.mappings };
    const url = imports.sourceURL ?? `${imports.map.sources[0] ?? "module.pfui"}.js`;
    body += `\n//# sourceURL=${url}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64(JSON.stringify(shifted))}`;
  }
  const factory = new Function("$$imports", body) as (imports: unknown) => ComponentType;
  return factory({ runtime, components: imports.components });
}
