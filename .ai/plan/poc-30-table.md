# Step 30: Table and Column

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the eighth batch of Phase F: `Table` and
`Column`. E2E is needed for sorting, selection, resizing, pinning, pagination
and editable cells. The step builds on step 29: the virtualizer (TanStack
Virtual, `virtual.ts`) and the row selection (`selection.ts`) are shared.

## Goal

```xml
<Table id="orders" data="/api/orders" height="*" rowsSelectable="true"
       sortBy="total" defaultSortDirection="descending" pageSize="50"
       onSelectionDidChange="items => count = items.length">
  <Column bindTo="id" header="#" width="70px" pinTo="left"/>
  <Column bindTo="customer" header="Customer" width="2*"/>
  <Column bindTo="total" header="Total" type="currency(EUR)"/>
  <Column bindTo="paidAt" header="Paid" type="date(short)"/>
  <Column bindTo="urgent" header="Urgent" type="switch"
          onDidChange="(value, row) => setUrgent(row.id, value)"/>
  <Column header="Actions" canSort="false">
    <Button label="Open" onClick="navigate('/orders/' + $item.id)"/>
  </Column>
  <property name="rowDetailTemplate"><Text>{$item.notes}</Text></property>
</Table>

<Table data="{rows}"/>   <!-- no Column children: columns inferred from the data -->
```

XMLUI's markup and behavior; the header and the first rows prerendered;
sorting, selection, resizing, pinning, paging and editable cells proven in a
real browser.

## Background

### XMLUI

- **Table:** metadata `xmlui/src/components/Table/Table.tsx` (1,415 lines),
  defaults `Table.defaults.ts`, implementation `TableReact.tsx` (3,712 lines),
  selection `useRowSelection.tsx`, inference `table-column-inference.ts`,
  docs `website/content/docs/reference/components/Table.md`.
- **Column:** `xmlui/src/components/Column/Column.tsx`, `ColumnReact.tsx`,
  `TableContext.tsx`; docs `Column.md`.
- **Typed values:** `xmlui/src/components/Value/` (`value-types.ts`,
  `value-formatting.ts`, 1,403 lines), shared by Column `type` and the
  `Value` component.
- **Pagination:** `xmlui/src/components/Pagination/`; docs `Pagination.md`.
  The Table's paging props "work the same as" Pagination's.
- **How-to guides** (`website/content/docs/pages/howto/`, 28 use a Table), among
  them `format-table-columns-by-type.md`, `use-interactive-column-controls.md`,
  `pin-columns-in-a-wide-table.md`, `auto-size-column-widths-with-star.md`,
  `sort-a-table-by-a-computed-value.md`, `enable-multi-row-selection-in-a-table.md`,
  `highlight-rows-conditionally.md`, `make-a-table-responsive.md`,
  `add-row-actions-with-a-context-menu.md`, `render-a-custom-cell-with-components.md`.

**Table props** (`Table.tsx`; defaults from `Table.defaults.ts`)

- **Data:** `data` (array or URL), `items` (internal alias), `idKey` (`id`),
  `loading`, `loadingDelay` (400), `noDataTemplate`, `columnInference`
  (`first-n(25)`, `first-only`, `sample(n)`, `all`, `off`), `columnSizing`
  (`auto`, `stretch`, `balanced`, `content`).
