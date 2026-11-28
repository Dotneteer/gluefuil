// Starting an app in the browser: a fresh render, or the takeover of
// prerendered HTML (static generation, step 13).

import { createElement, useEffect, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { reportDiagnostic, reportRuntimeError } from "../errors";
import { autoEnableTrace } from "../trace";
import { setBasename, setServerPath } from "./router";
import { breakpointFromName, setServerBreakpoint } from "./visibility";

/**
 * Marks a container filled by the prerender. Its value is the breakpoint
 * name the HTML was rendered for (`server.ts` `renderStatic`).
 */
export const PRERENDERED_ATTRIBUTE = "data-gfui-prerendered";

/**
 * The route a prerendered container was rendered for (step 21: one file per
 * static route). Hydration renders the same route; without it, "/".
 */
export const PATH_ATTRIBUTE = "data-gfui-path";

/**
 * The sub-path a browser-routed app is served under (`/app`), from Vite's
 * `base`: the Vite plugin writes it on the container (step 21, part 2). The
 * router reads routes below it and puts it in front of every URL it makes.
 */
export const BASE_ATTRIBUTE = "data-gfui-base";

/**
 * Set on the container once the first render (or the takeover) is committed
 * and its effects have run: the app is interactive. Tests wait for it, and
 * styles can tell prerendered HTML that is not yet live (`:not([data-gfui-ready])`).
 */
export const READY_ATTRIBUTE = "data-gfui-ready";

/** Renders `children` unchanged (no DOM of its own) and marks the container when committed. */
function Ready({ container, children }: { container: Element; children: ReactNode }) {
  // The outermost component: its effect runs after every effect inside the app.
  useEffect(() => {
    container.setAttribute(READY_ATTRIBUTE, "");
  }, [container]);
  return children;
}

export interface MountOptions {
  /**
   * Called for errors React recovers from while hydrating, such as a
   * mismatch between the HTML and the first client render. Default:
   * `reportDiagnostic` (step 33: React recovered, so they are not the app's errors).
   */
  onRecoverableError?: (error: unknown) => void;
  /**
   * The sub-path the app is served under, for browser routing (`/app`).
   * Default: the container's `data-gfui-base` (written by the Vite plugin from
   * `base`), else none.
   */
  basename?: string;
  /** Step 35: false never turns tracing on for this page (the Inspector: it must not trace itself). */
  trace?: boolean;
}

/**
 * Step 33: render errors. A boundary that caught one (a Fallback, the built-in
 * boundaries) has handled or reported it: React's default console output is
 * dropped. One no boundary caught (the shell itself) removed the app: it is
 * reported as a render error.
 */
const ROOT_ERRORS = {
  onCaughtError: () => {},
  onUncaughtError: (error: unknown) => reportRuntimeError(error, "render"),
};

/**
 * Renders `app` into `container`. A prerendered container is hydrated: React
 * reuses its DOM, rendering with the breakpoint and the route the HTML was made for, then
 * updates whatever differs on this client (a responsive `When`). Any other
 * container gets a fresh root. Either way the container gets `data-gfui-ready`
 * once the app is live.
 */
export function mountApp(container: Element, app: ReactNode, options: MountOptions = {}): Root {
  // Step 35: tracing, when the dev server, the URL or a stored setting asks for it (before the first render).
  if (options.trace !== false) autoEnableTrace(container);
  const prerendered = container.getAttribute(PRERENDERED_ATTRIBUTE);
  container.removeAttribute(READY_ATTRIBUTE);
  const basename = options.basename ?? container.getAttribute(BASE_ATTRIBUTE);
  if (basename !== null) setBasename(basename);
  const tree = createElement(Ready, { container, children: app });
  if (prerendered !== null) {
    setServerBreakpoint(breakpointFromName(prerendered) ?? 0);
    setServerPath(container.getAttribute(PATH_ATTRIBUTE) ?? "/");
    return hydrateRoot(container, tree, {
      onRecoverableError: (error) => (options.onRecoverableError ?? ((problem: unknown) => reportDiagnostic(problem, { category: "hydration" })))(error),
      ...ROOT_ERRORS,
    });
  }
  const root = createRoot(container, ROOT_ERRORS);
  root.render(tree);
  return root;
}
