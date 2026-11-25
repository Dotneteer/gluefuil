// Routing components (step 19, reduced): Pages, Page, Link. The router itself
// (location, navigate, matching) is in the runtime. Design:
// .ai/plan/poc-19-routing.md
import { currentLocation, findRoute, hrefFor, navigate, redirect, registerRoutes, useComputed } from "@gluefuil/runtime";
import { Children, isValidElement, useEffect, type MouseEvent, type ReactNode } from "react";
import { Glyph } from "./icons";
import { LayoutScope, useLayout, useRecountedScope, type LayoutProps } from "./layout";
import { mergeStyles, textOverflow, type TextOverflowProps } from "./text";

/** A Page's content; Pages decides whether it is rendered. */
export function Page({ children }: { url?: unknown; children?: ReactNode }) {
  // A fragment: the page's roots are the content's children. Counted again for
  // the layout's wrapper rule (layout.tsx).
  return <LayoutScope value={useRecountedScope(children)}>{children}</LayoutScope>;
}

/**
 * The route pattern of a child of Pages, if it is a Page: a plain element
 * (`$$h(Page, { url })`) or a Bound one (`$$h(Bound, { type: Page, props: { url } })`).
 * `url` is a literal (contract E026), so it is a constant prop either way.
 */
function routeOf(child: ReactNode): string | undefined {
  if (!isValidElement(child)) return undefined;
  const props = child.props as { url?: unknown; type?: unknown; props?: { url?: unknown } | null };
  if (child.type === Page) return typeof props.url === "string" ? props.url : undefined;
  if (props.type === Page) return typeof props.props?.url === "string" ? props.props.url : undefined;
  return undefined;
}

/**
 * Renders the first Page whose `url` matches the current path, and every child
 * that is not a Page. Nothing matching: redirects to `fallbackPath` (replacing
 * the history entry; an internal redirect, so `willNavigate` does not run).
 */
export function Pages({ fallbackPath, children }: { fallbackPath?: unknown; children?: ReactNode }) {
  const items = Children.toArray(children);
  const urls = items.map(routeOf);
  const patterns = urls.filter((url): url is string => url !== undefined);
  registerRoutes(patterns);
  const pathname = useComputed(() => currentLocation().pathname, []);
  const active = findRoute(pathname, patterns)?.pattern;
  const activeIndex = active === undefined ? -1 : urls.indexOf(active);
  const fallback = typeof fallbackPath === "string" ? fallbackPath : "/";
  useEffect(() => {
    if (activeIndex === -1 && pathname !== fallback) redirect(fallback);
  }, [activeIndex, pathname, fallback]);
  return <>{items.filter((_, index) => urls[index] === undefined || index === activeIndex)}</>;
}

/** A URL with a scheme (`https:`, `mailto:`) or protocol-relative (`//host`): not a route. */
export function isExternalUrl(to: string): boolean {
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(to);
}

type LinkProps = LayoutProps &
  TextOverflowProps & {
    to?: unknown;
    label?: unknown;
    icon?: unknown;
    target?: unknown;
    enabled?: unknown;
    active?: unknown;
    noIndicator?: unknown;
    onClick?: () => unknown;
    children?: ReactNode;
  };

/**
 * A link: to a route (a real href, `#/x` in hash mode; a plain click navigates
 * without a page load, through the router's guard), or to an external URL (the
 * browser follows it). `target` other than `_self` leaves the click to the
 * browser. `enabled="false"` renders no href. `click` runs before the
 * navigation.
 */
export function Link(props: LinkProps) {
  const { to, label, icon, target, enabled, active, noIndicator, onClick, children } = props;
  const layout = useLayout(props);
  const overflow = textOverflow(props);
  const disabled = enabled === false || enabled === "false";
  const destination = typeof to === "string" && to !== "" ? to : undefined;
  const external = destination !== undefined && isExternalUrl(destination);
  const newContext = typeof target === "string" && target !== "" && target !== "_self";
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (typeof onClick === "function") void onClick();
    // Let the browser handle external URLs, targets, new tabs and windows.
    if (destination === undefined || external || newContext) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void navigate(destination);
  };
  const text = label !== undefined && label !== null ? String(label) : children;
  return (
    <a
      className="gfui-Link"
      href={disabled || destination === undefined ? undefined : external ? destination : hrefFor(destination)}
      target={newContext ? String(target) : undefined}
      rel={newContext ? "noopener noreferrer" : undefined}
      aria-disabled={disabled ? true : undefined}
      data-active={active === true || active === "true" ? "" : undefined}
      data-no-indicator={noIndicator === true || noIndicator === "true" ? "" : undefined}
      tabIndex={destination === undefined && !disabled && typeof onClick === "function" ? 0 : undefined}
      role={destination === undefined && typeof onClick === "function" ? "button" : undefined}
      onClick={handleClick}
      {...overflow.attributes}
      {...layout.attributes}
      style={mergeStyles(layout.style, overflow.style)}
    >
      {icon ? <Glyph name={icon} className="gfui-Link-icon" /> : null}
      {icon ? <span className="gfui-Link-text">{text}</span> : text}
    </a>
  );
}
