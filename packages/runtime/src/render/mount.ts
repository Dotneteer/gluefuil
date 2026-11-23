// Starting an app in the browser: a fresh render, or the takeover of
// prerendered HTML (static generation, step 13).

import { createElement, useEffect, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { reportRuntimeError } from "../errors";
import { breakpointFromName, setServerBreakpoint } from "./visibility";

/**
 * Marks a container filled by the prerender. Its value is the breakpoint
 * name the HTML was rendered for (`server.ts` `renderStatic`).
 */
export const PRERENDERED_ATTRIBUTE = "data-pfui-prerendered";

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
}

/**
 * Renders `app` into `container`. A prerendered container is hydrated: React
 * reuses its DOM, rendering with the breakpoint the HTML was made for, then
 * updates whatever differs on this client (a responsive `When`). Any other
 * container gets a fresh root. Either way the container gets `data-pfui-ready`
 * once the app is live.
 */
export function mountApp(container: Element, app: ReactNode, options: MountOptions = {}): Root {
  const prerendered = container.getAttribute(PRERENDERED_ATTRIBUTE);
  container.removeAttribute(READY_ATTRIBUTE);
  const tree = createElement(Ready, { container, children: app });
  if (prerendered !== null) {
    setServerBreakpoint(breakpointFromName(prerendered) ?? 0);
    return hydrateRoot(container, tree, {
      onRecoverableError: (error) => (options.onRecoverableError ?? reportRuntimeError)(error),
    });
  }
  const root = createRoot(container);
  root.render(tree);
  return root;
}
