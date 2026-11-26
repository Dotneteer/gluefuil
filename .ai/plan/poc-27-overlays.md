# Step 27: Overlays and menus

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the fifth batch of Phase F:
`ModalDialog` (declarative and imperative), `Drawer`, `DropdownMenu`,
`MenuItem`, `SubMenuItem`, `MenuSeparator`, `ContextMenu`, `Tooltip`,
`toast()`, `confirm()`.

## Goal

```xml
<Button label="Edit" onClick="editor.open(user.id)"/>
<ModalDialog id="editor" title="Edit user {$param}">
  <Form data="/api/users/{$param}" submitUrl="/api/users/{$param}" submitMethod="put">
    <TextBox bindTo="name" label="Name" required="true"/>
  </Form>
</ModalDialog>

<ModalDialog when="{$queryParams.help}" title="Help" onClose="navigate('/')"/>

<DropdownMenu label="Actions" alignment="end">
  <MenuItem icon="pencil" onClick="editor.open(user.id)">Edit</MenuItem>
  <SubMenuItem label="Export">
    <MenuItem onClick="toast.success('CSV ready')">CSV</MenuItem>
  </SubMenuItem>
  <MenuSeparator/>
  <MenuItem onClick="if (await confirm('Delete', 'Sure?', 'Delete')) remove.execute()">Delete</MenuItem>
</DropdownMenu>

<Card title="{$item.name}" onContextMenu="ev => menu.openAt(ev, $item)"/>
<ContextMenu id="menu"><MenuItem>Rename {$context.name}</MenuItem></ContextMenu>

<Drawer id="filters" position="right"><property name="headerTemplate"><H3>Filters</H3></property>…</Drawer>
<Tooltip side="bottom" text="Two cards, one tooltip"><Card/><Card/></Tooltip>
```

XMLUI's markup, with focus trapping, Escape, outside click and focus return
proven in a real browser. This step also takes the items earlier steps
deferred to it (Form in a dialog, warning confirmation, notification
messages; see *Scope* below).

## Background

### XMLUI (`website/content/docs/reference/components/*.md`, `xmlui/src/components/*`)

- **ModalDialog** (`ModalDialog.md`, `ModalDialog/ModalDialogReact.tsx`,
  `pages/modal-dialogs.md`):
  - **Two ways to open:** `when` (it opens on mount; `onClose` must reset the
    condition), or the API `open(...params)` / `close()`. Inside it,
    `$param` is the first argument of `open()`, `$params` all of them
    (`ModalDialog.tsx` 240–241).
  - Props: `title`, `titleTemplate`, `closeButtonVisible` (true),
    `closeOnClickAway` (true), `fullScreen`; the dirty guard:
    `confirmCloseTitle`, `canCloseMessage`, `confirmCloseLabel`,
    `cancelCloseLabel`, `skipDirtyConfirmation`.
  - Events `open(...params)`, `close`, `willClose` (an explicit `false`
    keeps it open and skips the dirty confirmation), `dirtyChanged(dirty)`;
    API `open`, `close`, `setDirty`, `getDirty`.
  - **A Form inside closes it** on Cancel and after a successful submit
    (`Form/FormReact.tsx` 560, 837–840, unless `keepModalOpenOnSubmit`);
    the form's dirty state counts as the dialog's (`ModalVisibilityContext`,
    `ModalDialogReact.tsx` 380–398).
  - Rendered with Radix `Dialog` in a portal **into the app's root element**
    (`Dialog.Portal container={root}`, 466), so theme variables apply.
  - Theme variables: `backgroundColor-`, `backgroundColor-overlay-`,
    `borderRadius-`, `padding-`, `textColor-`, `fontFamily-`,
    `minWidth-`/`maxWidth-`/`maxHeight-ModalDialog`, the `title` part's
    text variables (`fontSize-title-ModalDialog`, …), `padding-overlay-`.
