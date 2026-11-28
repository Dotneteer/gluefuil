# Table, Column, Value and Pagination

> Subsystem reference: `Table` and `Column` (step 30), the typed values they
> share with `Value`, and `Pagination` (moved from step 31). Describes the code
> as it is. Design, the rendering comparison and the XMLUI comparison:
> [`../plan/poc-30-table.md`](../plan/poc-30-table.md).
>
> **Last updated:** step 30.

## In markup

```xml
<Table id="orders" data="/api/orders" height="*" rowsSelectable="true" syncWithVar="picked"
       sortBy="total" defaultSortDirection="descending" pageSize="50" striped="true"
       rowVariant="{(o) => o.late ? 'warning' : null}"
       onSortingDidChange="(by, dir) => …" onWillSort="(by, dir) => by !== 'notes'">
  <Column bindTo="id" header="#" width="80px" pinTo="left" type="integer"/>
  <Column bindTo="customer" header="Customer" width="2*" minWidth="160px"/>
  <Column bindTo="total" type="currency(EUR)"/>
  <Column bindTo="urgent" type="switch"
          onDidChange="(v, row) => orders = orders.map(o => o.id === row.id ? { ...o, urgent: v } : o)"/>
  <Column header="Status" pinTo="right"><Badge value="{$cell}"/></Column>
  <property name="rowDetailTemplate"><Text>{$item.notes}</Text></property>
</Table>

<Table data="{rows}"/>                                     <!-- columns inferred -->
<Value value="{1234.5}" type="currency(USD)"/>
<Pagination itemCount="120" pageSize="10" maxVisiblePages="5" onPageDidChange="i => page = i"/>
```

