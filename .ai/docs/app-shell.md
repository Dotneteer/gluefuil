# The App shell

> Subsystem reference: `App`'s regions (`AppHeader`, `NavPanel`, `Footer`),
> the navigation items (`NavLink`, `NavGroup`, `NavPanelCollapseButton`),
> and how the compiler, the components and the CSS divide the work.
> Describes the code as it is. Design, XMLUI comparison and findings:
> [`../plan/poc-19a-app-shell.md`](../plan/poc-19a-app-shell.md).
>
> **Last updated:** steps 19A–19C.

## Using it

```xml
<App scroll="page" logo="/logo.svg">            <!-- scroll: page (default) · content · none -->
  <AppHeader title="Acme" sticky="true">        <!-- sticky: default true -->
    <NavPanelCollapseButton/>                   <!-- needs a collapsible side nav (E028) -->
    <property name="profileMenuTemplate"><Button label="Me"/></property>
  </AppHeader>
  <NavPanel placement="side" collapsible="true" drawerBelow="lg">
    <NavLink label="Home" to="/" icon="home"/>
    <NavGroup label="Reports" icon="chart">
      <NavLink label="Sales" to="/reports/sales"/>
    </NavGroup>
  </NavPanel>
  <Pages fallbackPath="/"> … </Pages>           <!-- everything that is not a region: the content -->
  <Footer sticky="false">© Acme</Footer>
</App>
```

| Element | Setting | Values (default first) |
|---------|---------|------------------------|
| `App` | `scroll` | `page`: the window scrolls · `content`: only the content area · `none`: as tall as the content (embedding) |
| `AppHeader`, `NavPanel`, `Footer` | `sticky` | `true` · `false`; only with `scroll="page"` (E029 warns otherwise) |
| `NavPanel` | `placement` | `header` (in the header bar) · `below-header` (a bar of its own) · `side` (a column) |
| `NavPanel` | `fullHeight` | `false` · `true`: a side nav beside the header and footer (side only, E028) |
| `NavPanel` | `drawerBelow` | `lg` · `sm` · `md` · `xl` · `xxl` · `never`: below it, the nav is a drawer |
| `NavPanel` | `collapsible` | `false` · `true`: the side nav can collapse to icons (side only, E028) |

All of them are literals (E026). The defaults are XMLUI's actual default
layout, `condensed-sticky`. Each XMLUI layout name, written with these
settings, is in `LAYOUT_EQUIVALENTS` (`components/src/metadata.ts`), which
is also the text of the E030 migration error.

| Name | What it is |
|------|------------|
| `navPanelCollapsed`, `setNavPanelCollapsed(v)` | App globals: whether the side nav is collapsed (reactive); collapses it. Affects only a `collapsible` side nav. |
| `navDrawerOpen`, `setNavDrawerOpen(v)` | App globals: whether the drawer is open (reactive); opens or closes it |
| `App logo`, `logo-light`, `logo-dark`, `logoTemplate` | The logo: the template, else the image for the active tone, else `logo` |
| `AppHeader title`, `titleTemplate`, `logoTemplate`, `showLogo`, `profileMenuTemplate` | The header's parts; children go between the title (or the nav) and the profile menu |
| `NavPanel logoTemplate`, `footerTemplate` | The nav's logo (when it shows there) and its bottom |
| `NavLink label`, `to`, `icon`, `exact`, `active` | A link; active on `to` and paths below it (`exact`: only on `to`; `/` is always exact). `active` forces the look. `aria-current="page"` when active. |
| `NavGroup label`, `icon`, `initiallyExpanded` | A `<details>`: expands in a side nav or a drawer, drops down in a bar (closes on navigation and on a click elsewhere) |
| `NavPanelCollapseButton aria-label`, `aria-labelCollapsed` | Toggles the collapsed state |

**Icons:** `components/src/icons.tsx` has a small built-in set (`home`,
`list`, `settings`, `user`, `info`, `star`, `folder`, `chart`, `mail`,
`search`, `layout`). An unknown name draws nothing. In a collapsed nav, an
item without an icon shows its label's initial.

