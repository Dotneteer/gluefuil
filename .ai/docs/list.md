# List

> Subsystem reference: the virtualized `List` (step 29), its row model, the
> row selection shared with step 30's Table, and the virtualizer setup shared
> with Table, Tree and TileGrid. Describes the code as it is. Design, the
> virtualizer comparison and the XMLUI comparison:
> [`../plan/poc-29-list.md`](../plan/poc-29-list.md).
>
> **Last updated:** step 30 (the virtualizer setup and the selection state moved into `virtual.ts` and `row-selection.ts`, shared with Table).

## In markup

```xml
<List id="people" data="/api/people" height="*" orderBy="{{ field: 'name' }}"
      rowsSelectable="true" syncWithVar="picked"
      onSelectionDidChange="items => count = items.length"
      onCopyAction="(row, items, ids) => copy(items)">
  <Text>{$item.name}{$isSelected ? ' ✓' : ''}</Text>
</List>
<Button label="Top" onClick="people.scrollToTop()"/>

<List scrollAnchor="bottom" height="400px" data="{messages}">
  <Card><Markdown>@{$item.text}</Markdown></Card>
</List>

<List data="{employees}" groupBy="department">
  <property name="groupHeaderTemplate"><Button label="{$group.key}" onClick="$group.toggle()"/></property>
  <property name="groupFooterTemplate"><Text>{$group.items.length} people</Text></property>
  <Text>{$item.name}</Text>
</List>
```