| Part | Details |
|------|---------|
| Data | `data` (array or URL, as `Items`), `items`, `idKey`, `loading`, `loadingDelay`, `noDataTemplate`, `columnInference` (`first-n(25)`, `first-only`, `sample(n)`, `all`, `off`), `columnSizing` (`auto`, `stretch`, `balanced`, `content`) |
| Columns | `Column`: `bindTo` (a dotted path), `header`, `headerHorizontalAlignment`, `width` (px, a number, rem/em, `*`, `2*`), `minWidth`, `maxWidth`, `canSort`, `defaultSortDirection`, `pinTo`, `canResize`, `type`, `typeOptions`, `readOnly`, `enabled`, `tooltip` (a title); children are the cell (`$item`/`$row`, `$itemIndex`/`$rowIndex`, `$cell`, `$colIndex`, `$rowId`); `willChange` (false cancels), `didChange` `(newValue, row, rowIndex, columnId)` |
| Sorting | `sortBy`, `sortDirection`, `defaultSortDirection`, the icons (`iconNoSort`, `iconSortAsc`, `iconSortDesc`; `-` hides), `alwaysShowSortingIndicator`; `willSort`, `sortingDidChange` |
| Selection | `rowsSelectable`, `enableMultiRowSelection`, `toggleSelectionOnClick`, `initiallySelected`, `syncWithVar`, `rowUnselectablePredicate`, `rowDisabledPredicate`, the `hide…`/`alwaysShow…` checkbox props, `checkboxTolerance`, `keyBindings` and the action events |
| Paging | `isPaginated`, `pageSize` (alone: pages when the rows don't fit), `pageSizeOptions`, `showPageInfo`, `showPageSizeSelector`, `showCurrentPage`, the three positions, `paginationControlsLocation`, `alwaysShowPagination` |
| Rows | `rowDetailTemplate` (`$isExpanded`), `expandedRowIds`, `initiallyExpandedRowIds`, `rowVariant`, `striped`, `highlightHoveredColumn`, `cellVerticalAlign`, `noBottomBorder`, `hideHeader`, `alwaysShowHeader`, `headerHeight`, the `userSelect*` props, `autoFocus`, `renderCache`, `renderCacheSize`, `virtualBufferSize`, `canResizeColumns` |
| Events | `rowClick`, `rowDoubleClick`, `rowEnter`, `rowLeave`, `contextMenu(pointer, item)`, `scroll`, `visibleRangeDidChange`, `selectionDidChange`, `rowExpansionDidChange(ids, id, open)`, the five actions |
| API | the scroll methods, `getItemCount`, `getVisibleRange`, `expandRow`, `collapseRow`, `toggleRowExpansion`, `getExpandedRowIds`, `isRowExpanded`, the selection methods |

Not in step 30: `dataRefreshMode`, `preserveStateOnNextDataRefresh`,
server-side paging. `syncWithAppState` is E030 (no `AppState`); `refreshOn` is
ignored with a warning.

## How it works

### Columns as data (decision 2)

`Table`'s metadata has `childrenAsColumns: "Column"`. The compiler turns each
`Column` (also inside an `Items`, keyed `position:$itemIndex`; `when` keeps it
while it holds) into an entry of the hidden binding `$$columns`:

```js
{ "$$key": "1", "bindTo": "total", "type": "currency(EUR)",
  "$$cell": $$T3, "$$scope": $$s, "$$handlers": { "onDidChange": ($$s) => … } }
```

Nothing compiles in place, so the prerender has the header and the cells.
Other children are **E040**; an `id`, a variable or a prefixed attribute on a
Column is E002; unknown props E020. The Table renders a cell template with
`templateRenderer(entry.$$scope, entry.$$cell)` and wraps each handler factory
in a `HandlerSlot` (activated and disposed with the Table).

### The column model (`table-model.ts`, decision 1)

- **Columns:** the entries, or (no Column children) the sampled rows' keys
  with an inferred type (`inferColumnType`, XMLUI's rules).
- **Widths:** `parseWidth` (px, numbers, rem/em, stars). A column without a
  width gets one by `columnSizing`: `stretch` gives stars; `balanced` gives
  text-like types stars (long text and markdown `2*`) and fixed widths to the
  rest (XMLUI's tables); interactive types fit their control and header.
- **Grid tracks:** `columnTrack`: a star is `minmax(min, Nfr)`, a fixed width
  `clamp(min, w, max)`, a resized one px. Every row (header too) is a grid
  with the same `grid-template-columns`, and a `min-width` adding up the
  minimums, so a narrow Table scrolls sideways instead of squeezing.
- **Sorting:** `nextSort` (first direction, other, unsorted; clearing reports
  the direction on screen), `sortRows` (stable, `Intl.Collator`, nulls last
  ascending and first descending).
- **Paging:** `pageSlice`, `pageCount`.

### The Table (`table.tsx`)

- **Rows** are the shown items (sorted, then the page) plus a detail row after
  each expanded one; virtualized by `useVirtualRows` (`virtual.ts`, shared
  with List): the static window on the server and in jsdom, then rows placed
  absolutely. In its own scroll box the header is sticky and covers the top,
  so the rows' offset and `scrollPaddingStart` are the header's height.
- **Pinning:** sticky cells; offsets from the measured header cell widths (a
  `ResizeObserver`), px widths before measuring. The selection and expansion
  columns go with the left-pinned ones. A pinned cell paints the row's
  background (`--gfui-row-bg`) over an opaque base.
- **Resizing:** a `role="separator"` handle at each resizable header's edge:
  pointer capture while dragging, arrow keys (10 px, Shift 50 px), within the
  column's px limits (`clampWidth`). The width is kept by column key.
- **Selection:** `row-selection.ts` (shared with List: state,
  `initiallySelected`, `syncWithVar`, `selectionDidChange`) and
  `selection.ts`'s rules; the header checkbox selects or clears the page's
  rows; disabled rows can't be selected.
- **Typed cells:** `renderValue` (`value.tsx`); `checkbox` and `switch` are
  Mantine's, `color` a native color input. Their value comes from the data,
  so a change shows once the handler assigns the variable (decision 5); a
  `TypeError` from writing a frozen row is reported as "table rows are
  read-only. Assign the variable instead, …".
- **Copying** (decision 3): a selection across cells copies the selected data
  cells as tab-separated values, a line per row (the `copy` event).
- **Paging:** the `Pager` of `pagination.tsx`, controlled by the Table.

### Typed values (`value-types.ts`, `value.tsx`)

A port of XMLUI's `Value/value-types.ts` and `value-formatting.ts`: 45 types,
the type syntax (`name`, positional or named arguments, no mixing), and
`typeOptions` that win over the arguments. A problem falls back to `text`
(the Table reports it once). `formatValue` returns a render model (text,
number parts, a link, a color, an image, an icon); `renderValue` renders it.
Numbers and dates use `typeOptions.locale` or the browser's locale (no
locale profiles until step 34).

### Pagination (`pagination.tsx`)

`Pager` is controlled (the Table's). `Pagination` keeps its page and page size,
starting from `pageIndex`/`pageSize` and following their changes, and fires
`pageDidChange(pageIndex, pageSize, itemCount)` and `pageSizeDidChange`. XMLUI's
layout: three slots, start, center and end; page buttons by
`maxVisiblePages` (1, 3, 5); without `itemCount` only previous and next.

### The locale (step 34)

Typed cells (`Value` too) format in the nearest locale (the App's, or a
`<Locale>`'s) unless `typeOptions.locale` sets one; sorting collates in it.
Pinned columns use `insetInlineStart`/`End`, so in RTL `pinTo="left"` sticks
to the start (right) side; the resizer sits on the inline end and its drag is
mirrored ([i18n.md](i18n.md#direction)).

## Theme variables

Table: `backgroundColor-Table`, `textColor-Table`, `borderRadius-Table`,
`borderColor-cell-Table`, `padding-cell-Table`, `fontSize-row-Table`,
`fontWeight-row-Table`, `backgroundColor-row-Table` (`--hover`),
`textColor-row-Table`, `backgroundColor-selected-Table` (`--hover`),
`backgroundColor-evenRow-Table`, `backgroundColor-oddRow-Table`,
`backgroundColor-heading-Table` (`--hover`), `textColor-heading-Table`,
`fontWeight-heading-Table`, `fontSize-heading-Table`,
`textTransform-heading-Table`, `backgroundColor-pinnedCell-Table`,
`backgroundColor-column-Table--hover`, `outlineColor-row-Table--focus`; row
variants `backgroundColor-row-<name>-Table` (`--hover`) and
`textColor-row-<name>-Table` (accepted by the theme checker by pattern).
Value: `borderColor-Value`.

## Files

| File | Contents |
|------|----------|
| `components/src/table.tsx` | `Table`, `Column` |
| `components/src/table-model.ts` | Columns, inference, widths, sorting, paging (React-free) |
| `components/src/value-types.ts` | The 45 types, the type syntax, formatting (React-free) |
| `components/src/value.tsx` | `Value`, `renderValue` |
| `components/src/pagination.tsx` | `Pagination`, `Pager`, `visiblePages` |
| `components/src/row-selection.ts` | `useRowSelection` (List and Table) |
| `components/src/virtual.ts` | `useVirtualRows` (List and Table) |
| `components/src/styles.ts` | `TABLE`, `VALUE`, `PAGINATION` |
| `compiler/src/module/compile-module.ts` | `columnParts`, `columnItems`, `columnEntry` (E040) |

## Tests

| File | Covers |
|------|--------|
| `components/tests/table-model.test.ts` | Tables: the type syntax and its problems, formatting of every kind, inference, `columnInference`, widths and tracks, sizing modes, sorting, paging, the pager's pages |
| `components/tests/table.test.tsx` | jsdom: columns and cells, inference, Items of Columns and `when`, the shared grid template, empty and loading, sorting (cycle, `willSort`, `defaultSortDirection`), selection (header checkbox, toggling, disabled rows, keys, actions, `syncWithVar`), editable cells and the read-only error, row details and their API, paging, row variants, row events, the API, `Value`, `Pagination`, the prerender |
| `compiler/tests/module/table.test.ts` | E040, E037, E002, E020 on Columns, the entries, Items of Columns, `when`, E030 for `syncWithAppState` |
| `e2e/table.spec.ts` (project `playground`) | 10,000 rows (few mounted, no blank frame, `scrollToId` under the header), sorting by click and key, resizing by drag and keys (measured), pinned columns (measured), selection, copying as tab-separated rows, types and inference, editable cells with `willChange`, row details, paging, `Pagination` |
| `e2e/ssg.spec.ts` (hello build) | A prerendered Table goes virtual on its prerendered rows, the selection kept |
