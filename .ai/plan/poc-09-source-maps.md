# Step 9: Source maps

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Compiled modules carry source maps back to the `.pfui` file, so stack
traces, breakpoints and errors point at the markup. Code-behind doesn't
exist yet; it will use the same mechanism.

## Background (XMLUI)

Source: `.plan/source-maps-for-compiled-scripts.md` (Hungarian).

- **Intermediate format:** XMLUI's script compiler records offset mappings
  (`CompiledScriptMapping`) and converts them to Source Map v3.
- **Debug identity:** source URLs (`xmlui-source:///src/Main.xmlui#event-3`)
  show the whole original file in DevTools.
- **Runtime path:** `new Function` gets `//# sourceURL` and an inline or
  external `//# sourceMappingURL`.
- **Build path:** the Vite plugin returns the map; dev mode only, opt-in.
- **Their E2E** sets a breakpoint on the generated script URL and checks
  the map's metadata. Validating a breakpoint on the original `.xmlui`
  line is listed as a **known limitation**.

## Design

- **Source markers:** every expression, statement and element start is
  marked inline during code generation (two private-use characters around
  the original offset). One pass at the end strips the markers into
  `[generated, original]` offset pairs, and `buildSourceMap` encodes
  Source Map v3. This needed no change to how the emitter builds strings.
  User literals containing the marker characters are escaped.
- **One map per module,** for every construct, with the source text
  embedded.
- **Delivery:**
  - the Vite plugin returns `{ code, map }`;
  - `loadModule` embeds the map inline, shifted for V8's `new Function`
    wrapper.
- **On by default** (`sourceMap: false` to skip). It is cheap enough:
  about 38 µs per small module with a map, 26 µs without. Production
  builds decide in step 12.

## Outcome

Implemented. Details: [`../docs/source-maps.md`](../docs/source-maps.md).

## Findings

- **We validate more than XMLUI's E2E does.** A CDP test pauses on a real
  exception in Chromium, decodes the map the browser received, and checks
  that the paused position is the `throw` line in `Main.pfui`. A unit test
  does the same with V8's own stack frames on the `loadModule` path, which
  verifies the 3-line wrapper shift.
- **Two surprises, recorded in tests:**
  - V8 records an `Error`'s stack at construction, so the frame is the
    `new Error(...)` expression, not the `throw`;
  - a throw inside an async function pauses as `promiseRejection`, not
    `exception`.
- **The tables found two unmarked places:** the element inside a
  container component, and the operands of logical operators (a position
  inside `a && !b` fell back to the whole expression). Both are fixed.
- **Markers cost compile time** even when stripped: about 3.6× before
  they were made conditional. Now they are inserted only when a map is
  wanted.
- **Regex literals** containing a marker character keep their behavior,
  but their `.source` shows the escape (``). This is accepted and
  tested.

## Open for later steps

- Breakpoints set on the original `.pfui` line in DevTools: the maps
  support them, but no automated UI-level test exists (as in XMLUI).
- Code-behind and `<script>` (when they exist): the same marker mechanism.
- Production builds: whether to emit maps, and external map files
  (step 12).
