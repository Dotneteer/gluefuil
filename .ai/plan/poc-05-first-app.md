# Step 5: First running app

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Run the whole pipeline end to end: **markup → compiled module → React →
browser**, for a small app such as:

```xml
<App>
  <Stack>
    <Text value="{1 + 2}"/>
    <Text>Hello, {'pfui'.toUpperCase()}!</Text>
    <Button label="Click me"/>
  </Stack>
</App>
```

It uses our own minimal `App`, `Text`, `Button` and `Stack`; Mantine comes
in step 16. There are no variables or handlers yet (step 6).

## Background (XMLUI)

Sources: `xmlui/src/parsers/xmlui-parser/transform.ts` (`prepNode`,
`collapseWhitespace`, `mergeConsecutiveTexts`, `createTextNodeElement`),
`website/content/docs/reference/components/Text.md`, `Button.md`.

- **Text content** of a component element becomes a `TextNode` child whose
  `value` is the text, so `{…}` interpolation works there too.
  - Whitespace runs collapse to one space (except U+00A0); `<event>` and
    `<method>` content is exempt.
  - XMLUI collapses **before** parsing, so string literals inside `{…}` in
    text content are collapsed as well.
  - Whitespace between tags is trivia.
- `Text` shows `value`, or its nested text. `Button` shows `label`, or its
  nested content.
- **Every attribute value is interpolated.** A value without `{…}` is a
  string; converting it to the prop's type comes from metadata (step 15).

## Design

### Compiled module

`compileModule(markup, options)` (`@patchfuil/compiler`) returns
`{ code, diagnostics }`. The code is one JavaScript module whose default
export is the app's root component.

```js
import { createElement as $$h, Bound as $$Bound, TextNode as $$TextNode,
         createScope as $$createScope, scriptGlobals as $$g, scriptRuntime as $$r } from "@patchfuil/runtime";
import { App as $$C_App, Text as $$C_Text } from "@patchfuil/components";

const $$scope = $$createScope({});
const $$b0 = { value: ($$s) => 1 + 2 };          // bindings of one element, hoisted

function Main() {
  return $$h($$C_App, null,
    $$h($$Bound, { type: $$C_Text, bindings: $$b0, scope: $$scope }));
}
export default Main;
```

- **Two formats:**
  - `"esm"` imports from `@patchfuil/runtime` and `@patchfuil/components`,
    for build tools (here a Vite plugin; step 12 makes it real);
  - `"function"` is a function body that reads the same names from a
    `$$imports` parameter, for loading with `new Function` (standalone mode,
    step 11, and the tests).

  Both share everything but the header and footer.
- **Bindings use the sandbox's `$$g`/`$$r` through imports**, not
  `new Function`, so the ESM format needs no `unsafe-eval`.
- **Generated names** start with `$$`, so they can't collide with names in
  the source (step 3 reserves the prefix).
- **Static parts stay static:**
  - an element without bindings is a direct `createElement`;
  - text without `{…}` is a string child;
  - only elements with bindings get the `Bound` wrapper.

### Runtime

- **`Bound`** evaluates an element's bindings in one `useComputed` (step 4)
  and renders the component with the resolved props. The component itself
  is a plain React component, which is what wrapping existing React
  components needs.
- **`TextNode`** renders a text value: `null` and `undefined` render
  nothing.
- **`loadModule(code, { components })`** instantiates the `"function"`
  format.
- **`createElement`** is re-exported, so compiled code never imports React
  directly.
- **Binding values that are promises** throw a `BindingError`. The same
  check as `loadBinding`, now shared through `assertBindingValue`.

### Components (`@patchfuil/components`)

- **Components:** `App`, `Text`, `Button` and `Stack` (`orientation`,
  `gap`), as plain React components.
- **Metadata:** `componentMetadata` in the React-free entry lists them,
  with their props. The compiler resolves element names against this map.
  `compileModule` accepts extra metadata through `options.components`.

### Text content

- **Whitespace-only text** between elements is dropped.
- **Other text** is split into segments (step 2).
  - Whitespace runs in **literal segments** collapse to one space.
  - **Divergence:** expressions are not collapsed, so `{'a   b'}` keeps
    its spaces, and positions stay exact.
- **CDATA** is literal text, without interpolation or collapsing.

### Not supported yet

These are reported, never silently ignored (E002, "not supported yet"):

- `var.*`, `global.*`, `on*` handlers, `method.*`, `when`, `id`;
- helper tags (`<variable>`, `<event>`, `<property>`, …);
- `<script>`.

They arrive in steps 6, 8, 10 and 14.

### Diagnostics (prefix `E`)

| Code | Meaning |
|------|---------|
| E001 | Unknown component 'X' |
| E002 | 'X' is not supported yet |
| E003 | A document must have exactly one root element, and no text outside it |

The parse diagnostics (M, S) and the binding diagnostics (C) of every
attribute and text node are collected as well, with file positions.

## Tests

- **Compiler:**
  - the generated code (both formats);
  - each E code with the source it points at;
  - binding diagnostics with their positions;
  - text and whitespace rules.
- **Components** (jsdom): the compiled module renders the expected DOM.
  It covers constant and bound props, text bindings and nesting.
- **Runtime:** `Bound` re-renders when a bound signal changes; `TextNode`;
  `loadModule`.
- **E2E:** a fixture app whose `Main.pfui` is compiled by a minimal Vite
  plugin renders in Chromium with no errors.

## Outcome

The pipeline runs end to end:

- in jsdom, the `"function"` format through `loadModule`
  (`components/tests/first-app.test.tsx`);
- in Chromium, the `"esm"` format through a minimal Vite plugin
  (`e2e/first-app.spec.ts`, `test-apps/hello`).

Details: [`../docs/modules.md`](../docs/modules.md).

## Findings

- **The step 3 and step 4 designs held:** bindings compiled by
  `compileInterpolation` and evaluated by `useComputed` needed no change.
  Bindings read `$$g`/`$$r` through module imports, so the build-time
  output needs no `eval` (good for strict CSP).
- **Vite's default config loader** externalizes workspace packages, and
  Node cannot load their TypeScript source (extensionless relative
  imports). The fixture uses `--configLoader runner`. Step 12 decides how
  the real plugin is packaged (likely a built JS package).
- **XMLUI collapses whitespace before parsing**, so it also collapses
  string literals inside `{…}` in text content. pfui collapses literal
  segments only (a deliberate divergence, which keeps expression positions
  exact).
- **The `runtimeInfo` and `componentsInfo` placeholders were removed**:
  both packages have real exports now.

## Open for later steps

- **Attribute value types:** every constant is a string now
  (`gap="8px"`, `disabled` → `"true"`). Converting by the prop's declared
  type comes with metadata contracts (step 15).
- **Unknown attributes** pass through to the component unchecked until
  step 15.