- **Drawer** (`Drawer.md`, `Drawer/DrawerReact.tsx`): `position`
  (`left` default, `right`, `top`, `bottom`), `hasBackdrop`,
  `closeOnClickAway`, `closeButtonVisible`, `initiallyOpen`,
  `headerTemplate` (a sticky header beside the close button); events
  `open`, `close`; API `open`, `close`, `isOpen`. Theme: `width-`,
  `height-`, `backgroundColor-`, `backgroundColor-backdrop-`, `boxShadow-`,
  `padding-`, `gap-`, `animationDuration-`/`animationEasing-Drawer`.
- **DropdownMenu** (`DropdownMenu.md`, `DropdownMenu/DropdownMenuReact.tsx`):
  a trigger button (`label`, `triggerButtonIcon`, `…IconPosition`,
  `…ThemeColor`, `…Variant` "ghost") or `triggerTemplate`; `alignment`
  (`start`, `end`, `center`); `enabled`; `willOpen` (false cancels); API
  `open`, `close`. Theme: `backgroundColor-`, `borderRadius-`,
  `boxShadow-`, `minWidth-DropdownMenu`.
- **MenuItem** (`MenuItem.md`): `label` or children, `icon`,
  `iconPosition`, `active`, `enabled`, `to` (navigates); `click`. Theme:
  `backgroundColor-`/`color-MenuItem` with `--hover`, `--active`,
  `--disabled`; `fontSize-`, `gap-`, `paddingHorizontal-`/`Vertical-`.
- **SubMenuItem** (`SubMenuItem.md`): `label`, `icon`, `iconPosition`,
  `triggerTemplate`; children are the submenu. **MenuSeparator**: a line.
- **ContextMenu** (`ContextMenu.md`, `ContextMenu/ContextMenuReact.tsx`):
  no trigger; `openAt(event, context?)` reads `event.clientX/clientY` and
  calls `preventDefault()` (117–131); the menu sees `context` as
  `$context`; `menuWidth`; API `openAt`, `close`. Any component's
  `onContextMenu` receives the DOM event
  (`components-core/event-handlers.ts`).
- **Tooltip** (`Tooltip.md`, Radix): wraps children; `text`, `markdown`,
  `tooltipTemplate`; `side` (top), `align` (center), `sideOffset` (4),
  `alignOffset`, `showArrow`, `avoidCollisions`, `delayDuration` (700),
  `skipDelayDuration`, `defaultOpen`. Every visual component also takes
  `tooltip`, `tooltipMarkdown` and `tooltipOptions` (an object, or a string
  such as `"left; delayDuration: 800; !showArrow"`).
- **`toast()`** (`pages/globals.md` § Notifications, `react-hot-toast`):
  `toast(msg, { id, duration, position })`, `toast.success`, `.error`,
  `.loading`, `.remove(id)`.
- **`confirm()`** (`pages/globals.md` § `confirm`,
  `ModalDialog/ConfirmationModalContextProvider.tsx`): positional
  `(title, message, actionLabel, cancelLabel, width)` or an options object
  with `actionThemeColor`; a promise of `true`/`false`. Defaults "Confirm
  Operation", "Are you sure you want to perform this operation?", "Yes",
  "Cancel".
- **Form warnings:** submitting with warnings opens a confirmation dialog
  first (`FormReact.tsx` 700–702, 1152–1170).
- **APICall:** `confirmTitle`, `confirmMessage`, `confirmButtonLabel`,
  `inProgressNotificationMessage`, `completedNotificationMessage`
  (`$result`), `errorNotificationMessage` (`$error`) (`APICall.md`).

### Here

- **Deferred to this step:** `keepModalOpenOnSubmit` and warning
  confirmation ([poc-22-forms.md](poc-22-forms.md) § Deferred,
  [poc-22b-forms-submit.md](poc-22b-forms-submit.md) § Deferred); Form's
  three notification messages (22B); APICall's notifications and
  `confirmMessage` ([poc-20-data.md](poc-20-data.md) § Open).
- **The sandbox invariant:** no platform object reaches script. Today
  `contextMenu` and `click` handlers receive **no arguments**
  (`metadata.ts`: `CLICK`, `CONTEXT_MENU`), so XMLUI's
  `ev => menu.openAt(ev, …)` has nothing to pass.
