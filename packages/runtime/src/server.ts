// @patchfuil/runtime/server: rendering to static HTML (static generation).
// A separate entry point, so `react-dom/server` stays out of client bundles.

import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { PRERENDERED_ATTRIBUTE } from "./render/mount";
import { BREAKPOINT_NAMES, breakpointFromName, setServerBreakpoint, type BreakpointName } from "./render/visibility";

export { PRERENDERED_ATTRIBUTE } from "./render/mount";

export interface RenderStaticOptions {
  /** The viewport to render for (default "xs", mobile-first). */
  breakpoint?: BreakpointName;
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
  // A component (a compiled module's default export) is rendered without props.
  const element = typeof app === "function" && !isValidElement(app) ? createElement(app as ComponentType) : (app as ReactNode);
  return { html: renderToString(element), attributes: { [PRERENDERED_ATTRIBUTE]: name } };
}
