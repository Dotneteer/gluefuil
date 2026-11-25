# Source maps

> Subsystem reference: how compiled modules map back to the `.gui` file.
> Describes the code as it is. Design and XMLUI comparison:
> [`../plan/poc-09-source-maps.md`](../plan/poc-09-source-maps.md).
>
> **Last updated:** step 9.

## What maps where

`compileModule` returns a Source Map v3 (`map`) with the module code:

- `sources: [fileName]`, plus `sourcesContent` (the `.gui` text) and
  `file: fileName + ".js"`;
- one mapping per **expression, statement and element** start, pointing to
  its exact line and column in the `.gui` file.

That covers bindings in attributes and text, variable initializers,
handler statements (including `<event>` content and CDATA), callbacks, and
element creation. Positions are exact through entity decoding, because the
parsers work in file offsets (steps 1–2).

Not covered yet: code-behind (it doesn't exist yet).

## How it works: source markers

Code generation builds JavaScript as strings, so it records positions
inline:

1. **Marking.** The emitter (`expression()`, `statement()`, logical
   operands) and the module compiler (elements, text) prefix each emitted
   piece with a **marker**: `U+E000`, the original offset in base 36,
   `U+E001` (`codegen/markers.ts` `mark`).
2. **Extraction.** At the end of `compileModule`, one pass
   (`extractMarkers`) strips the markers and records `[generated offset,
   original offset]` pairs. When several markers sit at the same generated
   position, the innermost wins.
3. **Encoding.** `buildSourceMap` converts the offsets with `LineMap` and
   encodes Source Map v3 (base64 VLQ, `source/source-map.ts`).

**Safety:**

- User text copied verbatim (string, template and regex literals, constant
  attribute and text values) has `U+E000`/`U+E001` escaped (``), so a
  marker can't be confused with user text.
- Code that inspects generated text (for example the `- -a` spacing, the
  object-literal arrow body, the statement-start check) reads it through
  `bare()`.
- **Cost:** markers are only inserted when a map is wanted (`markers`
  option; `compileModule` `sourceMap: false` turns them off).

## Delivery

| Path | How the map reaches the browser |
|------|---------------------------------|
| Build tools (`"esm"`) | `@gluefuil/vite-plugin` returns `{ code, map }` ([build-time.md](build-time.md)); the dev server serves the module with an inline map, and a build with `build.sourcemap` carries it into the bundle's map. The map's source is the file name, which the browser resolves relative to the module URL (`/src/Main.gui`). |
| Standalone (`"function"`, `loadModule`) | `loadModule(code, { components, map, sourceURL })` appends `//# sourceURL=…` and an inline `//# sourceMappingURL=data:…`. The map's generated lines are shifted by 3: V8's two `new Function` header lines (`function anonymous($$imports\n) {\n`) and the `"use strict";` prologue. |

## API

| Export | Package | What it does |
|--------|---------|--------------|
| `compileModule(…, { fileName, sourceMap })` | compiler | `fileName` names the source (default `Main.gui`); `sourceMap: false` skips the map and the markers |
| `buildSourceMap`, `encodeMappings`, `decodeMappings`, `encodeVlq`, `decodeVlq`, `originalPositionFor`, `offsetSourceMapLines` | compiler | Source Map v3 encoding, decoding and lookup (tests, tooling, error overlays) |
| `CompileOptions.markers` | compiler | Internal: keeps markers in `compileExpression`/`compileInterpolation`/`compileHandler` output for `compileModule` |
| `loadModule(…, { map, sourceURL })` | runtime | Embeds the map in the standalone path |

## Evidence

- **V8 stack positions** (`runtime/tests/render/source-maps.test.tsx`).
  A handler and a binding loaded through `loadModule` throw. The frame V8
  reports under the `sourceURL`, mapped through the shifted map, lands on
  the exact expression in the markup. V8 records an `Error`'s stack where
  the error is constructed, so the frame is the `new Error(…)` expression.
  This verifies the 3-line shift.
- **Chromium through CDP** (`e2e/source-maps.spec.ts`):
  - pause on the exception thrown by a handler in `test-apps/hello`;
  - take the paused location in the generated module;
  - decode the inline map Chromium received from Vite;
  - resolve the location: it is the `throw` line of `Main.gui`.

  A throw inside an async function (all handlers) pauses with reason
  `promiseRejection`.
- **Vite's own error output** prints handler errors with the `Main.gui`
  code frame, through the same map.

## Measured (`npm run bench`)

- A typical binding compiles in about 0.45 µs without markers.
- A small module compiles in about 26 µs without a map and 38 µs with one.

## Files

| File | Contents |
|------|----------|
| `compiler/src/codegen/markers.ts` | `mark`, `bare`, `extractMarkers`, `escapeMarkerChars`, `jsString` |
| `compiler/src/source/source-map.ts` | Source Map v3 |
| `compiler/src/codegen/emitter.ts` | Marking expressions, logical operands and statements (`markers` option) |
| `compiler/src/module/compile-module.ts` | Marking elements and text; building the map |
| `runtime/src/render/module.ts` | `loadModule` with `map`/`sourceURL` |
| `vite-plugin/src/index.ts` | Passes the map to Vite (`sourceMap` option: on while serving, follows `build.sourcemap` in a build) |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/source/source-map.test.ts` | VLQ, mappings encode/decode, lookup, line shifting, `buildSourceMap` |
| `compiler/tests/codegen/markers.test.ts` | Extraction, nesting, `bare`, escaping; user literals containing the marker characters compile to equivalent code |
| `compiler/tests/module/source-map.test.ts` | Per construct: identifiers, sub-expressions, entity-decoded attributes, text content, initializers, multi-line handlers, implicit-await calls, callbacks, `<event>`/CDATA, elements and containers; the map's fields; `sourceMap: false`; no markers left in the output |
| `runtime/tests/render/source-maps.test.tsx` | Real V8 stack frames → markup positions (handler and binding) |
| `e2e/source-maps.spec.ts` | CDP pause on a handler's exception → the `throw` line in `Main.gui` |