- **Statement handlers always declare `$param`/`$params`**
  (`compiler/src/codegen/emitter.ts` 771–801). Inside a dialog that would
  hide the dialog's `$param`: `<Button onClick="save($param)"/>` would see
  the click's (absent) argument.
- **`childContextVars`** (step 22, `Form`'s `$data`) already gives children
  compiled in place a context scope that the component fills: it fits
  `$param`/`$params` and `$context`.
- **The tooltip behavior is our own** (`behaviors.tsx`, step 18): a span on
  hover and focus, no placement, no collision handling, no delay.
- **The App's nav drawer** is our own CSS (step 19A); unrelated to `Drawer`.
- **Popups stay inside the app** (`withinPortal: false`) so they inherit the
  theme scope ([mantine.md](../docs/mantine.md)).

### Mantine 9.8.2 (installed)

`Modal`, `Drawer` (both on `ModalBase`: `trapFocus`, `returnFocus`,
`closeOnEscape`, `closeOnClickOutside`, `lockScroll`, `portalProps`),
`Menu` with `Menu.Sub` and `Menu.ContextMenu` (a virtual reference at the
pointer), `Tooltip` (floating-ui: `position`, `offset`, `withArrow`,
`openDelay`), `Tooltip.Group`, `FocusTrap`, `Portal` (`target`).
`@mantine/notifications` 9.8.2 is **not installed** (deps:
`@mantine/store`, `react-transition-group`).

## Design

### Shared

- **Overlays portal into an overlay layer of the App** (as XMLUI's
  `container={root}`), so theme variables, the tone and `Theme` overrides
  reach them. *As built:* a portal straight into `.gfui-App` or a Theme would
  make the dialog's root a flex or grid item there (a stray gap), so `App`
  and every `Theme` render a fixed, zero-size layer (`gfui-Overlays`) and
  overlays portal into the nearest one.
- **The z-index:** the layer is at 200, above the shell (≤ 102); inside it,
  Mantine's defaults (modal 200, popover 300, notifications 400), and the
  confirmation at 300. *As built:* no theme variables for it.
- **Prerender:** closed overlays render nothing. An open-on-load
  overlay (`when` true, `initiallyOpen`) appears after hydration, not in
  the HTML (Mantine portals mount in an effect). Recorded as a divergence;
  XMLUI has no prerender.
- **Surfaces:** the dialog and drawer bodies are layout surfaces, so the
  spacing ladder (19D) gives their padding and gaps (open item of 19D).

### ModalDialog (`overlays.tsx`, on Mantine `Modal`)

- `childContextVars: ["$param", "$params"]`; `open(...params)` stores the
  params in signals and opens; `when` mounts it open (`$params` = `[]`).
- Closing (close button, Escape, outside click, `close()`, a Form):
  `willClose` (a `false` keeps it open) → otherwise, when dirty and not
  `skipDirtyConfirmation`, the dirty confirmation (our `confirm()`) →
  `close` event. A closed imperative dialog unmounts its content, so local
  state starts fresh on the next `open()` (XMLUI the same).
- **A dialog context** consumed by `Form`: Cancel and a successful submit
  request the close (unless `keepModalOpenOnSubmit`); the form's dirty
  state feeds the dialog's; `dirtyChanged` fires on each transition.
- `title` / `titleTemplate` in Mantine's header; `closeButtonVisible`,
  `closeOnClickAway`, `fullScreen`; the theme variables above (Mantine's
  `--modal-*` redirected as in step 16).

### Drawer (on Mantine `Drawer`)

`position`, `hasBackdrop` (`withOverlay`), `closeOnClickAway`,
`closeButtonVisible`, `initiallyOpen`, `headerTemplate`; `open`/`close`
events; API `open`, `close`, `isOpen` (reactive).

### Menus (on Mantine `Menu`)

- **DropdownMenu:** the trigger is our `Button` (`label`,
  `triggerButtonIcon` default `chevrondown`, `triggerButtonIconPosition`)
  or `triggerTemplate`; `alignment` → `position` `bottom-start`/`-end`/
  `bottom`; `willOpen`; API `open`, `close`. `triggerButtonVariant` and
  `…ThemeColor` are accepted and wait for `Button` variants (open since
  step 16).
- **MenuItem:** `Menu.Item`; `icon`/`iconPosition` → left/right section;
  `active` (`data-active`); `to` navigates with the router; `click` closes
  the menu.
- **SubMenuItem:** `Menu.Sub` (hover and arrow keys), nesting to any depth.
- **MenuSeparator:** `Menu.Divider`.
- **Children are compiled in place** (IDs stay file-scoped). `MenuItem`,
  `SubMenuItem` and `MenuSeparator` outside a menu are a new compile error,
  E037 (`ComponentMetadata.parents`). *As built:* only this parent rule;
  other content in a menu is allowed (XMLUI renders it).

### ContextMenu

- Mantine `Menu` opened at the pointer; `menuWidth`. *As built:* its target
  is a zero-size fixed span at the pointer (Mantine's virtual reference
  isn't public API);
  `childContextVars: ["$context"]`; API `openAt`, `close`.
- **`openAt` and the sandbox (decision 1):** a `contextMenu`
  (and `click`, `doubleClick`) handler receives a **frozen pointer
  snapshot** `{ clientX, clientY, button, shiftKey, ctrlKey, altKey,
  metaKey }`: plain data, no DOM object, so XMLUI's markup works
  unchanged. The browser menu is suppressed whenever an `onContextMenu`
  handler exists (XMLUI's `preventDefault`). `openAt()` with no argument
  uses the last right-click position.

### Tooltip

- **`Tooltip` component** on Mantine `Tooltip`: `text`, `markdown`,
  `tooltipTemplate`; `side`, `align` → `position`; `sideOffset`,
  `alignOffset`, `showArrow`, `delayDuration`, `defaultOpen`;
  `avoidCollisions` (floating-ui flip/shift). Several children share one
  anchor (a `display: contents`-free wrapper span).
- **The tooltip behavior moves onto it** (as architecture.md planned) and
  gains `tooltipOptions` (object, or XMLUI's string form; *as built:* parsed
  at runtime, `parseTooltipOptions`) and `tooltipMarkdown` (the Markdown
  chunk, lazily).
  The behavior's DOM changes: the tooltip renders in the portal, not next
  to the component.

### `toast()` and `confirm()` (app globals)

- **The runtime holds the state, the components render it** (the shell
  state pattern): `runtime/src/render/overlay-state.ts` keeps a toast list
  and a confirmation queue in signals; `App` renders them. The runtime stays
  free of Mantine.
- `toast`, `toast.success`, `.error`, `.loading` return the id;
  `toast.remove(id)`; `duration` (ms; `loading` stays until removed),
  `position` (six values), a fixed `id` replaces the toast with that id.
  Rendered with **`@mantine/notifications`** (decision 3).
- `confirm(...)` in both forms returns `Promise<boolean>`; Escape and the
  close button resolve `false`. Dialogs queue: a second `confirm()` waits
  for the first.
- **The deferred consumers:** Form's warning confirmation, its
  `inProgress`/`completed`/`errorNotificationMessage`; APICall's
  `confirmTitle`/`confirmMessage`/`confirmButtonLabel` and its three
  notification messages (with `$result`, `$error`) (decision 4).

### Size

Menu shares Popover and floating-ui with the choice inputs (already
eager). Modal, Drawer and Notifications are measured; if they add more
than ~30 KB gzipped, they move to a lazy "overlays" chunk (step 23's
mechanism; nothing is open on first paint, so nothing waits).

## Steps

- [x] The compiler: the pointer snapshot for mouse events, the handler
      `$param` rule (decision 2), the menu parent rule; tests.
- [x] Runtime overlay state (`toast`, `confirm`) and the app globals.
- [x] ModalDialog (both ways, `$param`, the close sequence, dirty guard)
      and Drawer; metadata and theme variables.
- [x] Form in a dialog: auto-close, `keepModalOpenOnSubmit`, dirty state,
      warning confirmation, notification messages.
- [x] DropdownMenu, MenuItem, SubMenuItem, MenuSeparator, ContextMenu.
- [x] Tooltip and the behavior on it; `tooltipOptions`, `tooltipMarkdown`.
- [x] APICall confirmation and notifications.
- [x] Unit tests (jsdom) per component; playground scenarios "Dialogs and
      drawers", "Menus", "Toasts and confirm"; E2E tests.
- [x] Docs: `code-structure.md`, a new `overlays.md`, `forms.md`,
      `data.md`, `behaviors.md`.
- [x] `npm run check`; measure the bundle.

## Verification

- **jsdom:** open/close both ways; `$param`/`$params` and `onOpen`
  arguments; `willClose` false; the dirty confirmation; a Form's Cancel and
  submit close the dialog, `keepModalOpenOnSubmit` keeps it; `$context`;
  `toast` ids and `remove`; `confirm` resolves both ways and queues;
  menu item `to` navigates; compile errors for misplaced menu items and
  for handler/`$param` cases.
- **E2E (real browser), as poc-steps.md asks:**
  - **focus trap:** Tab and Shift+Tab cycle inside an open dialog and
    drawer; focus returns to the trigger after closing;
  - **Escape** closes the dialog, the drawer, a submenu then the menu, a
    tooltip;
  - **outside click** closes, and `closeOnClickAway="false"` doesn't;
  - menus by keyboard (arrows, Enter, ArrowRight into a submenu);
  - the context menu appears at the pointer (measured) and the browser menu
    doesn't;
  - a tooltip's placement flips at the viewport edge;
  - a toast appears and disappears after `duration`; `confirm` from a
    handler;
  - a dialog inherits a `Theme` override and the dark tone;
  - both dev and the prerendered build.

## Decisions (asked 2026-11-26)

1. **ContextMenu and the sandbox:** `click`, `doubleClick` and
   `contextMenu` handlers receive a **frozen pointer snapshot** (plain
   data), so `ev => menu.openAt(ev, $item)` works as in XMLUI. (Rejected:
   argument-free handlers with `openAt(context)` at the last right-click.)
2. **`$param` inside a dialog:** a statement handler declares
   `$param`/`$params` **only when its event declares arguments** (from
   metadata); otherwise the enclosing `$param` (dialog, APICall) is
   visible. (Rejected: always declaring them.)
3. **Toasts on `@mantine/notifications`** 9.8.2 (a new, pinned
   dependency), as architecture.md planned.
4. **Scope includes the deferred items:** Form in a dialog (auto-close,
   `keepModalOpenOnSubmit`, dirty state), warning confirmation, Form and
   APICall notifications and confirmation. No step 27B.
5. **The tooltip behavior moves onto Mantine `Tooltip`**, with
   `tooltipOptions` and `tooltipMarkdown`.
6. **`FocusScope` waits for step 32.**

## Outcome

- **The components:** `ModalDialog`, `Drawer`, `DropdownMenu`, `MenuItem`,
  `SubMenuItem`, `MenuSeparator`, `ContextMenu`, `Tooltip` (and the tooltip
  behavior on it), the app globals `toast()` and `confirm()`
  ([overlays.md](../docs/overlays.md)); new dependency
  `@mantine/notifications` 9.8.2 (pinned).
- **The deferred items:** a Form in a dialog (Cancel and a successful submit
  close it, `keepModalOpenOnSubmit`, its dirty state is the dialog's), the
  warning confirmation, Form's and APICall's notification messages, APICall's
  `confirmTitle`/`confirmMessage`/`confirmButtonLabel`.
- **The compiler:** `EventMetadata.args` (which handlers declare `$param`),
  E037 (`ComponentMetadata.parents`), `openedByWhen` (`$$whenOpen`).
- **The runtime:** `pointerData`, the overlay state (`toast`, `confirm`,
  `toasts`, `confirmQueue`), `ApiCaller.execute`'s `invocation`, late context
  reads in `createContextScope`.
- **The playground:** "Dialogs and drawers", "Menus and tooltips", "Toasts and
  confirm" (39 scenarios), and `POST /api/people` in its mock backend.
- **Evidence:** `npm run check` passes and prints no warnings: 2,882 unit
  tests in 103 files, 220 E2E tests. New: `compiler/tests/module/overlays.test.ts`
  (19), `runtime/tests/render/pointer.test.ts` (7), `overlay-state.test.ts`
  (14), `components/tests/overlays.test.tsx` (16), tooltip tests in
  `behaviors.test.tsx`; `e2e/overlays.spec.ts` (15) and three scenario tests.
- **Size:** the hello app's eager JavaScript 858 KB → 963 KB (236 → 267 KB
  gzipped: about 25 KB of code, 6 KB of CSS), under the lazy-chunk threshold
  for the code; `gfui.js` 1,231 → 1,387 KB.

### Findings

- **Decisions 1 and 2 collide for `click`:** a Button's click would carry the
  pointer as `$param` and hide the dialog's. Resolved: `EventMetadata.args`
  `"pointer"` gives the snapshot to function handlers (`ev => …`) only;
  statement handlers of pointer and argument-free events declare no
  `$param`. Existing markup with `$param` in a click handler outside a dialog
  is now C014 (six tests asserted the old behavior and were changed).
- **A context's own attributes read it too early:** `<ModalDialog
  title="Edit {$param}">` was computed before the dialog installed `$param`
  and never again. Fixed in `createContextScope` (a version signal bumped in
  a microtask); Form's `$data` in its own attributes had the same latent bug.
- **React attaches refs in tree order:** an overlay's layout effect ran before
  the layer's ref existed, so the first tooltip went to `<body>`. The target is
  settled in a passive effect.
- **Mantine's modals all close on Escape** (window listeners): a confirmation
  over a dialog would close both. Only the topmost open overlay gets
  `closeOnEscape` (`useTopmostOverlay`).
- **`ApiCaller.execute` read the calling handler synchronously;** awaiting
  `confirm()` first would lose it, so APICall reads it first and passes it.
- **jsdom can't show Mantine overlays as visible** (no CSS transitions: they
  stay `display: none`, or mount a moment later): jsdom tests check content,
  place and links; showing, hiding, focus and placement are E2E tests.
- **A tooltip closes when its button is clicked** (Mantine, as Radix in
  XMLUI).
- **Every App now prerenders six empty notification containers** (one per
  position) and an overlay layer; a `Theme` renders a layer too. They are
  fixed and empty; the spacing test now skips out-of-flow children.

### Divergences from XMLUI

- **Pointer handlers get a frozen snapshot**, not the DOM event (the sandbox):
  `ev.preventDefault()` and `ev.target` don't exist; the browser menu is
  suppressed whenever there is an `onContextMenu` handler.
- **A statement handler of an argument-free or pointer event has no
  `$param`** of its own.
- **The warning confirmation lists the warnings as text** (XMLUI shows a
  validation summary).
- **`DropdownMenu`'s trigger is a primary Button**, not XMLUI's ghost one;
  `triggerButtonVariant`/`ThemeColor` wait for Button variants.
- **`Tooltip`'s `skipDelayDuration`** is accepted without effect (Radix's
  delay skipping across tooltips).
- **An open-on-load dialog or drawer** appears after hydration, not in the
  prerendered HTML.
- **`errorNotificationMessage` handles the error** (`execute()` resolves
  `undefined`, as with an `onError` handler).

### Open for later steps

- `FocusScope` (step 32, decision 6).
- APICall's deferred operations (`$progress`, `$statusData`, polling).
- Overlays as a lazy chunk if the bundle needs it (about 25 KB gzipped).
- Toast templates (XMLUI's internal `Toast` component) and stacking
  options (Mantine's `stacked` layout); the limit is fixed at 8.
- Button variants, which `DropdownMenu`'s trigger props and the confirmation
  buttons would use.

