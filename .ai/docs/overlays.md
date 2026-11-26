# Overlays and menus

> Subsystem reference: `ModalDialog`, `Drawer`, `DropdownMenu`, `MenuItem`,
> `SubMenuItem`, `MenuSeparator`, `ContextMenu`, `Tooltip` and the tooltip
> behavior, and the app globals `toast()` and `confirm()` (step 27), on
> Mantine's `Modal`, `Drawer`, `Menu`, `Tooltip` and `@mantine/notifications`.
> Describes the code as it is. Design and XMLUI comparison:
> [`../plan/poc-27-overlays.md`](../plan/poc-27-overlays.md). Forms in a
> dialog: [forms.md](forms.md); APICall's messages: [data.md](data.md).
>
> **Last updated:** step 27.

## In markup

```xml
<Button label="Edit" onClick="editor.open(user)"/>
<ModalDialog id="editor" title="Edit {$param.name}" onClose="…">
  <Form data="{$param}" submitUrl="/api/users/{$param.id}"> … </Form>
</ModalDialog>
<ModalDialog when="{$queryParams.help}" title="Help" onClose="navigate('/')"/>

<Drawer id="filters" position="right"><property name="headerTemplate"><H3>Filters</H3></property> … </Drawer>

<DropdownMenu label="Actions" alignment="end" onWillOpen="…">
  <MenuItem icon="pencil" onClick="…">Edit</MenuItem>
  <SubMenuItem label="Export"><MenuItem to="/export/csv">CSV</MenuItem></SubMenuItem>
  <MenuSeparator/>
</DropdownMenu>

<Card title="{$item.name}" onContextMenu="ev => menu.openAt(ev, $item)"/>
<ContextMenu id="menu" menuWidth="200px"><MenuItem>Rename {$context.name}</MenuItem></ContextMenu>

<Button label="Save" tooltip="Saves the file" tooltipOptions="bottom; delayDuration: 200"/>
<Tooltip side="bottom" markdown="**Both** cards"><Card/><Card/></Tooltip>
```

```js
toast.success("Saved");                 // toast(msg), .success, .error, .loading → the id
const id = toast.loading("Uploading", { id: "up" });
toast.success("Uploaded", { id: "up" });  // replaces the toast with that id
toast.remove(id);
if (await confirm("Delete", "Sure?", "Delete")) …   // or confirm({ title, message, actionLabel, cancelLabel, width, actionThemeColor })
```

| Component | Props | Events | API |
|-----------|-------|--------|-----|
| `ModalDialog` | `title`, `titleTemplate`, `closeButtonVisible`, `closeOnClickAway`, `fullScreen`, `skipDirtyConfirmation`, `confirmCloseTitle`, `canCloseMessage`, `confirmCloseLabel`, `cancelCloseLabel`; layout props (on the dialog box) | `open(...params)`, `close`, `willClose` (`false` keeps it open), `dirtyChanged(dirty)` | `open(...params)`, `close()`, `setDirty(d)`, `getDirty()` (reactive), `isOpen` |
| `Drawer` | `position` (left, right, top, bottom), `hasBackdrop`, `closeOnClickAway`, `closeButtonVisible`, `initiallyOpen`, `headerTemplate` | `open`, `close` | `open()`, `close()`, `isOpen` |
| `DropdownMenu` | `label`, `alignment` (start, end, center), `enabled`, `triggerButtonIcon`, `triggerButtonIconPosition`, `triggerTemplate`; `triggerButtonThemeColor`/`Variant` accepted, no effect yet | `willOpen` (`false` keeps it closed) | `open()`, `close()` |
| `MenuItem` | `label` or content, `icon`, `iconPosition`, `active`, `enabled`, `to` | `click` (the pointer) | |
| `SubMenuItem` | `label`, `icon`, `iconPosition`, `triggerTemplate` | | |
| `MenuSeparator` | | | |
| `ContextMenu` | `menuWidth` | | `openAt(ev, context)`, `close()` |
| `Tooltip` | `text`, `markdown`, `tooltipTemplate`; `side`, `align`, `sideOffset`, `alignOffset`, `showArrow`, `avoidCollisions`, `delayDuration` (700), `defaultOpen`; `skipDelayDuration` accepted | | |

- **Context variables:** `$param`/`$params` inside a `ModalDialog` (the
  arguments of `open()`; `[]` when opened by `when`), `$context` inside a
  `ContextMenu`. They are `childContextVars`: the content is compiled in
  place, so IDs inside stay file-scoped.
