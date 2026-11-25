// @gluefuil/runtime/server: rendering to static HTML (static generation).
// A separate entry point, so `react-dom/server` stays out of client bundles.

import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { resetDataState } from "./data/client";
import { BASE_ATTRIBUTE, PATH_ATTRIBUTE, PRERENDERED_ATTRIBUTE } from "./render/mount";
import { getBasename, getServerPath, resetRouter, setBasename, setServerPath } from "./render/router";
import { resetShellState } from "./render/shell-state";
import { resetThemeState } from "./render/theme-state";
import { BREAKPOINT_NAMES, breakpointFromName, setServerBreakpoint, type BreakpointName } from "./render/visibility";

export { BASE_ATTRIBUTE, PATH_ATTRIBUTE, PRERENDERED_ATTRIBUTE } from "./render/mount";
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
  const html = renderToString(element);
  const attributes: Record<string, string> = { [PRERENDERED_ATTRIBUTE]: name, [PATH_ATTRIBUTE]: getServerPath() };
  if (getBasename() !== "") attributes[BASE_ATTRIBUTE] = getBasename();
  return { html, attributes };
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