## Who does what

| Part | Does |
|------|------|
| **Compiler** (`compiler/src/module/shell.ts`, `compile-module.ts` `regions()`) | Takes App's direct `AppHeader`/`NavPanel`/`Footer` children out of the children and passes them as props (`$$header`, `$$nav`, `$$footer`, named by `regions` in App's metadata). Their literal settings, with defaults, become one hoisted constant, `$$shell` (`ShellConfig`). Reports E028 (region not under App, a duplicate, `fullHeight`/`collapsible` without a side nav, a collapse button without a collapsible side nav), E029 (sticky without effect), E030 (`layout`, `scrollWholePage`, `fitContent`: `removedProps`). An App without regions gets no `$$shell`; App reads its own `scroll`. |
| **App** (`components/src/theme.tsx`) | Puts `shellAttributes()` on its root (the `data-*` attributes below) and renders `Shell` inside `MantineProvider`. |
| **Shell** (`components/src/shell.tsx`) | The fixed structure; places the nav in its slot; renders a header when the nav needs one and there is none (`needsGeneratedHeader`); the overlay; the drawer's behavior (`useDrawer`). A context gives the regions the config, the nav element (for the header placement), the logo and the nav's id. |
| **The regions** (`shell.tsx`) | Render their own element with `data-sticky` and `data-placement`. `AppHeader` renders the burger (Mantine `Burger`), the logo, the title, the nav (placement `header`), the children and the profile menu. |
| **CSS** (`components/src/styles.ts`: `SHELL`, `shellDrawer()`) | Everything about position: what sticks, what scrolls, the drawer, the collapsed width. Nothing is measured. |
| **State** (`runtime/src/render/shell-state.ts`) | Two signals: collapsed, drawer open. One state per page, like the theme state. |

## The structure

```
div.pfui-App                    data-scroll, data-nav, data-nav-full-height,
                                data-drawer-below, data-header-sticky,
                                data-footer-sticky, data-nav-collapsed,
                                data-drawer-open
  [nav: side + fullHeight]
  div.pfui-AppColumn
    header.pfui-AppHeader       burger, logo, title, [nav: header], content, profile menu
    [nav: below-header]
    div.pfui-AppBody
      [nav: side]
      main.pfui-AppMain > div.pfui-AppContent    (the content)
    footer.pfui-Footer
  div.pfui-App-overlay          (while the drawer is open)
```

- **The landmarks:** `header` (banner), `nav` (labeled "Main"), `main`,
  `footer` (contentinfo).
- **Only the nav moves.** The rest is the same for every app, with or
  without regions.

## The CSS

- **Scrolling:** `[data-scroll="page"]` sets `min-height: 100dvh` and the
  window scrolls. `[data-scroll="content"]` sets `height: 100dvh`, and
  `.pfui-AppMain` (and a side nav) scroll.
- **Sticking:** `[data-sticky]` regions are `position: sticky` under
  `[data-scroll="page"]`.
  - The offsets come from the declared heights: `--pfui-shell-top` is
    `height-AppHeader` when `data-header-sticky`, and `--pfui-shell-bottom`
    is `height-Footer` when `data-footer-sticky`.
  - A sticky side nav is the viewport's height minus both, with its own
    scroll. A full-height one is the viewport's height, at `top: 0`.
- **The drawer:** `shellDrawer(name, min)` emits one
  `@media (max-width: min − 0.02px)` block per breakpoint, scoped by
  `[data-drawer-below="name"]`.
  - The nav, whatever its slot, becomes `position: fixed` on the left,
    slid out and `visibility: hidden`. `[data-drawer-open]` slides it in.
  - `visibility` switches at once on opening (so `focus()` works) and only
    after the slide on closing.
  - The burger, the overlay and a generated header show; the collapse
    button hides; labels show even when collapsed.
- **Specificity:** wide-screen rules wrap their ancestor conditions in
  `:where()`, so the later drawer rules win without tricks. Keep it that
  way when adding rules.