- **`when` on a ModalDialog** opens it as it mounts (`openedByWhen`: the
  compiler passes `$$whenOpen`), and fires `open`. Closing it fires `close`;
  the author resets the condition there (XMLUI's pattern).
- **The tooltip behavior** (`tooltip`, `tooltipMarkdown`, `tooltipOptions`) is
  the Tooltip component around the element. `tooltipOptions` is an object or
  XMLUI's string (`"left; delayDuration: 800; !showArrow"`: a side or align
  value alone, a boolean name, `!name`, `name: number`; `parseTooltipOptions`).

### Pointer events and `$param` (decisions 1 and 2)

- **`click`, `doubleClick` and `contextMenu` handlers receive a frozen pointer
  snapshot** `{ clientX, clientY, button, shiftKey, ctrlKey, altKey, metaKey }`
  (`pointerData`, runtime `render/pointer.ts`), never the DOM event. A keyboard
  activation has `button: -1` and the element's center. `openAt` takes it (or
  any `{ clientX, clientY }`; without one, the last right-click's position).
- **`EventMetadata.args`** (`"none"` or `"pointer"`): a statement handler of
  such an event declares no `$param`/`$params`, so an enclosing one (a
  dialog's, an APICall's) stays visible: `<Button onClick="save($param)"/>`
  inside a dialog saves the dialog's `$param`. A function handler (`ev => …`)
  still receives the pointer. Outside any provider, `$param` in such a handler
  is C014.

## How it works

### The overlay layer (`overlay-context.tsx`)

- `App` renders, after the shell, `<div class="gfui-Overlays">` (fixed,
  zero-size, `z-index: 200`) with a portal target (`gfui-Overlays-target`)
  and the App's toasts and confirmation dialog. Every `Theme` renders one
  too, so an overlay opened inside a Theme gets the Theme's variables and
  tone. Being fixed, the layer takes no place in the layout (no gap).
- `useOverlayTarget()` finds the nearest layer (`OverlayLayerProvider`). The
  target is known after mount: React attaches refs in tree order during the
  commit, and the layer comes after the content, so a passive effect settles
  it. An overlay opens only once it is known (nothing in a server render).
- **Escape closes only the topmost overlay.** Mantine's modals each listen
  for Escape on the window; `useTopmostOverlay(open)` keeps a stack of open
  overlays and only the last gets `closeOnEscape`. (A confirmation over a
  dialog: Escape answers the confirmation.)
- `DialogContext` (`DialogHost`): what a ModalDialog offers the Forms inside
  it: `requestClose()`, `setFormDirty(form, dirty)`, `removeForm(form)`.

### ModalDialog and Drawer (`overlays.tsx`)

- State in signals: `open`, `params`, `ownDirty`, the forms' dirty flags.
  The close sequence (close button, Escape, outside click, `close()`, a Form):
  `willClose` decides if handled; else a dirty dialog asks with `confirm()`
  (unless `skipDirtyConfirmation`); then it closes, clears the dirty state and
  fires `close`. Closed, Mantine unmounts the content: state inside starts
  fresh on the next open.
- The content is a `Stack` that is a **surface at level 1** of the spacing
  ladder (`pageScope` → level 1, `data-surface`), as a Card on a page.
  `padding-ModalDialog`/`gap-ModalDialog` (and the Drawer's) override it.
- Drawer: without a backdrop it neither traps the focus nor locks the scroll
  (the page stays usable).

### Menus

- `DropdownMenu`: a Mantine `Menu` (controlled; `willOpen` is awaited) with a
  Mantine `Button` (the Button theme variables) or the `triggerTemplate` in a
  span as its target. Items are Mantine `Menu.Item`s; `SubMenuItem` is
  `Menu.Sub`. Styling: `classNames` on the Menu reach every item.
- `ContextMenu`: a `Menu` whose target is a zero-size fixed span at the
  pointer. Each `openAt` re-creates the menu (a new key); a layout effect
  measures where the anchor landed, corrects it (an ancestor with a
  transform or containment would shift a fixed element), then opens it.
- **E037:** `MenuItem`, `SubMenuItem` and `MenuSeparator` must be inside a
  `DropdownMenu`, `ContextMenu` or `SubMenuItem` (`ComponentMetadata.parents`;
  `Items` and templates between are fine; the root of a `<Component>` and a
  user component's slot content pass). Other content in a menu is allowed.

### toast() and confirm()

- **The runtime holds the state** (`render/overlay-state.ts`): `toasts` (a
  signal of frozen entries with a version), `confirmQueue`; `removeToast`,
  `answerConfirm`, `resetOverlayState` (tests). XMLUI's durations: 4 s, a
  success 2 s, a loading toast until removed.
- **The App renders it** (`AppOverlays`): `Toasts` mirrors the list into a
  Mantine notifications store of its own (`showNotification`,
  `updateNotification` for a new version, `hideNotification`; a toast closed
  by its timer or close button is removed from the list); `ConfirmHost` shows
  the first pending confirmation in a Modal (later ones wait; Escape and the
  close button answer `false`; the action button has the focus).

## Theme variables

| Component | Variables |
|-----------|-----------|
| ModalDialog | `backgroundColor-`, `backgroundColor-overlay-`, `textColor-`, `borderRadius-`, `boxShadow-`, `minWidth-`, `maxWidth-ModalDialog`; `fontSize-`, `fontWeight-`, `textColor-title-ModalDialog`; optional `padding-`, `gap-ModalDialog` |
| Drawer | `backgroundColor-`, `backgroundColor-backdrop-`, `boxShadow-`, `width-`, `height-Drawer`; optional `padding-`, `gap-Drawer` |
| DropdownMenu | `backgroundColor-`, `borderColor-`, `borderRadius-`, `boxShadow-`, `minWidth-DropdownMenu` |
| MenuItem | `backgroundColor-MenuItem` (`--hover`, `--active`), `color-MenuItem` (`--hover`, `--active`, `--disabled`), `fontSize-`, `gap-`, `paddingVertical-`, `paddingHorizontal-MenuItem` |
| Tooltip (behavior) | `backgroundColor-`, `textColor-`, `borderRadius-`, `padding-`, `fontSize-Tooltip` |

Toasts use the theme's colors (`color-success`, `color-danger`, the primary
color) and the confirmation's action button `color-danger` (`attention`, the
default), the primary or the secondary color. The CSS is `OVERLAYS` in
`styles.ts`; Mantine's own rules are in `@layer mantine`.

