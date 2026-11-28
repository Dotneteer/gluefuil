// @gluefuil/runtime/server: rendering to static HTML (static generation).
// A separate entry point, so `react-dom/server` stays out of client bundles.

import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { resetDataState } from "./data/client";
import { BASE_ATTRIBUTE, PATH_ATTRIBUTE, PRERENDERED_ATTRIBUTE } from "./render/mount";
import { getBasename, getServerPath, resetRouter, setBasename, setServerPath } from "./render/router";
import { resetShellState } from "./render/shell-state";
import { inStaticRender, staticDocument, staticTitle } from "./render/static-render";
import { resetThemeState } from "./render/theme-state";
import { BREAKPOINT_NAMES, breakpointFromName, setServerBreakpoint, type BreakpointName } from "./render/visibility";

export { BASE_ATTRIBUTE, PATH_ATTRIBUTE, PRERENDERED_ATTRIBUTE } from "./render/mount";
// For the prerender: loads a render waited for (step 23: lazy chunks such as Markdown's renderer).
export { takeServerLoads } from "./render/lazy";
// For the prerender: which routes the app registered, and in which mode (step 21).
export { findRoute, registeredRoutes, routingMode } from "./render/router";

export interface RenderStaticOptions {
  /** The viewport to render for (default "xs", mobile-first). */
  breakpoint?: BreakpointName;
  /** The route to render (default "/"); written to the container as `data-gfui-path`. */
  path?: string;
  /**
   * The sub-path the app is served under (browser routing): links in the HTML
   * carry it, and it is written to the container as `data-gfui-base`.
   */
  basename?: string;
}

export interface RenderStaticResult {
  /** The container's inner HTML. */
  html: string;
  /** Attributes for the container: `mountApp` hydrates when it finds them. */
  attributes: Record<string, string>;
  /** The page title a PageMetaTitle rendered (step 32), for the document's `<title>`. */
  title?: string;
  /** Step 34: the App's locale and direction, for `<html lang dir>`. */
  document?: { lang: string; dir: string };
}

/**
 * Renders `app` (an element, or a component to render without props) to HTML for a container that `mountApp` will take over. The
 * render reads server snapshots (the server view), with the given breakpoint;
 * hydration reads the same.
 */
export function renderStatic(app: ReactNode | ComponentType, options: RenderStaticOptions = {}): RenderStaticResult {
  const name = options.breakpoint ?? "xs";
  const index = breakpointFromName(name);
  if (index === undefined) {
    throw new Error(`Unknown breakpoint '${name}'; expected one of ${BREAKPOINT_NAMES.join(", ")}`);
  }
  setServerBreakpoint(index);
  setServerPath(options.path ?? "/");
  if (options.basename !== undefined) setBasename(options.basename);
  // A component (a compiled module's default export) is rendered without props.
  const element = typeof app === "function" && !isValidElement(app) ? createElement(app as ComponentType) : (app as ReactNode);
  // The app's identity (its component) tells a new render from the prerender rendering the same route again.
  const identity = isValidElement(element) ? element.type : element;
  const html = inStaticRender(getServerPath(), identity, () => renderToString(element));
  const attributes: Record<string, string> = { [PRERENDERED_ATTRIBUTE]: name, [PATH_ATTRIBUTE]: getServerPath() };
  if (getBasename() !== "") attributes[BASE_ATTRIBUTE] = getBasename();
  const title = staticTitle();
  const document = staticDocument();
  return { html, attributes, ...(title === undefined ? {} : { title }), ...(document === undefined ? {} : { document }) };
}

/**
 * Resets the runtime's module-level state (the router and its registered
 * routes, the theme, the shell, the data cache) so the next `renderStatic`
 * does not depend on what rendered before it: the prerender renders every
 * route in one module graph.
 */
export function resetServerState(): void {
  resetRouter();
  resetThemeState();
  resetShellState();
  resetDataState();
}
