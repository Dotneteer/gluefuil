# Step 25: Choice inputs

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the third batch of Phase F: `Select`,
`AutoComplete` and `Option`, with search, multi-select and the keyboard.

## Goal

```xml
<Select id="fruit" label="Fruit" placeholder="Pick one" searchable="true" clearable="true">
  <Option value="apple" label="Apple" keywords="{['red', 'pie']}"/>
  <Option value="banana" label="Banana"/>
  <Items data="{moreFruits}">
    <Option value="{$item.id}" label="{$item.name}" category="{$item.kind}"/>
  </Items>
</Select>

<Select label="Countries" data="{countries}" valueField="code" labelField="name" multiSelect="true" groupBy="region"/>

<AutoComplete label="Tags" multi="true" creatable="true" onItemCreated="(t) => created.push(t)">
  <Option value="news" label="News"/>
  <Option value="sports" label="Sports"/>
</AutoComplete>
```

XMLUI's markup for the two pickers, bound to forms with `bindTo` like every
input of step 24, and prerendered with the selection showing.

## Background

### XMLUI

- **Select** (`website/content/docs/reference/components/Select.md`,
  `xmlui/src/components/Select/SelectReact.tsx`):
  - options from `Option` children (also inside `Items`), or from `data`
    with `valueField` / `labelField` (default `value` / `label`; strings
    become `{ value, label }`); with `data`, children are ignored
    (`Select.tsx` 361);
  - `searchable`, `multiSelect`, `clearable`, `placeholder`,
    `dropdownHeight`, `initialValue`, `enabled`, `readOnly`, `autoFocus`,
    `validationStatus`, `inProgress` + `inProgressNotificationMessage`;
  - `groupBy` (a field of the options) with `groupHeaderTemplate` (`$group`)
    and `ungroupedHeaderTemplate`; options without the field come first
    (`SelectReact.tsx` 431–461);
  - templates: `optionTemplate` (`$item`, `$selectedValue`, `$inTrigger`),
    `valueTemplate` (`$item`, `$itemContext.removeItem()`),
    `emptyListTemplate` (default: a `noresult` icon and "List is empty");
    `optionLabelTemplate` is declared but never wired (`Select.tsx` 120,
    331: no renderer uses it);
  - search matches `value + label + keywords`, case-insensitively
    (`SelectReact.tsx` 414–425);
  - values keep their type (`<Option value="{0}">`) and are compared as
    strings (`SelectReact.tsx` 390–396); clearing gives `""` (single) or
    `[]` (multi) (603);
  - in a form, an initial value that is not an option is dropped (504–525);
  - keys: arrows move over enabled options, Enter picks (single closes),
    Escape closes (660–700);
  - `setValue` calls the same toggle as a click: it fires `didChange`, and
    in multi mode it adds or removes one value (721–723);
  - `didChange`, `gotFocus`, `lostFocus`; API `value`, `setValue`, `focus`,
    `reset`.
- **AutoComplete** (`AutoComplete.md`, `AutoComplete/AutoCompleteReact.tsx`):
  a searchable select (its value is an option's value, not free text):
  - `multi`, `creatable` + `itemCreated` (a "Create "x"" item when nothing
    matches exactly; the new option is added and selected, 383–390,
    845–880), `initiallyOpen`, `maxLength`, `dropdownHeight`, `groupBy`
    and its templates, `optionTemplate`, `emptyListTemplate`;
  - on blur, an empty input clears a single value; otherwise the input shows
    the selected label again (729–737);
  - ArrowDown opens; Enter picks the highlighted item, or the only one
    (480–505); Escape closes;
  - `setValue` sets the value without `didChange` (544–546).
- **Option** (`Option.md`, `Option/Option.tsx`): `value`, `label` (each
  defaults to the other; neither: not shown), `enabled`, `keywords`; a
  single text child is the label; other children are its content in the
  list; **any other attribute** (`category`, `type`) is kept on the option
  for `groupBy` (`Option.tsx` 68–80).

### gluefuil today

- `Select` (step 16, `components/src/mantine.tsx`) wraps Mantine's `Select`
  with our own `options` prop (strings or `{ value, label }`),
  `searchable`, `clearable`, `optionTemplate` (`$item`, `$checked`). Values
  are strings; clearing gives `null`.
- Its dropdown is inside the label behavior's `<label>`, so the open list
  joins the input's accessible name (step 24 finding; ColorPicker took its
  own label for that reason).
