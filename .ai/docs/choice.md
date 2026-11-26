# Choice inputs: Select and AutoComplete

> Subsystem reference: `Select` and `AutoComplete` (step 25), their `Option`
> children compiled to data, and the shared component on Mantine's Combobox.
> Describes the code as it is. Design and XMLUI comparison:
> [`../plan/poc-25-choice.md`](../plan/poc-25-choice.md). The other inputs
> are in [inputs.md](inputs.md); binding to a form is in [forms.md](forms.md).
>
> **Last updated:** step 25.

## In markup

```xml
<Select id="fruit" label="Fruit" searchable="true" clearable="true">
  <Option value="apple" label="Apple" keywords="{['red']}"/>
  <Option value="{0}">Zero</Option>
  <Items data="{more}"><Option value="{$item.id}" label="{$item.name}" category="{$item.kind}"/></Items>
</Select>
<Select label="Country" data="{countries}" valueField="code" labelField="name" multiSelect="true" groupBy="region"/>
<AutoComplete label="Tags" multi="true" creatable="true" onItemCreated="(t) => log(t)">…</AutoComplete>
```

| | Select | AutoComplete |
|-|--------|--------------|
| Typing filters | with `searchable` | always |
| Several values (an array, pills) | `multiSelect` | `multi` |
| Create an option | — | `creatable`, the `itemCreated` event |
| Open at mount | — | `initiallyOpen` |
| Input limit | — | `maxLength` |
| Clear button | `clearable` | when there is a value |
| List shows a message instead | `inProgress`, `inProgressNotificationMessage` | — |

Both: `label` (their own), `initialValue`, `placeholder`, `enabled`,
`readOnly`, `autoFocus`, `validationStatus`, `data` / `valueField` /
`labelField`, `dropdownHeight` (default 220px), `groupBy`; templates
`optionTemplate` (`$item`, `$selectedValue`, `$checked`, `$inTrigger`),
`valueTemplate` (`$item`, `$itemContext.removeItem()`), `emptyListTemplate`,
`groupHeaderTemplate` (`$group`), `ungroupedHeaderTemplate`; events
`didChange`, `gotFocus`, `lostFocus`; API `value`, `setValue` (no
`didChange`), `focus`. In a Form, `bindTo` and the validation props
([forms.md](forms.md)).

## Options compiled to data (`compile-module.ts`)

XMLUI registers each `Option` with its parent in an effect. Our prerender
runs no effects, so the compiler turns the children into data instead:

- Select and AutoComplete have `childrenAsOptions: true` in their metadata.
  Their children compile to one hoisted function `($$s) => [ … ]`, the
  hidden binding `$$options`.
- **`<Option>`** → `{ value, label, … }`: every attribute is a field, any
  name (XMLUI keeps extra attributes for `groupBy`). Literals are strings,
  `{…}` bindings keep their type. `enabled` is checked as a boolean.
  - A text child (interpolated, trimmed) is the label unless `label` is set.
  - Element children → `$$content: $$h($$OptionContent, { render, scope })`,
    a template rendered in the option's scope; it replaces the option's
    text in the list.
  - `when` → `...(test ? [option] : [])`; a constant false drops it.
- **`<Items data>`** → `...$$optionItems(scope, data, (itemScope) => [ … ])`
  (runtime `templates.ts`): an item scope per item (`$item`, `$itemIndex`,
  `$isFirst`, `$isLast`) made with `createScope`, no hook.
- **Diagnostics:** E035 (anything else inside, also inside such an Items),
  E036 (`data` and Option children), E002 (`id`, events, `var.*`,
  `when-*` on such an Option; Items attributes besides `data` and `when`).
- RadioGroup is unchanged: its Options render (step 24).

## The component (`components/src/choice.tsx`)

`ChoiceNative` on Mantine's `Combobox`, `useCombobox`, `InputBase`,
`PillsInput`, `Pill`:

- **Options** (`choiceOptions`): the compiled array, else `data` (strings;
  objects through `valueField`/`labelField`, the whole object is `$item`).
  Value and label stand in for each other; an option with neither is
  skipped; the first of equal keys wins; the key is `String(value)`.
- **The value:** values keep their type and match as strings (XMLUI). One
  value is `""` when empty; several are an array, `[]` when empty. The
  wrapper is chosen by `multiSelect`/`multi` (two `wrapComponent`s, each
  with its own `parse`).