- **Sorting:** `sortBy`, `sortDirection`, `defaultSortDirection` (ascending;
  the first click's direction; the cycle has three states), `iconNoSort`,
  `iconSortAsc`, `iconSortDesc`, `alwaysShowSortingIndicator`.
- **Selection:** `rowsSelectable`, `enableMultiRowSelection` (true),
  `toggleSelectionOnClick`, `initiallySelected`, `syncWithVar`,
  `syncWithAppState` (an `AppState` instance), `rowUnselectablePredicate`,
  `rowDisabledPredicate`, `hideSelectionCheckboxes`,
  `hideSelectionCheckboxesHeader`, `alwaysShowSelectionCheckboxes`,
  `alwaysShowSelectionCheckboxesHeader`, `checkboxTolerance` (none, compact,
  comfortable, spacious: 0, 8, 12, 16 px), `keyBindings`.
- **Paging:** `isPaginated`, `pageSize` (alone it pages only when the data is
  longer), `pageSizeOptions` ([5, 10, 15]), `showPageInfo`,
  `showPageSizeSelector`, `showCurrentPage`, `pageSizeSelectorPosition`,
  `pageInfoPosition`, `buttonRowPosition`, `paginationControlsLocation` (top,
  bottom, both), `alwaysShowPagination`.
- **Rows:** `rowVariant` (a function naming a variant; theme variables
  `backgroundColor-row-<name>-Table`, `…--hover`, `textColor-row-<name>-Table`),
  `rowDetailTemplate` (adds an expansion column), `expandedRowIds`,
  `initiallyExpandedRowIds`, `striped`, `cellVerticalAlign` (center),
  `highlightHoveredColumn`.
- **Header and layout:** `hideHeader`, `alwaysShowHeader` (sticky on page
  scroll), `headerHeight`, `canResizeColumns` (true), `noBottomBorder`,
  `autoFocus`.
- **Virtualization:** `renderCache` (true), `renderCacheSize` (80),
  `virtualBufferSize`.
- **Text selection:** `userSelectCell`, `userSelectRow`, `userSelectHeading`,
  `headerUserSelect`, `cellUserSelect`.
- **Refresh:** `dataRefreshMode`, `refreshOn` (as List's).

**Table events:** `sortingDidChange(by, direction)`, `willSort(by, direction)`
(false cancels), `rowClick`, `rowDoubleClick`, `rowEnter`, `rowLeave`,
`contextMenu`, `scroll`, `visibleRangeDidChange`, `selectionDidChange`,
`rowExpansionDidChange`, `selectAllAction`, `cutAction`, `copyAction`,
`pasteAction`, `deleteAction`.

**Table API:** `scrollToTop`, `scrollToBottom`, `scrollToIndex`, `scrollToId`,
`getItemCount`, `getVisibleRange`, `expandRow`, `collapseRow`,
`toggleRowExpansion`, `getExpandedRowIds`, `isRowExpanded`, `clearSelection`,
`getSelectedItems`, `getSelectedIds`, `selectAll`, `selectId`,
`preserveStateOnNextDataRefresh`.

**Context:** `$item`/`$row`, `$itemIndex`/`$rowIndex`, `$cell`, `$colIndex`,
`$rowId`, `$isExpanded`.

**Column** (`Column.tsx`): `bindTo`, `header`, `headerHorizontalAlignment`,
`tooltip`, `tooltipOptions`, `width` (px, a number, or a star size `*`, `2*`),
`minWidth`, `maxWidth`, `canSort` (true), `defaultSortDirection`, `pinTo`
(left, right), `canResize`, `type`, `typeOptions`, `readOnly`, `enabled`;
events `willChange` and `didChange` `(newValue, row, rowIndex, columnId)`, for
the interactive types. Child markup is the cell template and overrides `type`.

**Column types** (`Value/value-types.ts`): 45 names (the plan first said 46, a miscount), with positional or named
arguments in the type string (`number(8,3)`, `currency(EUR)`,
`url(label:domain)`, `long-text(lines:2)`), and `typeOptions` that win over
them. Groups (`Column.md` § Type Syntax and the tables after it):

- text and identifiers: `text`, `short-text`, `long-text`, `markdown`, `code`,
  `id`, `uuid`, `name`, `address`;
- links: `email`, `phone`, `url`, `link`;
- numbers (end-aligned, decimal-aligned): `number`, `integer`, `decimal`,
  `percent`, `currency`, `accounting`, `scientific`, `bytes`, `duration`,
  `rating`;
- dates: `date`, `time`, `datetime`, `relative-time`, `timestamp`, `iso-date`;
- choice and booleans: `boolean`, `checkbox`, `switch`, `yes-no`, `enum`,
  `status`;
- visual and structured: `color`, `tag`, `tags`, `image`, `avatar`, `icon`,
  `json`, `object`, `array`, `list`.

`checkbox`, `switch` and `color` are interactive and fire `willChange` and
`didChange`.

**Column inference** (`Table.md` § How Inference Works): with no Column
children, the sampled rows' keys become sortable columns, each with an
inferred type (uuid, id for `idKey`, integer or number, boolean, tags, array,
object, date, datetime, email, url or phone, name-like fields, long-text over
80 characters, low-cardinality enums, text). `columnSizing` then sizes them by
type (`auto`: `balanced` for inferred columns, `stretch` for explicit ones).

**How XMLUI builds it** (`TableReact.tsx`):

- **Columns register in layout effects** (`ColumnReact.tsx` 107–131), as
  TabItems did: a prerendered Table has no columns.
- **A real `<table>`** (`TableReact.tsx` 3424) whose rows are virtua items
  (3596).
- **TanStack Table v8 does little:** the core and pagination row models,
  column sizing, resizing and pinning (lines 12–18, 1899–1984). XMLUI sorts
  its own data (`sortedData`, 1559; `willSort` 1598) and selects with its own
  `useRowSelection`.
- **Pinned columns are `position: sticky`** with offsets (999–1015).

### Here

- **Step 29:** `virtual.ts` (where it scrolls, element-or-window observers,
  the render cache, user scrolls), `selection.ts` (XMLUI's selection rules,
  written for the Table too), `list-model.ts` (`orderItems`, `valueAt`,
  `itemKey`, `duplicateKeys`), the static window and the takeover,
  `variableName` and E039 for `syncWithVar`, `matchesKeyBinding`.
- **Step 28:** headers compiled to data (`childrenAsHeaders`, E038) while the
  items compile in place; **step 25:** Option children compiled to data, with
  their content as a template. Columns need the same, so the prerender has
  the header and the cells.
- **Step 28's Splitter:** pointer capture with the grab offset kept, arrow
  keys on a `role="separator"`: what a column resize handle needs.
- **Display components** (step 23): `Icon`, `Image`, `Avatar`, `Badge`,
  `Markdown` (lazy), `Link`; **inputs** (step 24): `Checkbox`, `Switch`,
  `ColorPicker` for the interactive types.
- **Data values are deep-frozen.** Only a variable's own name is
  copy-on-write. **Measured:** XMLUI's documented
  `onDidChange="(newValue, row) => row.selected = newValue"`
  (`Column.md` § didChange, `use-interactive-column-controls.md`) throws here:
  `TypeError: Cannot assign to read only property 'done'`.
- **No `AppState` component** and no locale support yet (step 34): typed
  dates and numbers format with the browser's locale.
- **Not built yet:** `Pagination` (step 31), DataSource paging (step 29's open
  item), the `Value` component (step 32's list doesn't name it).

### TanStack Table v9

Stable since 2026 (`@tanstack/react-table` 9.3.1, 2026-10-12; table-core
9.3.1; it depends on `@tanstack/react-store`). Headless; features are
registered one by one (`tableFeatures({ rowSortingFeature, … })`); state lives
in its own store, with pluggable reactivity bindings. **Measured** (esbuild,
React external, in `.tmp/vproto/.size/`):

| Features | Minified | Gzipped |
|----------|----------|---------|
| sorting, pagination, sizing, resizing, pinning, expanding | 59.8 KB | 17.4 KB |
| sizing, resizing, pinning only | 46.4 KB | 13.5 KB |

Most of it is the core and its store: the features we would use are small on
top of it.

## Options considered

### A. The table engine *(the first decision)*

architecture.md recommended "TanStack Table v9 + a headless virtualizer,
rendered with Mantine primitives" (§ List and Table), before step 29 showed
how much of the work is ours anyway. What a Table needs, and who would do it:

| Need | TanStack Table v9 | Our own |
|------|-------------------|---------|
| Sorting with `willSort`, three-state cycle, `defaultSortDirection` per column | its sorted model, with our cycle and cancel around it (XMLUI sorts itself even with v8) | `orderItems` (step 29) plus the cycle |
| Paging | `createPaginatedRowModel` | a slice |
| Column widths: px, star sizes, min/max, the `columnSizing` modes | px sizes only; stars are ours (XMLUI converts them, 1689–1713, 2772) | ours either way |
| Resizing | `columnResizingFeature` | a drag handle like the Splitter's |
| Pinning | offsets from `columnPinningFeature` | the sum of the pinned columns' widths before it |
| Selection, keys, actions | — (XMLUI doesn't use v8's) | `selection.ts` |
| Expansion (row details) | `rowExpandingFeature` | a set of ids |
| State and reactivity | its store, bridged to our signals (as step 20 did for query-core) | our signals |

1. **TanStack Table v9:** tested sizing, resizing and pinning arithmetic, and
   a path to filtering, grouping and aggregation if we ever add them (XMLUI's
   Table has none of these). Costs 13–17 KB gzipped and a second reactive store
   to bridge, and still leaves sorting semantics, star sizes, selection and
   all rendering to us.
2. **Our own column model** *(recommended)*: pure functions next to
   `list-model.ts` (columns from Column data or inference, widths, pinning
   offsets, sort cycle, page slice), tested in tables like step 29's. No new
   dependency and one reactive system. The Splitter's drag code covers resizing.
   We own the resize and pinning arithmetic (and its bugs).

### B. Where Column children go

1. **XMLUI's way:** each Column registers in an effect. The prerendered Table
   has no header and no cells; columns appear on takeover.
2. **Columns compiled to data** *(recommended)*, as step 25's Options and step
   28's headers: a new `childrenAsColumns` metadata flag. Each `Column` (also
   inside an `Items`) becomes `{ $$key, …props, $$cell (its children as a
   template), $$scope }`, and its `willChange`/`didChange` become handler
   factories in the same entry, wired by the runtime as `Bound` wires an
   element's. Other children are an error (E040). The prerender has the header
   and the first rows.

### C. Rendering and virtualization

**Compared in a prototype** (asked by the user; `.tmp/vproto/tables.html`,
`measure-tables.mjs`, `stars.mjs`, `hybrid.mjs`): the same 10,000 rows of
different heights and 8 columns (1,200 px wide in a 900 × 600 box, so it also
scrolls sideways; a pinned column on each side; a sticky header), TanStack
Virtual in both, React 19 production build, Chromium; three runs each.

- **Native:** `<table>`, `table-layout: fixed`, a `<colgroup>`, sticky
  `<thead>` and pinned cells, the rows in range between two `aria-hidden`
  spacer rows.
- **Grid:** `role="table"` divs; each row a CSS grid with the same
  `grid-template-columns`, placed absolutely as the List's rows.

| Case | Native `<table>` | Grid of divs |
|------|------------------|--------------|
| Mount, 10,000 / 50,000 rows | 15 / 18 ms | 15 / 19 ms |
| Fast scroll, 60 frames at 300 px: blank frames; frame p50 / p95 / max | 0; 16.5 / 18.1 / 19 ms | 0; 16.5 / 18.3 / 19 ms |
| `scrollToIndex(5000)`: the row's top under the 32 px header | exact (32) | exact (32) |
| After scrolling both ways: header top, left pin, right pin | 0, 0, 0 px | 0, 0, 0 px |
| Column width while scrolling (320 px set) | 320 at every position | 320 at every position |
| Resizing a column (320 → 520 px), to the next frame | 2–3 ms | 2–3 ms |
| DOM nodes in the scroll box | 121 | 111 |
| "ResizeObserver loop" errors (XMLUI's wheel pattern) | 0 | 0 |
| Accessibility tree | table, rowgroups, 12 rows, 8 column headers, 88 cells | the same (with explicit roles) |
| **Copying a selection across cells** | **tab-separated cells, a line per row** (pastes into a spreadsheet as cells) | **one cell per line** |
| **Star widths (`200px`, `2*`, `*` in 900 px)** | **200 / 350 / 350**: Chromium ignores `calc()` in `<col>` widths, so weighted stars need JavaScript, and the prerender shows equal widths until takeover | **200 / 467 / 233** in CSS (`2fr`, `minmax()`), prerender included |
| Min and max widths | 200 / 580 / 120 | 200 / 580 / 120 (`minmax(80px, 120px)`) |

- **Speed and correctness are the same.** The differences are copying and
  star widths.
- **A hybrid** (table elements with `display: grid`) gets the grid's widths
  and the grid's copy format: copying follows layout, not element names.
- **Not measured:** printing repeats a native `<thead>` on each page (of the
  rows rendered); `aria-rowcount`/`aria-rowindex` are valid on both
  (Chrome's accessibility protocol doesn't expose them for a check).

1. **A native `<table>`:** copying works as a spreadsheet expects with no code;
   weighted star widths are measured (a `ResizeObserver`), and a prerendered
   Table with weighted stars shifts its columns at takeover. Spacer rows,
   unlike the List.
2. **A grid of divs with table roles** *(recommended)*: star sizes, min and
   max in CSS, exact in the prerender, nothing measured; rows positioned as
   the List's (shared code). A `copy` handler (about 30 lines) puts the
   selected cells on the clipboard as tab-separated rows, so copying matches
   the native table.

### D. Typed cells (`type`, `typeOptions`)

1. **All 45 types,** the type syntax and `typeOptions`, and the `Value`
   component that shares them. The largest part of the step.
2. **A core set now** *(recommended)*: the type syntax, `typeOptions`, and the
   types the how-to guides use most: `text`, `long-text`, `code`, `id`, `uuid`,
   `name`; `email`, `phone`, `url`, `link`; `number`, `integer`, `decimal`,
   `percent`, `currency`, `bytes`; `date`, `time`, `datetime`, `iso-date`;
   `boolean`, `yes-no`, `checkbox`, `switch`, `color`, `enum`, `status`;
   `tags`, `image`, `avatar`, `json`. An unknown or deferred type falls back
   to `text` with a compile warning. The rest (`markdown`, `accounting`,
   `scientific`, `duration`, `rating`, `relative-time`, `timestamp`, `tag`,
   `icon`, `object`, `array`, `list`, `short-text`, `address`) and the
   `Value` component come with step 32.
3. **No types:** cells are text or templates; `type` waits. Column inference
   then has nothing to infer.

### E. Saving an edited cell

Our data is frozen, so `row.done = value` in `didChange` throws (measured
above), while XMLUI's docs use exactly that.

1. **Update the variable explicitly** *(recommended)*:
   `onDidChange="(value, row) => rows = rows.map(r => r.id === row.id ? { ...r, done: value } : r)"`,
   documented, with a clearer runtime error for the XMLUI pattern ("table rows
   are read-only; assign the variable").
2. **Write-back by the Table:** when `data` is a plain variable
   (`data="{rows}"`), the compiler also passes a setter (as `syncWithVar`'s),
   and an interactive cell replaces its row in the variable after `willChange`
   and before `didChange`. XMLUI's examples then work without their
   `row.x = …` line (which would still throw).

### F. Pagination

1. **A `Pagination` component now,** on Mantine's `Pagination` with a page-size
   `Select` and page info, used by the Table and usable on its own
   (XMLUI's props, events and API) *(recommended)*. Step 31 then has one
   component less.
2. **Only the Table's own pager;** the component waits for step 31.

## Design

- **Files:** `components/src/table.tsx` (Table, Column), `table-model.ts`
  (React-free: columns from data or inference, widths, pinning offsets, the
  sort cycle, the page slice), `cell-types.ts` (React-free: the type syntax,
  options, formatting) and `cells.tsx` (the typed cells, the interactive ones
  on step 24's inputs), `pagination.tsx` (decision F). Reused: `virtual.ts`,
  `selection.ts`, `orderItems`, `matchesKeyBinding`, `keepsAnEdge`.
- **Columns** (decision B): `childrenAsColumns`; the cell template sees
  `$item`/`$row`, `$itemIndex`/`$rowIndex`, `$cell`, `$colIndex`, `$rowId`.
  With no Column children, inference (`columnInference`) builds the same column
  entries, with an inferred type (decision D's types).
- **Widths:** px, numbers, star sizes; min and max; `columnSizing` modes.
  Star columns share what the fixed ones leave, computed from the Table's
  width (a `ResizeObserver`); the prerender uses CSS percentages for the stars
  so it is close before measuring (to verify in the implementation). A resized
  column keeps its px width; the stars share the rest.
- **Resizing:** a handle at each resizable header's edge (`role="separator"`,
  pointer capture, arrow keys), as the Splitter's; limited by min and max.
- **Pinning:** `pinTo` left or right: sticky cells, offsets from the pinned
  widths before them; `backgroundColor-pinnedCell-Table`.
- **Sorting:** a header click cycles (first direction from the column's or the
  Table's `defaultSortDirection`, then the other, then unsorted); `willSort`
  can cancel; `sortingDidChange`; `sortBy`/`sortDirection` are the initial
  state and follow later changes; `aria-sort`; the sort icons.
- **Rows:** virtualized as the List's (decision C), the render cache and the
  buffer; own scroll box with a height, else the container's;
  `alwaysShowHeader` makes the header sticky on page scroll (under a sticky
  AppHeader: `--gfui-shell-top`). The prerender shows the header and the first
  `STATIC_ROWS` rows.
- **Selection:** `selection.ts` plus `toggleSelectionOnClick`,
  `rowDisabledPredicate`, a header checkbox (select all, indeterminate), the
  `alwaysShow…`/`hide…` checkbox props, `checkboxTolerance`; `syncWithVar`
  as List's. `syncWithAppState` is an error (E030, removed): there is no
  `AppState`.
- **Row details:** `rowDetailTemplate` adds an expansion column; a detail row
  under an expanded row (measured like any row); `expandedRowIds` (controlled)
  or `initiallyExpandedRowIds`; `rowExpansionDidChange`; the expansion API.
- **Row styling:** `rowVariant` (data-variant with the three theme variables
  per name), `striped`, hover, selected, disabled, `highlightHoveredColumn`,
  `cellVerticalAlign`, `headerHeight`, `noBottomBorder`, the `userSelect*`
  props.
- **Paging** (decision F): `isPaginated`, `pageSize` (auto paging),
  `pageSizeOptions`, the show/position props, `paginationControlsLocation`,
  `alwaysShowPagination`. Paging is client-side (DataSource paging is not
  built).
- **Events and API** as XMLUI's above; row events and `contextMenu` pass the
  row's item (`contextMenu`: after the pointer snapshot, as List's).
- **Editable cells** (decision E): `checkbox`, `switch`, `color` render
  step 24's inputs; `readOnly` and `enabled` (values or functions of the row);
  `willChange` (false cancels), then `didChange`.
- **Not in step 30:** `dataRefreshMode`, `preserveStateOnNextDataRefresh`,
  server-side paging (as for List); `refreshOn` is ignored with a warning, as
  List's.
- **Theme variables:** XMLUI's names (`Table.module.scss`), our tokens as
  defaults.

## Steps

- [x] The compiler: `childrenAsColumns` (Columns to data, Items of Columns,
      their handlers), E040; tests.
- [x] `table-model.ts`: columns, inference, widths and modes, pinning offsets,
      the sort cycle, the page slice; tables.
- [x] `cell-types.ts` and `cells.tsx` (decision D): the type syntax, options,
      formatting, the interactive cells; tables.
- [x] The Table: header, rows (virtualized), sorting, resizing, pinning,
      selection and the header checkbox, row details, row styling, events,
      API, the prerender.
- [x] `Pagination` (decision F) and the Table's paging.
- [x] Unit tests (jsdom); playground scenarios ("Tables", "Table columns and
      types", "Editable and paged tables"); E2E.
- [x] Docs: `code-structure.md`, a new `table.md`; architecture.md's table
      paragraph; *Decisions* in `AGENTS.md`.
- [x] `npm run check`; measure the bundle.

## Verification

- **jsdom:** tables for the column model (inference, widths, star shares,
  modes, pinning offsets), the sort cycle and `willSort`, the type syntax and
  each type's formatting; the Table through markup (columns from children and
  Items, templates and context variables, sorting, selection with the header
  checkbox, row details, paging, events and API, `syncWithVar`, editable
  cells with `willChange` cancelling); the prerender (header and first rows).
- **E2E:** sorting by clicks and keys; selection by mouse, keys and the header
  checkbox; resizing by dragging and by keys (measured; min and max); pinned
  columns stay while scrolling sideways (measured); 10,000 rows scroll with no
  blank viewport and a sticky header; paging and the page-size selector; a row
  detail grows the row; an editable switch saves through the variable; a
  prerendered Table taken over without replacing nodes.

## Outcome

- **The components:** `Table`, `Column`, `Value`, `Pagination`
  ([table.md](../docs/table.md)). No new dependency.
- **Shared with List (step 29), moved out of `list.tsx`:** `useVirtualRows`
  (`virtual.ts`) and `useRowSelection` (`row-selection.ts`). The List's tests
  pass unchanged on them.
- **The compiler:** `childrenAsColumns` (Columns to data, Items of Columns,
  their handlers and cell templates), **E040**.
- **The playground:** "Tables", "Table columns and types", "Editable and paged
  tables" (48 scenarios). The hello app has a Table, so the prerender and the
  takeover are checked on it.
- **Evidence:** `npm run check` passes and prints no warnings: 3,145 unit
  tests in 111 files, 260 E2E tests. New: `components/tests/table-model.test.ts`
  (101), `table.test.tsx` (18), `compiler/tests/module/table.test.ts` (16),
  `e2e/table.spec.ts` (10; 30 of 30 with `--repeat-each=3`), three scenario
  tests, a Table check in `ssg.spec.ts`.
- **Size** (against a build of `master`): the hello app's eager JavaScript
  1,056 → 1,126 KiB (289 → 307 KiB gzipped); `gfui.js` 1,481 → 1,555 KiB.

### Findings

- **XMLUI has 45 value types, not 46** (the plan miscounted; counted from
  `VALUE_TYPE_NAMES` in `value-types.ts`).
- **The sticky header covered the row `scrollToId` scrolled to** (40 px under
  it). The rows' offset in their own box is the header's height, and it is now
  also TanStack's `scrollPaddingStart`.
- **Pinned cells were white on striped, hovered or selected rows.** Rows now
  set their background as `--gfui-row-bg`, and a pinned cell paints it over an
  opaque base. The selection header cell took the pinned color instead of the
  heading's.
- **XMLUI's header width estimate (7 px per character) cut interactive
  columns' headers** ("Enab…"): our headers are larger. 8.5 px.
- **Two APIs read stale state** when a handler changed and then read in one
  go (`p.moveLast(); p.currentPage`, `t.expandRow(1); t.getExpandedRowIds()`):
  both now update their state at once.
- **The theme checker knew only `<name>-Component-variant`;** a row variant
  sits mid-name (`backgroundColor-row-warning-Table`). Accepted now by
  pattern, when `backgroundColor-row-Table` exists.
- **The copy handler first copied the checkbox column** (an empty cell): only
  data cells are copied.
- **jsdom normalizes `clamp(50px, 100px, 100px)` to `calc(100px)`;** the widths
  are measured in E2E.
- **A one-off:** three older scenario tests (Select, AutoComplete, Dialogs)
  failed once in a run right after the playground's new scenario files were
  first compiled; they passed alone and in two full runs of the project (246
  of 246), and in `npm run check`.
- **`percent` formats 0.125 as "13%"** (Intl's default, as XMLUI).

### Divergences from XMLUI

- **Our own column model, a grid of divs with table roles** (decisions 1, 3):
  XMLUI uses TanStack Table v8 and a `<table>`. Copying cells gives the same
  tab-separated text through a `copy` handler.
- **Columns are data** (decision 2): the prerender has the header and the
  cells; XMLUI's columns register in effects.
- **Rows are read-only** (decision 5): XMLUI's `row.x = value` in `didChange`
  is reported with what to write instead.
- **`syncWithAppState` is E030** (no `AppState`); `refreshOn` is ignored with a
  warning.
- **`Pagination` keeps its page and size** (XMLUI's is controlled through
  `pageIndex`); the Table's pager shows one page button, as XMLUI's.
- **Column `tooltip` is a plain title;** `tooltipOptions` is accepted and
  unused.
- **The `color` cell is a native color input** (XMLUI: its ColorPicker).
- **Interactive column widths estimate 8.5 px per header character** (XMLUI: 7).
- **Numbers and dates use the browser's locale** until step 34 (XMLUI: the app
  locale or `Locale`), or `typeOptions.locale`.

### Open for later steps

- `dataRefreshMode`, `preserveStateOnNextDataRefresh`, server-side paging (with
  DataSource paging, as List's).
- A Column tooltip with XMLUI's options (Mantine Tooltip per cell).
- `alwaysShowHeader` in a page that scrolls while the Table also scrolls
  sideways (a sticky element sticks in its nearest scroll box: not tested).
- `scrollPaddingStart` for a Table or List scrolling with the page under a
  sticky AppHeader.
- Touch, iOS Safari, screen readers with the virtualized grid (`aria-rowcount`
  and `aria-rowindex` are set).

## Decisions (asked 2026-11-26)

1. **Our own column model** (option A2); no TanStack Table.
2. **Columns compiled to data** (option B2, `childrenAsColumns`, E040).
3. **A grid of divs with table roles** (option C2, after the comparison),
   with a `copy` handler that copies selected cells as tab-separated rows.
4. **All 45 types, the type syntax, `typeOptions` and the `Value` component**
   (option D1): full parity in step 30.
5. **Edited cells are saved by updating the variable explicitly** (option E1),
   documented, with a clear runtime error for XMLUI's `row.x = …` pattern.
6. **A `Pagination` component now** (option F1); step 31 loses it.

7. **As proposed:** `syncWithAppState` is an error (no `AppState`); typed
   numbers and dates use the browser's locale until step 34; `Pagination` moves
   from step 31 to step 30.