- Step 24's `Option` renders a radio button inside a `RadioGroup`.
- Children of an element compile to React elements; `Items` gets its
  children as a template (`childrenTemplate`). Bindings are functions of a
  scope; `createScope(entries, parent)` makes a scope without a hook.

## Decisions (asked 2026-11-25)

1. **Options compile to data.** XMLUI registers each Option with its parent
   in an effect; our prerender runs no effects, so a prerendered Select
   would show no selection, and hydration would then differ. Instead, the
   compiler turns a Select's or AutoComplete's children into one reactive
   options array. Allowed children: `Option`, `Items` whose children are
   allowed children; `when` filters. Anything else is a compile error.
2. **Both are built on Mantine's Combobox primitives** (`Combobox`,
   `useCombobox`, `InputBase`, `PillsInput`, `Combobox.Option`/`Group`/
   `Empty`), one shared component. Mantine's `Select`/`MultiSelect` don't
   take a value template, group header templates or a creatable item, and
   its `Autocomplete` is free text.
3. **`data` / `valueField` / `labelField` replace `options`** (ours, step
   16); existing uses move to `data`.

## Design

### The compiler: children as options

- A new metadata flag, `childrenAsOptions: true`, on Select and
  AutoComplete. The compiler compiles the children into a hidden binding
  `$$options: ($$s) => Option[]` (a constant when nothing is reactive).
- `<Option>` becomes `{ value, label, enabled, keywords, …extra }`: known
  props and **any other attribute** as an extra field (XMLUI: for
  `groupBy`); literals keep XMLUI's value types (`{0}` is a number).
  - A text child (with `{…}` interpolation) is the label.
  - Element children are the option's content in the list: a template
    rendered in the option's scope.
  - `when` filters the option out.
- `<Items data="…">` becomes the template's options for each item, in an
  item scope (`$item`, `$itemIndex`, `$isFirst`, `$isLast`) made by a
  runtime helper (no hook, so it works inside a binding).
- Diagnostics:
  - **E035:** an element other than `Option` / `Items` inside a Select or
    AutoComplete (or inside such an `Items`);
  - **E036:** both `data` and Option children.
- RadioGroup is unchanged: its Options still render.

### The component (`components/src/choice.tsx`)

One `ChoiceNative` on Mantine's Combobox, with two markup faces:

| | Select | AutoComplete |
|-|--------|--------------|
| Typing filters | with `searchable` | always |
| Several values | `multiSelect` | `multi` |
| Create an option | — | `creatable`, `itemCreated` |
| Open at mount | — | `initiallyOpen` |
| Input limit | — | `maxLength` |
| Clear button | `clearable` | when there is a value |

- **Options:** `data` (with `valueField`/`labelField`) or the compiled
  `$$options`; strings become `{ value, label }`. An option without both
  `value` and `label` is skipped. AutoComplete's created options join the
  list.
- **The value:** single: an option value (its type kept), `""` when
  cleared; multi: an array, `[]` when cleared. Matching compares strings,
  as XMLUI.
- **The target:**
  - a non-searchable single Select is a read-only `InputBase` showing the
    label (or the value template);
  - searchable and AutoComplete: the input is the search box;
  - multi: `PillsInput`, a pill per value (or the value template), each
    with a remove button.
