# Tree and TileGrid

> Subsystem reference: `Tree` (hierarchical data on headless-tree and the
> shared virtualizer) and `TileGrid` (fixed-size tiles in virtual rows), step
> 31. Describes the code as it is. Design, the measurements and the XMLUI
> comparison: [`../plan/poc-31-tree-tilegrid.md`](../plan/poc-31-tree-tilegrid.md).
> `Items` (also part of step 31) is in [visibility-templates.md](visibility-templates.md).
>
> **Last updated:** step 31.

## In markup

```xml
<Tree id="files" data="{nodes}" height="400px" defaultExpanded="first-level"
      selectedValue="{current}" onSelectionDidChange="e => current = e.newNode?.id"
      onLoadChildren="node => loadFolder(node.id)">
  <property name="itemTemplate">
    <HStack><Icon name="{$item.icon}"/><Text>{$item.name}</Text></HStack>
  </property>
</Tree>
<Button label="Save" onClick="saved = files.getTreeState()"/>

<TileGrid data="/api/photos" height="*" itemWidth="160px" itemHeight="180px"
          itemsSelectable="true" syncWithVar="picked">
  <Card><Text>{$item.title}</Text><Badge when="{$selected}" value="selected"/></Card>
</TileGrid>
```

### Tree

| Part | Details |
|------|---------|
| Data | `data` (a flat array with parent ids, nested items with `dataFormat="hierarchy"`, or a URL), the field mappings `idField`, `nameField`, `iconField`, `iconExpandedField`, `iconCollapsedField`, `parentIdField`, `childrenField`, `selectableField`, `loadedField`, `dynamicField`, `autoLoadAfterField` |
| Expansion | `defaultExpanded` (none, first-level, all, or ids whose paths open), `autoExpandToSelection` (true), `itemClickExpands`, `iconExpanded`/`iconCollapsed`, `iconSize`, `animateExpand`/`expandRotation` |
| Selection | `selectedValue` (alias `selectedId`): the first selection, and it follows later changes (decision D); a node's `selectable` field |
| Lazy loading | `dynamic`, `loadChildren` (its result: the children), `spinnerDelay`, `autoLoadAfter` |
| State | `initialTreeState`, `dataRefreshMode` (reset, preserve-state) |
| Rows | `itemHeight` (the estimate, 32), `fixedItemSize`, `scrollStyle`, `showScrollerFade`, `overflow`, `itemTemplate` |
| Context | `$item`: `id`, `key`, `name`, `displayName`, `depth`, `isExpanded`, `hasChildren`, `children` (the child items), `selectable`, `parentId`, `parentIds`, `path` (names), `loadingState`, `icon`, `iconExpanded`, `iconCollapsed`, and every source field |
| Events | `selectionDidChange({ newNode, previousNode })`, `nodeDidExpand(node)`, `nodeDidCollapse(node)`, `loadChildren(node)`, `contextMenu(pointer, node)`, `cutAction`/`copyAction`/`pasteAction`/`deleteAction(node)` (the focused node) |
| API | `expandAll`, `collapseAll`, `expandToLevel`, `expandNode`, `collapseNode`, `selectNode`, `selectNodeByIndex`, `clearSelection`, `getNodeById`, `getExpandedNodes`, `getSelectedNode`, `scrollIntoView`, `scrollToItem`, `getVisibleItems`, `getTreeState`, `setTreeState`, `preserveStateOnNextDataRefresh`, `appendNode`, `removeNode`, `removeChildren`, `insertNodeBefore`, `insertNodeAfter`, `replaceNode`, `replaceChildren`, `getNodeLoadingState`, `markNodeLoaded`, `markNodeUnloaded`, `getExpandedTimestamp`, `setAutoLoadAfter`, `getNodeAutoLoadAfter` |

### TileGrid

