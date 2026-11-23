// Routing components (step 19, reduced): Pages, Page, Link. The router itself
// (location, navigate, matching) is in the runtime. Design:
// .ai/plan/poc-19-routing.md
import { currentLocation, findRoute, hrefFor, navigate, registerRoutes, useComputed } from "@patchfuil/runtime";
import { Children, isValidElement, useEffect, type MouseEvent, type ReactNode } from "react";

/** A Page's content; Pages decides whether it is rendered. */
export function Page({ children }: { url?: unknown; children?: ReactNode }) {
  return <>{children}</>;
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
 * that is not a Page. Nothing matching: navigates to `fallbackPath` (replacing
 * the history entry).
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
    if (activeIndex === -1 && pathname !== fallback) navigate(fallback, { replace: true });
  }, [activeIndex, pathname, fallback]);
  return <>{items.filter((_, index) => urls[index] === undefined || index === activeIndex)}</>;
}

/** A link to a route: a real href (`#/x` in hash mode); a plain click navigates without a page load. */
export function Link({ to, label, children }: { to?: unknown; label?: unknown; children?: ReactNode }) {
  const target = typeof to === "string" ? to : "/";
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle new tabs and windows.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(target);
  };
  return (
    <a className="pfui-Link" href={hrefFor(target)} onClick={onClick}>
      {label !== undefined && label !== null ? String(label) : children}
    </a>
  );
}