- **The list:** groups (`groupBy`, the ungrouped first, with their header
  templates), the option template or the option's own content, the
  checkmark on selected options, disabled options, `dropdownHeight`
  (scrolls), `emptyListTemplate` (default: a `noresult` icon and "List is
  empty"), `inProgress` (the message instead of the list).
- **Keys:** Mantine's Combobox store gives ArrowDown/ArrowUp over enabled
  options, Enter, Escape; multi stays open after a pick; Backspace in an
  empty multi search removes the last value; AutoComplete's Enter picks the
  only item.
- **Label:** its own `label` (Mantine's `<label for>`), as ColorPicker: the
  dropdown must not be inside a `<label>`.
- **readOnly:** opens nothing, picks nothing, no remove buttons; `enabled`
  false disables it.
- **Forms:** `value`/`setValue` as every input; `required` works for an
  empty array too (`rules.ts` `isEmptyValue`); in a form, a value that
  isn't an option is dropped once the options are known.
- **API:** `value`, `setValue` (sets, no `didChange`), `focus`, `reset`
  (Select; to `initialValue`).
- **Theme variables:** the five text-input ones per component (step 24),
  plus `backgroundColor-menu-*`, `borderColor-menu-*`,
  `backgroundColor-item-*--hover`, `backgroundColor-*-badge`,
  `textColor-*-badge`.

## Divergences (planned)

- `setValue` sets the value and doesn't fire `didChange` (our inputs' rule;
  XMLUI's Select toggles and fires it).
- A searchable Select searches in its own input (Mantine's pattern), not in
  a search box inside the dropdown.
- `optionLabelTemplate` isn't implemented (it does nothing in XMLUI).
- Option children are data: an `Option` inside a user component or other
  markup within a Select is a compile error (XMLUI allows any nesting).
- Not in this step: `variant="outlined"`, the validation icons, option
  tooltips, `scrollIndicators`.

## Steps

- [x] Compiler: `childrenAsOptions`, the options binding, E035/E036,
      conformance tests.
- [x] Runtime: the item-scope helper.
- [x] `ChoiceNative`, Select and AutoComplete; metadata; `options` → `data`
      everywhere.
- [x] Unit tests (markup, keys, multi, groups, templates, creatable, forms,
      prerender).
- [x] Playground scenarios and E2E tests.
- [x] Docs: `code-structure.md`, a `choice.md` subsystem doc, `forms.md`,
      `mantine.md`.
- [x] `npm run check`.

## Outcome

- **Select and AutoComplete** with XMLUI's markup, in `choice.tsx`
  ([choice.md](../docs/choice.md)); step 16's Select (Mantine's `Select`
  with `options`) is gone, its uses moved to `data`.
- **The compiler** turns their `Option` / `Items` children into one
  reactive options array (`childrenAsOptions`); the runtime adds
  `optionItems` and `OptionContent`. The prerender shows the selection (a
  unit test renders it statically).
- **The playground:** "Select" and "AutoComplete" (with a Form), each with
  an E2E test.
- **Evidence:** `npm run check` passes and prints no warnings: 2,780 unit
  tests in 98 files, 200 E2E tests. New: `compiler/tests/module/choice.test.ts`
  (22), `components/tests/choice.test.tsx` (17), two E2E tests.
- **Size:** the hello app's entry chunk went from 816 KB to 811 KB (230 KB
  gzipped): our Combobox component is smaller than Mantine's Select plus
  its `OptionsDropdown`. `gfui.js`: 1,050 KB (300 KB gzipped).

### Findings

- **An own label loses the label behavior's look and required mark.** Select
  and AutoComplete (and step 24's ColorPicker) render Mantine's label; the
  forms E2E test caught the missing mark. The label now has the class
  `gfui-Label-text`, and the required rule matches it.
- **Mantine 9's Combobox keeps its list mounted while closed**
  (`keepMounted`, `display: none`); its keyboard navigation queries the
  options in the DOM, so we keep it. A prerendered page carries every
  option as hidden HTML.
- **In jsdom the open list is `display: none` too:** Floating UI reports
  the zero-size input as hidden. Step 16's test found options with
  `getByText`, which ignores visibility; the new tests read the list the
  expanded combobox controls (`aria-controls`).
- **Mantine's target needs `withExpandedAttribute`** for `role="combobox"`
  and `aria-expanded`; its keys read `event.code`.
- **Mantine's clear and pill-remove buttons are `aria-hidden`** and out of
  the tab order (Backspace covers removing); kept.
- **An event without configuration gets no arguments** in `wrapComponent`:
  `itemCreated` needed an entry to pass its text.
- **XMLUI's `optionLabelTemplate` does nothing** (declared in `Select.tsx`,
  never rendered).

### Divergences from XMLUI

- `setValue` sets the value without `didChange` (XMLUI's Select toggles a
  value and fires it).
- A searchable Select searches in its own input, not in a box inside the
  list; ArrowDown opens on the first option (Mantine).
- `Option` children are data: inside a Select only `Option` and `Items` of
  them (E035); XMLUI allows any nesting.
- `optionLabelTemplate` is not implemented (it does nothing in XMLUI).
- A data item's whole object is `$item` (XMLUI: `{ value, label }`).

### Open for later steps

- Select's `reset()` API; dropping a form value that isn't an option once
  the options are known (XMLUI `SelectReact.tsx` 504–525).
- `variant="outlined"`, validation icons, option tooltips,
  `scrollIndicators`.
- The hidden options in prerendered HTML (a long list): render the list
  only when open, if Mantine's keyboard navigation can be kept.
- Clear and remove buttons for keyboard and screen-reader users.
