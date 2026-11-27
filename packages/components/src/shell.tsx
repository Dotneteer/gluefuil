// The App shell (steps 19A–19C): AppHeader, NavPanel, Footer, NavLink,
// NavGroup, NavPanelCollapseButton, and the structure App renders around its
// content. Design: .ai/plan/poc-19a-app-shell.md
//
// One DOM structure for every app. Only the nav moves, into one of four slots:
//
//   div.gfui-App                 data-scroll, data-nav, data-drawer-below, …
//     [nav: side + fullHeight]
//     div.gfui-AppColumn
//       header.gfui-AppHeader    [nav: header]
//       [nav: below-header]
//       div.gfui-AppBody
//         [nav: side]
//         main.gfui-AppMain > div.gfui-AppContent   (the content)
//       footer.gfui-Footer
//     div.gfui-App-overlay       (while the drawer is open)
//
// CSS (styles.ts) does the rest: what sticks, what scrolls, and the drawer
// below the breakpoint. Nothing is measured. The compiler passes the regions
// and their settings (`$$shell`, compiler src/module/shell.ts).

import { Burger } from "@mantine/core";
import {
  BREAKPOINTS,
  currentLocation,
  hrefFor,
  navDrawerOpen,
  navigate,
  navPanelCollapsed,
  setNavDrawerOpen,
  setNavPanelCollapsed,
  useComputed,
  useSignal,
  type TemplateRenderer,
} from "@gluefuil/runtime";
import { createContext, useContext, useEffect, useId, useMemo, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { RenderBoundary } from "./errors";
import { Glyph } from "./icons";
import { BAR_SCOPE, childCount, LayoutScope, pageScope } from "./layout";

/** The shell's settings, decided by the compiler (`$$shell`). */
export interface ShellConfig {
  scroll: string;
  header?: { sticky: boolean };
  nav?: { placement: string; fullHeight: boolean; sticky: boolean; drawerBelow: string; collapsible: boolean };
  footer?: { sticky: boolean };
}

const NO_SHELL: ShellConfig = { scroll: "page" };

interface ShellContextValue {
  config: ShellConfig;
  /** The NavPanel element, for the header to render when placement="header". */
  nav: ReactNode;
  /** The App's logo (image or template), for the region in the top-left corner. */
  logo: ReactNode;
  navId: string;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";

/** The current pathname, reactively. */
function usePathname(): string {
  return useComputed(() => currentLocation().pathname, []);
}

// ---------------------------------------------------------------------------
// The structure (rendered by App)

export interface ShellProps {
  config?: ShellConfig;
  header?: ReactNode;
  nav?: ReactNode;
  footer?: ReactNode;
  logo: ReactNode;
  root: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
}

/** The `data-*` attributes of the App's root element: everything CSS needs. */
export function shellAttributes(config: ShellConfig | undefined, hasHeader: boolean, collapsed: boolean, drawerOpen: boolean): Record<string, string | undefined> {
  const shell = config ?? NO_SHELL;
  const nav = shell.nav;
  const flag = (on: boolean | undefined) => (on ? "" : undefined);
  return {
    "data-scroll": shell.scroll,
    "data-nav": nav?.placement,
    "data-nav-full-height": flag(nav?.placement === "side" && nav.fullHeight),
    "data-drawer-below": nav && nav.drawerBelow !== "never" ? nav.drawerBelow : undefined,
    "data-header-sticky": flag(hasHeader && (shell.header?.sticky ?? true)),
    "data-footer-sticky": flag(shell.footer?.sticky),
    "data-nav-collapsed": flag(collapsed && nav?.placement === "side" && nav.collapsible),
    "data-drawer-open": flag(drawerOpen && nav !== undefined),
  };
}

/** Whether App renders a header of its own: a nav that lives in the header or can move into a drawer needs one. */
export function needsGeneratedHeader(config: ShellConfig | undefined, hasHeader: boolean): boolean {
  const nav = config?.nav;
  return !hasHeader && nav !== undefined && (nav.placement === "header" || nav.drawerBelow !== "never");
}

export function Shell({ config = NO_SHELL, header, nav, footer, logo, root, children }: ShellProps) {
  const navId = useId();
  const placement = config.nav?.placement;
  const slot = (where: string, fullHeight = false) =>
    nav !== undefined && placement === where && (where !== "side" || config.nav!.fullHeight === fullHeight) ? nav : null;
  const drawerOpen = useSignal(navDrawerOpen);
  useDrawer(config, drawerOpen, root);
  const theHeader = header ?? (needsGeneratedHeader(config, header !== undefined) ? <AppHeader $$generated /> : null);
  // The layout levels (layout.tsx): the content is the page (level 0); the
  // regions are bars, whose content starts at the deepest level.
  const single = childCount(children) === 1;
  const page = useMemo(() => pageScope(single), [single]);
  const pathname = useComputed(() => currentLocation().pathname, []);
  const bar = (region: ReactNode) => (region === null || region === undefined ? null : <LayoutScope value={BAR_SCOPE}>{region}</LayoutScope>);
  return (
    <ShellContext.Provider value={{ config, nav, logo, navId }}>
      {bar(slot("side", true))}
      <div className="gfui-AppColumn">
        {bar(theHeader)}
        {bar(slot("below-header"))}
        <div className="gfui-AppBody">
          {bar(slot("side"))}
          <main className="gfui-AppMain">
            <div className="gfui-AppContent">
              {/* Step 33: a render error in the content shows a panel there; the shell stays. A navigation resets it. */}
              <LayoutScope value={page}>
                <RenderBoundary resetKey={pathname}>{children}</RenderBoundary>
              </LayoutScope>
            </div>
          </main>
        </div>
        {bar(footer)}
      </div>
      {drawerOpen && config.nav ? <div className="gfui-App-overlay" onClick={() => setNavDrawerOpen(false)} /> : null}
    </ShellContext.Provider>
  );
}

/**
 * The drawer's behavior: it closes on navigation, on Escape and when the
 * window grows past the breakpoint; opening moves the focus into the nav,
 * Escape returns it to the toggle.
 */
function useDrawer(config: ShellConfig, open: boolean, root: RefObject<HTMLDivElement | null>): void {
  const pathname = usePathname();
  const drawerBelow = config.nav?.drawerBelow;
  useEffect(() => {
    setNavDrawerOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const element = root.current;
    element?.querySelector<HTMLElement>(".gfui-NavPanel a, .gfui-NavPanel summary, .gfui-NavPanel button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavDrawerOpen(false);
      element?.querySelector<HTMLElement>(".gfui-AppHeader-burger")?.focus();
    };
    document.addEventListener("keydown", onKey);
    const min = BREAKPOINTS.find(([name]) => name === drawerBelow)?.[1];
    const wide = min === undefined ? undefined : window.matchMedia(`(min-width: ${min}px)`);
    const onWide = () => {
      if (wide?.matches) setNavDrawerOpen(false);
    };
    wide?.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide?.removeEventListener("change", onWide);
    };
  }, [open, drawerBelow, root]);
}

/** The App's logo: `logoTemplate`, else the image for the active tone. */
export function appLogo(tone: string, logo: unknown, logoLight: unknown, logoDark: unknown, logoTemplate: TemplateRenderer | undefined): ReactNode {
  if (logoTemplate) return logoTemplate({});
  const url = appLogoUrl(tone, logo, logoLight, logoDark);
  return url ? <img className="gfui-AppLogo" src={url} alt="Logo" /> : null;
}

/** The App's logo image for the tone: `logo-dark`/`logo-light`, else `logo` (step 32: Logo shows it too). */
export function appLogoUrl(tone: string, logo: unknown, logoLight: unknown, logoDark: unknown): string | undefined {
  const toned = tone === "dark" ? logoDark : logoLight;
  return typeof toned === "string" && toned !== "" ? toned : typeof logo === "string" && logo !== "" ? logo : undefined;
}

// ---------------------------------------------------------------------------
// The regions

export function AppHeader({
  title,
  showLogo,
  sticky,
  logoTemplate,
  titleTemplate,
  profileMenuTemplate,
  $$generated,
  children,
}: {
  title?: unknown;
  showLogo?: unknown;
  sticky?: unknown;
  logoTemplate?: TemplateRenderer;
  titleTemplate?: TemplateRenderer;
  profileMenuTemplate?: TemplateRenderer;
  $$generated?: boolean;
  children?: ReactNode;
}) {
  const shell = useContext(ShellContext);
  const drawerOpen = useSignal(navDrawerOpen);
  const nav = shell?.config.nav;
  const logo = isFalse(showLogo) ? null : logoTemplate ? logoTemplate({}) : shell?.logo;
  const titleContent = titleTemplate ? titleTemplate({}) : title !== undefined && title !== null && title !== "" ? String(title) : null;
  return (
    <header className="gfui-AppHeader" data-sticky={isFalse(sticky) ? undefined : ""} data-generated={$$generated ? "" : undefined}>
      {nav && nav.drawerBelow !== "never" ? (
        <Burger
          className="gfui-AppHeader-burger"
          opened={drawerOpen}
          onClick={() => setNavDrawerOpen(!drawerOpen)}
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
          aria-controls={shell!.navId}
          size="sm"
        />
      ) : null}
      {logo ? <div className="gfui-AppHeader-logo">{logo}</div> : null}
      {titleContent !== null ? <div className="gfui-AppHeader-title">{titleContent}</div> : null}
      {nav?.placement === "header" ? shell!.nav : null}
      <div className="gfui-AppHeader-content">{children}</div>
      {profileMenuTemplate ? <div className="gfui-AppHeader-profile">{profileMenuTemplate({})}</div> : null}
    </header>
  );
}

export function NavPanel({
  placement,
  sticky,
  logoTemplate,
  footerTemplate,
  children,
}: {
  placement?: unknown;
  sticky?: unknown;
  logoTemplate?: TemplateRenderer;
  footerTemplate?: TemplateRenderer;
  children?: ReactNode;
} & Record<string, unknown>) {
  const shell = useContext(ShellContext);
  const where = typeof placement === "string" ? placement : "header";
  // The logo shows in the nav when the nav holds the top-left corner.
  const logo = shell?.config.nav?.placement === "side" && shell.config.nav.fullHeight ? (logoTemplate ? logoTemplate({}) : shell.logo) : null;
  return (
    <nav className="gfui-NavPanel" id={shell?.navId} data-placement={where} data-sticky={isFalse(sticky) ? undefined : ""} aria-label="Main">
      {logo ? <div className="gfui-NavPanel-logo">{logo}</div> : null}
      <div className="gfui-NavPanel-items">{children}</div>
      {footerTemplate ? <div className="gfui-NavPanel-footer">{footerTemplate({})}</div> : null}
    </nav>
  );
}

export function Footer({ sticky, children }: { sticky?: unknown; children?: ReactNode }) {
  return (
    <footer className="gfui-Footer" data-sticky={isFalse(sticky) ? undefined : ""}>
      {children}
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Navigation items

/** Whether `to` is active at `pathname`: exactly, or (unless `exact`, and never for "/") a path below it. */
export function isActiveRoute(to: string, pathname: string, exact: boolean): boolean {
  if (pathname === to) return true;
  if (exact || to === "/") return false;
  return pathname.startsWith(to.endsWith("/") ? to : `${to}/`);
}

/** The first letter of a label: what a collapsed nav shows for an item without an icon. */
function initial(label: unknown): string {
  return typeof label === "string" ? label.trim().charAt(0).toUpperCase() : "";
}

export function NavLink({
  label,
  to,
  icon,
  exact,
  active,
  children,
}: {
  label?: unknown;
  to?: unknown;
  icon?: unknown;
  exact?: unknown;
  active?: unknown;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const target = typeof to === "string" ? to : undefined;
  const isActive = isTrue(active) || (!isFalse(active) && target !== undefined && isActiveRoute(target, pathname, isTrue(exact)));
  const text = label !== undefined && label !== null ? String(label) : undefined;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (target === undefined) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void navigate(target);
  };
  return (
    <a
      className="gfui-NavLink"
      href={target !== undefined ? hrefFor(target) : undefined}
      onClick={onClick}
      data-active={isActive ? "" : undefined}
      aria-current={isActive ? "page" : undefined}
      title={text}
    >
      {icon ? <Glyph name={icon} className="gfui-NavLink-icon" /> : <span className="gfui-NavLink-initial" aria-hidden="true">{initial(text)}</span>}
      <span className="gfui-NavLink-label">{text ?? children}</span>
    </a>
  );
}

export function NavGroup({ label, icon, initiallyExpanded, children }: { label?: unknown; icon?: unknown; initiallyExpanded?: unknown; children?: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const text = label !== undefined && label !== null ? String(label) : "";
  // In a bar (header or below-header) the group is a dropdown: navigating or clicking elsewhere closes it.
  const inBar = () => ref.current?.closest(".gfui-NavPanel")?.getAttribute("data-placement") !== "side" && !ref.current?.closest(".gfui-App[data-drawer-open]");
  useEffect(() => {
    if (ref.current && inBar()) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const onClick = (event: globalThis.MouseEvent) => {
      const details = ref.current;
      if (details?.open && inBar() && !details.contains(event.target as Node)) details.open = false;
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <details className="gfui-NavGroup" ref={ref} open={isTrue(initiallyExpanded) || undefined}>
      <summary className="gfui-NavGroup-label" title={text}>
        {icon ? <Glyph name={icon} className="gfui-NavLink-icon" /> : <span className="gfui-NavLink-initial" aria-hidden="true">{initial(text)}</span>}
        <span className="gfui-NavLink-label">{text}</span>
        <Glyph name="chevronDown" className="gfui-NavGroup-chevron" />
      </summary>
      <div className="gfui-NavGroup-items">{children}</div>
    </details>
  );
}

export function NavPanelCollapseButton({ "aria-label": label, "aria-labelCollapsed": labelCollapsed }: { "aria-label"?: unknown; "aria-labelCollapsed"?: unknown }) {
  const collapsed = useSignal(navPanelCollapsed);
  const name = collapsed ? (typeof labelCollapsed === "string" ? labelCollapsed : "Expand navigation") : typeof label === "string" ? label : "Collapse navigation";
  return (
    <button type="button" className="gfui-NavPanelCollapseButton" aria-label={name} aria-expanded={!collapsed} onClick={() => setNavPanelCollapsed(!collapsed)}>
      <Glyph name={collapsed ? "chevronRight" : "chevronLeft"} />
    </button>
  );
}