## Size

The hello app's eager JavaScript went from 858 KB (236 KB gzipped) to 963 KB
(267 KB gzipped): about 25 KB gzipped of code (Modal, Drawer, Menu, Tooltip,
notifications) and 6 KB of CSS. The plan's threshold for a lazy chunk was
about 30 KB of code, so they are eager; `toast()` and `confirm()` render in
every App anyway. `gfui.js`: 1,387 KB (was 1,231 KB).

## Files

| File | Contents |
|------|----------|
| `components/src/overlays.tsx` | `ModalDialog`, `Drawer`, `DropdownMenu`, `MenuItem`, `SubMenuItem`, `MenuSeparator`, `ContextMenu`, `Tooltip`, `TooltipBehavior`, `parseTooltipOptions`, `AppOverlays` (Toasts, ConfirmHost) |
| `components/src/overlay-context.tsx` | `OverlayLayer`, `OverlayLayerProvider`, `useOverlayTarget`, `useTopmostOverlay`, `DialogContext`, `useDialogHost` |
| `components/src/metadata.ts` | `OVERLAY_COMPONENTS`, `TOOLTIP_OPTION_PROPS`; `openedByWhen`, `parents`; `EventMetadata.args` |
| `components/src/behaviors-metadata.ts` | The tooltip behavior's `tooltipMarkdown`, `tooltipOptions` |
| `runtime/src/render/overlay-state.ts` | `toast`, `confirm`, `toasts`, `confirmQueue`, `removeToast`, `answerConfirm`, `resetOverlayState` |
| `runtime/src/render/pointer.ts` | `pointerData`, `isPointerLike` |
| `runtime/src/render/context-scope.ts` | Late context reads (a name read before its getter exists is computed again) |
| `compiler/src/module/compile-module.ts` | `checkParents` (E037), `$$whenOpen`, handler `params` from `EventMetadata.args` |
| `compiler/src/codegen/emitter.ts` | `handlerFunction(program, params)` |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/overlays.test.ts` | E037 (table), `$$whenOpen`, `$param`/`$params`/`$context` scoping, `toast`/`confirm` as globals |
| `compiler/tests/module/ids-scoping.test.ts`, `variables-handlers.test.ts` | Which handlers declare `$param` |
| `runtime/tests/render/pointer.test.ts`, `overlay-state.test.ts` | The pointer snapshot; toasts and the confirmation queue |
| `components/tests/overlays.test.tsx` | ModalDialog both ways, `$param` in a button, `willClose`, the dirty question, fresh content, a Theme's layer; a Form in a dialog; Drawer; menus, `willOpen`, `to`; ContextMenu with `$context`; toasts and `confirm()`; APICall's confirmation and messages |
| `components/tests/behaviors.test.tsx` | The tooltip behavior and component (content, layer, `aria-describedby`, options, Markdown, a template) |
| `e2e/overlays.spec.ts` (project `playground`) | Focus trap and return, Escape (only the topmost), outside clicks, `willClose`, the tone; Drawer edges and no backdrop; menus by keyboard, end alignment, `to`; a context menu at the pointer; tooltip delay, placement and flipping; toasts timing out; `confirm()`; APICall |
| `e2e/playground-scenarios.spec.ts` | The three scenarios: Dialogs and drawers, Menus and tooltips, Toasts and confirm |
