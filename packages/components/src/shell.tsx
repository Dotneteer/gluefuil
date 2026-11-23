// The App shell (steps 19A–19C): AppHeader, NavPanel, Footer, NavLink,
// NavGroup, NavPanelCollapseButton, and the structure App renders around its
// content. Design: .ai/plan/poc-19a-app-shell.md
//
// One DOM structure for every app. Only the nav moves, into one of four slots:
//
//   div.pfui-App                 data-scroll, data-nav, data-drawer-below, …
//     [nav: side + fullHeight]
//     div.pfui-AppColumn
//       header.pfui-AppHeader    [nav: header]
//       [nav: below-header]
//       div.pfui-AppBody
//         [nav: side]
//         main.pfui-AppMain > div.pfui-AppContent   (the content)
//       footer.pfui-Footer
//     div.pfui-App-overlay       (while the drawer is open)
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
} from "@patchfuil/runtime";
import { createContext, useContext, useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Icon } from "./icons";

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
  return (
    <ShellContext.Provider value={{ config, nav, logo, navId }}>
      {slot("side", true)}
      <div className="pfui-AppColumn">
        {theHeader}
        {slot("below-header")}
        <div className="pfui-AppBody">
          {slot("side")}
          <main className="pfui-AppMain">
            <div className="pfui-AppContent">{children}</div>
          </main>
        </div>
        {footer ?? null}
      </div>
      {drawerOpen && config.nav ? <div className="pfui-App-overlay" onClick={() => setNavDrawerOpen(false)} /> : null}
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
    element?.querySelector<HTMLElement>(".pfui-NavPanel a, .pfui-NavPanel summary, .pfui-NavPanel button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavDrawerOpen(false);
      element?.querySelector<HTMLElement>(".pfui-AppHeader-burger")?.focus();
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
  const toned = tone === "dark" ? logoDark : logoLight;
  const url = typeof toned === "string" && toned !== "" ? toned : typeof logo === "string" && logo !== "" ? logo : undefined;
  return url ? <img className="pfui-AppLogo" src={url} alt="Logo" /> : null;
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
    <header className="pfui-AppHeader" data-sticky={isFalse(sticky) ? undefined : ""} data-generated={$$generated ? "" : undefined}>
      {nav && nav.drawerBelow !== "never" ? (
        <Burger
          className="pfui-AppHeader-burger"
          opened={drawerOpen}
          onClick={() => setNavDrawerOpen(!drawerOpen)}
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
          aria-controls={shell!.navId}
          size="sm"
        />
      ) : null}
      {logo ? <div className="pfui-AppHeader-logo">{logo}</div> : null}
      {titleContent !== null ? <div className="pfui-AppHeader-title">{titleContent}</div> : null}
      {nav?.placement === "header" ? shell!.nav : null}
      <div className="pfui-AppHeader-content">{children}</div>
      {profileMenuTemplate ? <div className="pfui-AppHeader-profile">{profileMenuTemplate({})}</div> : null}
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
    <nav className="pfui-NavPanel" id={shell?.navId} data-placement={where} data-sticky={isFalse(sticky) ? undefined : ""} aria-label="Main">
      {logo ? <div className="pfui-NavPanel-logo">{logo}</div> : null}
      <div className="pfui-NavPanel-items">{children}</div>
      {footerTemplate ? <div className="pfui-NavPanel-footer">{footerTemplate({})}</div> : null}
    </nav>
  );
}

export function Footer({ sticky, children }: { sticky?: unknown; children?: ReactNode }) {
  return (
    <footer className="pfui-Footer" data-sticky={isFalse(sticky) ? undefined : ""}>
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
    navigate(target);
  };
  return (
    <a
      className="pfui-NavLink"
      href={target !== undefined ? hrefFor(target) : undefined}
      onClick={onClick}
      data-active={isActive ? "" : undefined}
      aria-current={isActive ? "page" : undefined}
      title={text}
    >
      {icon ? <Icon name={icon} className="pfui-NavLink-icon" /> : <span className="pfui-NavLink-initial" aria-hidden="true">{initial(text)}</span>}
      <span className="pfui-NavLink-label">{text ?? children}</span>
    </a>
  );
}

export function NavGroup({ label, icon, initiallyExpanded, children }: { label?: unknown; icon?: unknown; initiallyExpanded?: unknown; children?: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const text = label !== undefined && label !== null ? String(label) : "";
  // In a bar (header or below-header) the group is a dropdown: navigating or clicking elsewhere closes it.
  const inBar = () => ref.current?.closest(".pfui-NavPanel")?.getAttribute("data-placement") !== "side" && !ref.current?.closest(".pfui-App[data-drawer-open]");
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
    <details className="pfui-NavGroup" ref={ref} open={isTrue(initiallyExpanded) || undefined}>
      <summary className="pfui-NavGroup-label" title={text}>
        {icon ? <Icon name={icon} className="pfui-NavLink-icon" /> : <span className="pfui-NavLink-initial" aria-hidden="true">{initial(text)}</span>}
        <span className="pfui-NavLink-label">{text}</span>
        <Icon name="chevronDown" className="pfui-NavGroup-chevron" />
      </summary>
      <div className="pfui-NavGroup-items">{children}</div>
    </details>
  );
}

export function NavPanelCollapseButton({ "aria-label": label, "aria-labelCollapsed": labelCollapsed }: { "aria-label"?: unknown; "aria-labelCollapsed"?: unknown }) {
  const collapsed = useSignal(navPanelCollapsed);
  const name = collapsed ? (typeof labelCollapsed === "string" ? labelCollapsed : "Expand navigation") : typeof label === "string" ? label : "Collapse navigation";
  return (
    <button type="button" className="pfui-NavPanelCollapseButton" aria-label={name} aria-expanded={!collapsed} onClick={() => setNavPanelCollapsed(!collapsed)}>
      <Icon name={collapsed ? "chevronRight" : "chevronLeft"} />
    </button>
  );
}