| Part | Details |
|------|---------|
| Data | `data` (an array or a URL), `idKey` (id), `loading` |
| Tiles | `itemWidth` (120px; with `stretchItems` the minimum), `itemHeight` (140px), `gap` (`$space-2`), `stretchItems`, `itemUserSelect` (none) |
| Selection | `itemsSelectable`, `enableMultiSelection` (true), `toggleSelectionOnClick`, `syncWithVar` (a variable's name, `{ selectedIds }`), `hideSelectionCheckboxes`, `checkboxPosition` (topStart, topEnd, bottomStart, bottomEnd); `refreshOn` is ignored with a warning |
| Context | `$item`, `$itemIndex`, `$isFirst`, `$isLast`, `$selected` |
| Events | `selectionDidChange(items, ids)`, `itemDoubleClick(item, index)`, `contextMenu(pointer, item, index)`, `selectAllAction(items, ids)`, `cutAction`/`copyAction`/`pasteAction`/`deleteAction(focusedItem, items, ids)` |
| API | `clearSelection`, `selectAll`, `selectId(id \| ids)`, `getSelectedItems`, `getSelectedIds` (registered by XMLUI's code, missing from its metadata) |

## How the Tree works

```
div.gfui-Tree                     layout props; data-scroll="own|outside"; the fades (::before, ::after)
  div.gfui-Tree-scroll            role="tree"; the scroll box (own); headless-tree's key listener
    div.gfui-Tree-content         data-virtual; height: the total size when virtual
      div.gfui-Tree-row           role="treeitem", aria-level/-setsize/-posinset/-expanded/-selected, tabindex 0 or -1
        div.gfui-Tree-gutter      the indentation (--gfui-Tree-depth × width-indent-Tree) and the toggle
        div.gfui-Tree-label       the template (or an Icon and the name)
```

### The model (`tree-model.ts`, React-free)

- **`buildTreeIndex(data, format, fields)`**: the nodes (`{ key: String(id), id, item }`),
  child keys by parent key (`TREE_ROOT` for the roots) and parent keys. Flat:
  an empty parent id (null, undefined, `""`) is a root; an item whose parent
  never appears is not shown (as XMLUI). Nested: `children`, an array or one
  root object; a repeated id stops a cycle. Repeated ids: the first wins, they
  are listed in `duplicates`.
- **Edits make a new index** (decision C): `setChildren` (loaded children,
  `replaceChildren`), `appendNode`, `insertSibling`, `removeNode`,
  `removeChildren`, `replaceNode`, `copyChildren` (preserve-state). In flat
  format a new child's parent id is the parent's source id with its type
  (XMLUI makes it a string).
- **`defaultExpandedKeys`** (never a node still to load), **`keysToLevel`**,
  **`ancestors`**, **`visibleRows`** (tests; headless-tree builds the rows at
  runtime).
- **Tree state:** `getTreeState` (XMLUI's `TreeState`: per id `expanded`,
  `collapsed`, `loaded`, `loadingState`, `selected`, the timestamps,
  `autoLoadAfter`; and `scrollPosition`), `treeStateEntries` (the entries
  whose nodes exist now, and those that wait), `entryExpanded`,
  `entryLoadingState`.

### The store (`TreeStore` in `tree.tsx`)

A plain object in a ref holds the working copy (the index) and the view
state: the expanded set, loading states, the selection, the focused key,
timestamps, saved entries still waiting for their nodes. Its methods change
it and re-render the component (`notify`), so an API call reads its own
writes at once (step 30 found APIs that read stale React state).

- **`sync(props)`, during render:** a new `data` value (or a new format or
  field mapping) replaces the working copy. `reset` (default) starts over:
  default expansion, nothing loaded. `preserve-state`, or the one-shot
  `preserveStateOnNextDataRefresh()`, keeps the expanded set, the loading
  states and the selection of the nodes that remain, and the loaded children
  of dynamic nodes whose new data has none; its scroll intent (`operation:
  "insert"` scrolls the first inserted visible node into view if needed,
  `scrollTarget`) runs after the next render. Then `selectedValue`: when it
  changes, it selects (no event) and opens the path (`autoExpandToSelection`).
- **Expansion:** `expand` opens, records the time, fires `nodeDidExpand`, and
  loads when the node is dynamic and unloaded, or loaded but collapsed for
  `autoLoadAfter` ms (the node's own, the field's, the Tree's). `collapse`
  closes, records the time, fires `nodeDidCollapse`, and moves the focus up
  if it was inside.
- **Loading:** `loadChildren` marks the node loading and empty, awaits the
  handler (the component's `eventResults`), and puts the result in as its
  children. A newer load of the same node, or new data, drops a late answer;
  an error unloads and collapses the node and goes to the error reporter.
- **A node is a folder** when it has children, or is dynamic and not loaded
  (dynamic: the `dynamic` field, else `loaded: false`, else the Tree's
  `dynamic`; only with a `loadChildren` handler).

### headless-tree (decision A)

`createTree` is called in a `useState` initializer and mounted at once
(`setMounted(true)`): `useTree` mounts in an effect, so the server render
would have no rows. Its state is controlled:

- the store's expanded set and focused key are written in with
  `applySubStateUpdate` and a `rebuildTree()`, during render, whenever the
  store's `structure` counter changed (the index or the expanded set);
  headless-tree's setters ignore those writes (`syncing`);
- a feature (`storeFeature`) sends `expand`/`collapse` to the store and
  answers `isExpanded` from its set;
- the sync data loader reads the index (`getItem`, `getChildren`).

It gives the visible item instances (`tree.getItems()`), each row's ARIA
props (`getProps()`: role, level, set size, position, expanded, the roving
`tabIndex`), focus and the navigation keys (`hotkeysCoreFeature`: Up, Down,
Right expands then enters, Left collapses then goes to the parent, Home,
End). Its key handler tracks pressed keys from `keydown` to `keyup`. Ours,
on the rows: Enter selects and toggles, Space selects, Ctrl/Cmd+X/C/V and
Delete fire the actions with the focused node.

**Its cost:** each structure change rebuilds every visible item instance,
about 2 µs a row. Collapsing a node with 40,000 visible descendants (all
50,000 expanded) takes 81–86 ms to the next frame (`e2e/tree.spec.ts`
records it); a few thousand visible rows take a few milliseconds.

### Rows

The visible keys go to `useVirtualRows` (`virtual.ts`, shared with List and
Table): its own scroll box with a `height` or `maxHeight` (not with
`overflow="visible"`), else its container's. Rows are measured (the
estimate is `itemHeight`); `fixedItemSize` measures the first row once. The
focused row is `pinned`: it stays mounted wherever the view is, so the tree
always has its one tab stop and the keys work after scrolling away. Static
mode (the server render, jsdom) shows the first `STATIC_ROWS` visible rows,
and the takeover reuses them (`e2e/ssg.spec.ts`).

**Mouse:** a mouse-down on the label selects (XMLUI); the gutter toggles; a
click on the label toggles with `itemClickExpands`. A right-click selects the
node and fires `contextMenu(pointer, node)`.

**`scrollStyle`:** the scroll box is the virtualizer's, so there is no
Mantine ScrollArea (the ScrollViewer's): `overlay`, `whenMouseOver` and
`whenScrolling` are a thin CSS scrollbar, hidden until hover or while not
scrolling. `showScrollerFade` shows gradients where there is more to scroll.

## How the TileGrid works

```
div.gfui-TileGrid                 role="grid"; the scroll box (own); column-gap: the gap; tabindex with keys
  div.gfui-TileGrid-content-box   data-virtual; height: the total size
    div.gfui-TileGrid-row         role="row"; one virtual row of `cols` tiles
      div.gfui-TileGrid-tile      role="gridcell"; data-tile (index), aria-selected
        div.gfui-TileGrid-check   a Mantine Checkbox at checkboxPosition
        div.gfui-TileGrid-content the template
```

- **Columns** (decision B, measured in the plan): a `ResizeObserver` reads the
  box's width and its computed `column-gap`; `columnCount` is XMLUI's
  `floor((width + gap) / (itemWidth + gap))`. The items are chunked into rows
  keyed by their first tile; one fixed-size virtual row each
  (`itemHeight + gap`). `stretchItems` widens the tiles to fill a row.
- **Keeping the place:** after each render the first tile in view is noted;
  when the column count changes, its new row is scrolled to the top (both
  ways the prototype compared lost the place).
- **Static mode** (the server render, jsdom, no width yet): the first
  `STATIC_TILES` (48) tiles in a CSS grid, `repeat(auto-fill, itemWidth)`,
  laid out without knowing the width. The takeover replaces these nodes with
  rows; `e2e/ssg.spec.ts` checks that the tiles stay where they were. XMLUI
  renders nothing until it knows the width.
- **Selection:** `useRowSelection` over the tile keys (`syncWithVar`,
  `selectionDidChange(items, ids)`), the rules of `selection.ts`. A focus ring
  apart from the selection: Ctrl/Cmd with the arrows moves it alone. The
  focused tile is kept in view. Keys (`gridKeyTarget`): arrows in two
  dimensions, Home/End of the row (with Ctrl/Cmd: of the grid), PageUp/Down
  by the rows in view, Space toggles, Ctrl/Cmd+A selects all; the action keys
  pass the focused tile (XMLUI: `null`).

## Theme variables

| Tree | Default | TileGrid | Default |
|------|---------|----------|---------|
| `backgroundColor-Tree-row--selected` | `$color-primary-50` | `backgroundColor-item-TileGrid` | `transparent` |
| `backgroundColor-Tree-row--hover` | `$color-surface-100` | `backgroundColor-item-TileGrid--hover` | `$color-surface-100` |
| `textColor-Tree` | `$textColor` | `backgroundColor-item-TileGrid--selected` | `$color-surface-100` |
| `textColor-Tree--selected` | `$color-primary-900` | `backgroundColor-item-TileGrid--selected--hover` | `$color-primary-100` |
| `textColor-Tree--hover` | `$textColor` | `borderRadius-item-TileGrid` | `$borderRadius` |
| `borderRadius-Tree-row` | `4px` | `offsetVertical-checkbox-TileGrid` | `$space-1` |
| `borderColor-Tree-row--focus` | `$color-primary-500` | `offsetHorizontal-checkbox-TileGrid` | `$space-1` |
| `outlineColor-Tree--focus` | `$color-primary-500` | `outlineColor-item-TileGrid--focus` | `$color-primary-500` |
| `outlineWidth-Tree--focus` | `2px` | `outlineWidth-item-TileGrid--focus` | `2px` |
| `outlineStyle-Tree--focus` | `solid` | `outlineStyle-item-TileGrid--focus` | `solid` |
| `outlineOffset-Tree--focus` | `-2px` | `outlineOffset-item-TileGrid--focus` | `-2px` |
| `width-indent-Tree` (ours) | `$space-3` | | |

XMLUI's focus defaults (`$outlineColor--focus`, …) are tokens gfui doesn't
have; the values are those of List and Table.

## Files

| File | Contents |
|------|----------|
| `components/src/tree-model.ts` | The index, edits, default expansion, tree state (React-free) |
| `components/src/tree.tsx` | `Tree`, `TreeStore`, `storeFeature`, `TreeToggle` |
| `components/src/tilegrid.tsx` | `TileGrid`, `columnCount`, `STATIC_TILES` |
| `components/src/selection.ts` | `gridKeyTarget` |
| `components/src/virtual.ts` | `useVirtualRows`'s `pinned` row |
| `components/src/metadata.ts` | `Tree`, `TileGrid` |
| `components/src/styles.ts` | `TREE`, `TILEGRID` |

## Tests

| File | Covers |
|------|--------|
| `components/tests/tree-model.test.ts` | Tables: building the index (formats, mappings, orphans, duplicates, cycles), node fields, default expansion and levels, every edit, tree state, `gridKeyTarget` |
| `components/tests/tree.test.tsx` | jsdom through markup: rows and ARIA, templates and `$item`, toggling and events, the static window and the prerender, selection and `selectedValue`, keys (headless-tree's and ours), lazy loading (results, errors, `autoLoadAfter`, reloading), the API (expansion, selection, edits, tree state), new data in both modes; TileGrid (static grid, selection, keys, `syncWithVar`, the API, the prerender); Items |
| `e2e/tree.spec.ts` | Chromium: 50,000 nodes (expand all, a fast scroll with no blank frame, a toggle's time), `scrollIntoView`, keys with the focused row kept mounted, the file tree, lazy loading with the spinner delay, a saved state, preserve-state; 10,000 tiles (rows from the width, a fast scroll, the place kept when narrowing, stretch, 2-D keys, the shared selection, the actions) |
| `e2e/ssg.spec.ts` | The prerendered Tree taken over on its own nodes; the TileGrid's tiles where they were before takeover |