| Part | Details |
|------|---------|
| Data | `data` (an array, or a URL loaded as `Items` does), `items` (alias, wins), `idKey` (default `id`), `orderBy` (`{ field, direction }` or an array), `limit`, `loading`, `loadingDelay` |
| Groups | `groupBy` (a field or a function), `groupHeaderTemplate`, `groupFooterTemplate` (`$group`: `{ id, key, items, isExpanded, toggle() }`), `availableGroups` (**filters**: only these, in this order), `defaultGroups`, `hideEmptyGroups`, `groupsInitiallyExpanded` |
| Scrolling | `scrollAnchor` (top, bottom), `fixedItemSize`, `renderCache`, `renderCacheSize` (80), `virtualBufferSize` (px) |
| Selection | `rowsSelectable`, `enableMultiRowSelection`, `initiallySelected`, `syncWithVar` (a variable's name), `rowUnselectablePredicate`, `hideSelectionCheckboxes`, `selectionCheckboxPosition` (before, overlay), `selectionCheckboxAnchor`, `selectionCheckboxOffsetX`/`Y`, `selectionCheckboxSize`, `keyBindings` |
| Other | `borderCollapse` (default true), `emptyListTemplate`, `refreshOn` (ignored, a warning) |
| Context | `$item`, `$itemIndex` (position among the shown items), `$isFirst`, `$isLast`, `$isSelected`; `$group` in the group templates |
| Events | `scroll(state)` (user scrolls only), `visibleRangeDidChange({ startIndex, endIndex })`, `selectionDidChange(items)`, `rowDoubleClick(item)`, `contextMenu(pointer, item)`, `selectAllAction`/`cutAction`/`copyAction`/`pasteAction`/`deleteAction` `(row, selectedItems, selectedIds)` |
| API | `scrollToTop`, `scrollToBottom`, `scrollToIndex(row)`, `scrollToId(id)`, `getItemCount`, `getVisibleRange`, `clearSelection`, `getSelectedItems`, `getSelectedIds`, `selectAll`, `selectId(id \| ids)` |

Not in step 29 (decision 2): `pageInfo` and `requestFetchNextPage`/`PrevPage`
(they wait for DataSource paging), `dataRefreshMode` and
`preserveStateOnNextDataRefresh`.

## How it works

### The row model (`list-model.ts`)

`listModel()` is a pure function: data → drop nullish items → `orderBy`
(stable; null last ascending and first descending, as lodash) → `limit` →
groups → rows. A row is an item, a group header or a group footer, each with
a key:

- an item's key is its `idKey` value; an empty or repeated one falls back to
  `$$index:<position>` (the List reports it once through the error reporter);
- headers are `$$group:<key>`, footers `$$group-footer:<key>`.

Header rows exist only with a `groupHeaderTemplate`, footer rows only with a
`groupFooterTemplate`. A folded group keeps its header; without a header
nothing can fold a group. `availableGroups` filters and orders (decision 5;
XMLUI's source only orders). The model also returns the shown items and their
keys in display order (folded groups included), for the selection.

### Two modes, one DOM (`list.tsx`)

```
div.gfui-List                 data-scroll="own|outside", role list or listbox
  div.gfui-List-content       data-virtual; height: the total size when virtual
    div.gfui-List-row         data-index, data-kind, data-selected, …
      div.gfui-List-check     (rowsSelectable) a Mantine Checkbox
      div.gfui-List-cell      the template
```

- **Static:** the first `STATIC_ROWS` (20) rows, or the last ones with
  `scrollAnchor="bottom"`, in normal flow. This is the server render, the
  first client render, and any time the List has no layout box (jsdom, a
  hidden tab). The prerender therefore shows a real first window, and the
  takeover reuses its row nodes (`e2e/ssg.spec.ts` checks no node is
  replaced).
- **Virtual:** once the List has a layout box (a `ResizeObserver` waits for
  it) and a scroll container: the rows TanStack Virtual returns, each placed
  absolutely at `translateY(start − scrollMargin)` and measured with
  `measureElement` (`fixedItemSize`: the first row's size for all).

**Where it scrolls:** a `height` or `maxHeight` (star sizes too) makes the
List its own scroll box. Otherwise it scrolls with the nearest scrolling
ancestor (`scrollContainer`: the first `overflow-y` auto/scroll/overlay
ancestor, else the window). Its offset there is TanStack's `scrollMargin`,
measured after every render and whenever an ancestor up to the container
resizes (content above the List changed).

**Anchoring:** `anchorTo: "end"` keeps the visible row in place when rows are
added or removed before it (XMLUI's virtua `shift`). It is used only when the
new rows keep the old first or last key (`keepsAnEdge`); a sort or a new data
set keeps the scroll offset instead (XMLUI #3936). `scrollAnchor="bottom"`
adds `followOnAppend` and an initial `scrollToEnd()`: TanStack follows appends
and growing rows while the list is at the end, and stops once the user has
scrolled away.

**The render cache** (`RenderCache` in `virtual.ts`): the keys of the last
`renderCacheSize` rows in range; the range extractor adds those that still
exist, so they stay mounted. `virtualBufferSize` sets the overscan in rows
(pixels ÷ the estimate); the default is 4 rows.

**Events:** `visibleRangeDidChange` after any render whose range changed
(TanStack's `range`: the rows in view, without overscan). `scroll` only for
user scrolls: `userScrollTracker` marks wheel, touch and key input on the
container, and a pointer held on it (a scrollbar drag); TanStack's own
classification is private.

### Selection (`selection.ts`)

Framework-free and shared with step 30's Table. XMLUI's rules
(`Table/useRowSelection.tsx`): a plain click or key selects one row; Shift
extends from the anchor (the last row clicked without Shift), skipping
unselectable rows; Ctrl/Cmd and the checkbox toggle; without
`enableMultiRowSelection` everything selects one row. Arrow keys, PageUp/Down
(8 rows), Home and End move the focus and select; an unselectable row takes
the focus but not the selection.

The List keeps the selected keys; `selectionDidChange` fires on changes (not
on mount). **`syncWithVar`:** the compiler resolves the literal name to a
visible variable (E039 otherwise) and passes its value plus a hidden handler,
`$$setSyncWithVar`. The List writes `{ ...value, selectedIds }` back and adopts
`selectedIds` that change elsewhere.

**Keyboard actions:** `keyBindings` (defaults `CmdOrCtrl+A/X/C/V`, `Delete`;
`matchesKeyBinding`) on the focused List. Select all always selects (and
prevents the page's text selection); the others act, and prevent the
browser's default, only when handled. They receive XMLUI's
`{ item, rowIndex, rowId, isSelected, isFocused }` for the focused row.

### The compiler

`PropMetadata.variableName` (step 29): the literal must name a variable
visible at the element (a `var.`, a global, `Globals.xs`). The element gets a
binding of the variable and a handler `$$set<Prop>` that assigns `$param` to
it. **E039** otherwise, with "did you mean".

## Theme variables

| Variable | Default |
|----------|---------|
| `backgroundColor-List` | `$backgroundColor` |
| `backgroundColor-selected-List` | `$color-primary-100` |
| `backgroundColor-selected-List--hover` | `$color-primary-100` |
| `backgroundColor-row-List--hover` | `$color-primary-50` |
| `outlineColor-row-List--focus` | `$color-primary-500` (ours: the focused row while the List has keyboard focus) |

The checkboxes use Checkbox's variables (`backgroundColor-Checkbox--checked`,
`borderRadius-Checkbox`). XMLUI's ten `*-selectionCheckbox-List` variables are
not declared.

## Files

| File | Contents |
|------|----------|
| `components/src/list.tsx` | `List`, `matchesKeyBinding`, `keepsAnEdge`, `DEFAULT_KEY_BINDINGS`, `STATIC_ROWS` |
| `components/src/list-model.ts` | `listModel`, `orderItems`, `valueAt`, `itemKey`, `duplicateKeys` (React-free) |
| `components/src/selection.ts` | `pickRow`, `keyTarget`, `selectAllRows`, `selectKeys` (React-free; for Table too) |
| `components/src/virtual.ts` | `useVirtualRows` (step 30: the attach, the offset and `scrollPaddingStart`, anchoring, the render cache, user scrolls; List and Table), `scrollContainer`, `offsetIn`, `scrollObservers` (element or window), `RenderCache`, `userScrollTracker`, `keepsAnEdge`, `STATIC_ROWS` |
| `components/src/row-selection.ts` | `useRowSelection` (step 30: the selection state, `syncWithVar`, `selectionDidChange`; List and Table) |
| `components/src/metadata.ts` | `List`; `PropMetadata.variableName` |
| `components/src/styles.ts` | `LIST` |
| `compiler/src/module/compile-module.ts` | `variableNameProp` (E039) |

## Tests

| File | Covers |
|------|--------|
| `components/tests/list-model.test.ts` | Tables: ordering, limits, keys, groups (fields, functions, default and available groups, folding), the selection rules, key targets, key bindings |
| `components/tests/list.test.tsx` | jsdom: templates and context, orderBy and limit, the static window (top and bottom), empty and loading, row state by key, the duplicate-key report, groups and `toggle()`, selection (clicks, checkboxes, unselectable rows, keys, single selection), the API, `syncWithVar` both ways, the keyboard actions, double click and context menu, the prerender |
| `components/tests/data.test.tsx` | `List data="/api/…"`: the spinner, then the rows |
| `compiler/tests/module/list.test.ts` | E039, the binding and the setter, `refreshOn`'s warning |
| `e2e/list.spec.ts` (project `playground`) | 10,000 rows: few mounted, no blank viewport at 300 px per frame, `scrollToIndex`/`scrollToId` exact, the range and user scrolls reported, ordering; a page-scrolled List; the chat (start at the end, follow appends and growth, stop after a user scroll, prepends keep the view); folding; selection by mouse, keys and checkboxes; Ctrl/Cmd+C; select all; the context menu; no ResizeObserver loop errors |
| `e2e/ssg.spec.ts` (hello build) | A prerendered List goes virtual on the prerendered rows: no node replaced, the selection kept |
