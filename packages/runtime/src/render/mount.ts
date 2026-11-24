// Starting an app in the browser: a fresh render, or the takeover of
// prerendered HTML (static generation, step 13).

import { createElement, useEffect, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { reportRuntimeError } from "../errors";
import { setBasename, setServerPath } from "./router";
import { breakpointFromName, setServerBreakpoint } from "./visibility";

/**
 * Marks a container filled by the prerender. Its value is the breakpoint
 * name the HTML was rendered for (`server.ts` `renderStatic`).
 */
export const PRERENDERED_ATTRIBUTE = "data-pfui-prerendered";

/**
 * The route a prerendered container was rendered for (step 21: one file per
 * static route). Hydration renders the same route; without it, "/".
 */
export const PATH_ATTRIBUTE = "data-pfui-path";

/**
 * The sub-path a browser-routed app is served under (`/app`), from Vite's
 * `base`: the Vite plugin writes it on the container (step 21, part 2). The
 * router reads routes below it and puts it in front of every URL it makes.
 */
export const BASE_ATTRIBUTE = "data-pfui-base";

/**
 * Set on the container once the first render (or the takeover) is committed
 * and its effects have run: the app is interactive. Tests wait for it, and
 * styles can tell prerendered HTML that is not yet live (`:not([data-pfui-ready])`).
 */
export const READY_ATTRIBUTE = "data-pfui-ready";

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
   * `reportRuntimeError`.
   */
  onRecoverableError?: (error: unknown) => void;
  /**
   * The sub-path the app is served under, for browser routing (`/app`).
   * Default: the container's `data-pfui-base` (written by the Vite plugin from
   * `base`), else none.
   */
  basename?: string;
}

/**
 * Renders `app` into `container`. A prerendered container is hydrated: React
 * reuses its DOM, rendering with the breakpoint and the route the HTML was made for, then
 * updates whatever differs on this client (a responsive `When`). Any other
 * container gets a fresh root. Either way the container gets `data-pfui-ready`
 * once the app is live.
 */
export function mountApp(container: Element, app: ReactNode, options: MountOptions = {}): Root {
  const prerendered = container.getAttribute(PRERENDERED_ATTRIBUTE);
  container.removeAttribute(READY_ATTRIBUTE);
  const basename = options.basename ?? container.getAttribute(BASE_ATTRIBUTE);
  if (basename !== null) setBasename(basename);
  const tree = createElement(Ready, { container, children: app });
  if (prerendered !== null) {
    setServerBreakpoint(breakpointFromName(prerendered) ?? 0);
    setServerPath(container.getAttribute(PATH_ATTRIBUTE) ?? "/");
    return hydrateRoot(container, tree, {
      onRecoverableError: (error) => (options.onRecoverableError ?? reportRuntimeError)(error),
    });
  }
  const root = createRoot(container);
  root.render(tree);
  return root;
}