- **Z-order:** sticky header and footer 100, sticky below-header nav 99,
  overlay 99, drawer 101, a bar's dropdown group 102.
- **Mantine:** `Burger.layer.css` is part of `MANTINE_STYLESHEET`. The
  burger's color is `--burger-color: textColor-AppHeader`, because pfui
  doesn't define `--mantine-color-black`.

**Theme variables** (defaults in `metadata.ts`):

- `height-AppHeader` 56px;
- `width-navPanel-App` 256px;
- `width-navPanel-collapsed-App` 48px;
- `height-Footer` 48px;
- `maxWidth-content-App` none;
- `paddingHorizontal-content-App` and `paddingVertical-content-App`
  `$space-4`;
- the regions' and NavLink's colors, borders and paddings.

## The drawer's behavior (`useDrawer`)

- It closes on navigation (`$pathname` changes), on Escape (the focus
  returns to the burger), on the overlay, and when the window grows past
  the breakpoint. A `matchMedia` listener, attached only while it is open,
  handles the last case.
- Opening focuses the nav's first link, summary or button.
- The burger has `aria-expanded` and `aria-controls` (the nav's `useId`
  id, the same on the server and the client).

## Server rendering

Nothing depends on the window's width in JavaScript, so a prerender is
right at every width, and the takeover reuses every node
(`e2e/app-shell-prerender.spec.ts`). The prerender hook of the Vite plugin
fills only `index.html` (a multi-page build's other pages have their own
entries).

## Files

| File | Contents |
|------|----------|
| `compiler/src/module/shell.ts` | `shellConfig`, `ShellConfig`: settings and combination checks |
| `compiler/src/module/compile-module.ts` | `regions()`, the region check in `node()`, `removedProps` (E030), the collapse-button check at the end |
| `components/src/metadata.ts` | The six shell components, `regions`/`isRegion`/`removedProps`, `LAYOUT_EQUIVALENTS`, `DRAWER_BREAKPOINTS` |
| `components/src/shell.tsx` | `Shell`, `shellAttributes`, `needsGeneratedHeader`, `appLogo`, `AppHeader`, `NavPanel`, `Footer`, `NavLink`, `isActiveRoute`, `NavGroup`, `NavPanelCollapseButton` |
| `components/src/icons.tsx` | `Icon`, `ICON_NAMES` |
| `components/src/styles.ts` | `SHELL`, `shellDrawer()` |
| `components/src/theme.tsx` | `App`: the root attributes and `Shell` |
| `runtime/src/render/shell-state.ts` | `navPanelCollapsed`, `navDrawerOpen`, their setters, `resetShellState` |
| `playground/src/layouts/*.pfui`, `playground/layouts.html`, `src/layouts.tsx` | One demo App per XMLUI layout (and one new combination), one per page |
| `playground/src/react/LayoutPreview.tsx`, `components/AppShellScenario.pfui` | The playground's "App shell" scenario |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/shell.test.ts` | `$$shell` for each setting and default; regions as props; E026/E023/E028/E029/E030 at their spans; each layout's migration message; every replacement compiles |
| `components/tests/shell.test.tsx` | The four nav slots; landmarks; the root's attributes; header parts, logo rule, generated header, burger; the drawer (toggle, overlay, focus, Escape, navigation); collapsing (button, script, not collapsible, initials); `isActiveRoute` table; NavLink and NavGroup; items from `Items` |
| `e2e/app-shell.spec.ts` (project `playground`) | Each of the nine layout demos at 1280×720: placement measured, scrolled, what stayed. At 390×760: the drawer, focus, Escape, a link, the overlay. Collapsing; a dropdown NavGroup; the active link |
| `e2e/app-shell-prerender.spec.ts` (project `playground-build`) | The playground's production build: the shell without JavaScript at both widths, a takeover replacing no node, live afterwards; `layouts.html` not prerendered |
| `e2e/playground.spec.ts`, `playground-scenarios.spec.ts` | The playground's side nav; the App shell scenario's frames |