- **The target:**
  - single, not searchable: `InputBase` as a `<button>` (Mantine's
    `targetType: "button"`), showing the label or the value template;
  - single, searchable (and AutoComplete): an input that is the search box;
    it shows the label until the user types, and again on blur;
  - several: `PillsInput` with a pill per value (or the value template) and
    an input field (read-only when not searchable).
  - `withExpandedAttribute`: the target has `role="combobox"`,
    `aria-expanded`, `aria-controls`.
- **Search** (`matchesSearch`): value, label and keywords contain the text,
  case-insensitively (XMLUI).
- **The list:** the create item (AutoComplete `creatable`, when no label or
  value equals the text), then the options, or groups (`groupOptions`: the
  ungrouped first, then by name, as XMLUI). Each option shows a check mark
  when selected; disabled options can't be picked. Empty: the
  `emptyListTemplate`, or a `noresult` icon and "List is empty".
- **Keys:** Mantine's: ArrowDown opens on the first option, the arrows skip
  disabled options and wrap, Enter picks, Escape closes, Space opens a
  button target. Ours: Backspace in an empty multi input removes the last
  value; AutoComplete's Enter picks the only item when none is highlighted.
  **The highlight is set when the options mount** (`settleOnOpen`, step 29):
  Mantine looks for it in a `setTimeout(0)` after opening, but its transition
  mounts the options in an animation frame. On a busy machine the frame came
  later, the index stayed at "none", and the next ArrowDown went back to the
  first option. Now a keyboard open highlights the active (or first) option
  as the options mount, and any other open continues from the current value.
- **Its own label** (Mantine's `<label for>`, with the class
  `gfui-Label-text`, so it looks like the label behavior's and gets the
  required mark in a form): the label behavior's `<label>` would wrap the
  list and put its text into the input's accessible name. ColorPicker does
  the same (step 24).
- **readOnly:** the list stays closed (`Combobox readOnly`, the dropdown
  hidden), no remove buttons; `enabled="false"` disables it.
- **Mantine's clear and pill-remove buttons are `aria-hidden`** and out of
  the tab order (Backspace and the keyboard cover them): kept.
- **The list stays mounted while closed** (Mantine 9's Combobox default,
  `keepMounted`, `display: none`): its keyboard navigation queries the
  options in the DOM. A prerendered page carries them as hidden HTML.

## Theme variables

Per component (`Select`, `AutoComplete`): the five text-input variables
(`styles.ts` `TEXT_INPUTS`), `backgroundColor-menu-*`, `borderColor-menu-*`,
`backgroundColor-item-*--hover`, `backgroundColor-*-badge`,
`textColor-*-badge`. The list has the class `gfui-<Name>-dropdown`.

## Files

| File | Contents |
|------|----------|
| `compiler/src/module/compile-module.ts` | `optionParts`, `optionEntry`, `optionWhen`, `optionText`, `optionItems`; `$$options` |
| `runtime/src/render/templates.ts` | `optionItems`, `OptionContent` |
| `components/src/choice.tsx` | `ChoiceNative`, `Select`, `AutoComplete`, `choiceOptions`, `matchesSearch`, `groupOptions` |
| `components/src/metadata.ts` | `CHOICE_COMPONENTS`, `childrenAsOptions` |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/choice.test.ts` | The diagnostics table (E035, E036, E002, C014 for `$item`, extra attributes, RadioGroup unchanged); the generated options code (constants, bindings, `when`, Items, text labels, content) |
| `components/tests/choice.test.tsx` | `choiceOptions`, `matchesSearch`, `groupOptions`; Select through markup: Options from children, Items and `when`, value types, data, `setValue`, keys, search and clear, several values (pills, Backspace), groups and their templates, the templates, `inProgress`, states, focus; AutoComplete: filtering, Enter on the only item, clearing on blur, creatable, multi; a Form (array value, required, submit); the prerendered selection |
| `e2e/playground-scenarios.spec.ts` (Select, AutoComplete) | Real keys and clicks: options from Items growing, disabled options skipped, keywords, the clear button, pills and Backspace, a value template's remove button, group headers and order, templates, an Option's own content, empty lists, `inProgress`, `dropdownHeight`, states and the warning border, the API; AutoComplete keywords, Enter, clearing, multi, creatable, `maxLength`; both in a Form (required, submit types, the required mark on their labels) |
