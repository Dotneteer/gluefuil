// The static render (step 32): which prerender pass is running, and for which
// path. `renderStatic` sets it around renderToString; components that collect
// during one pass and render in the next (the TableOfContents) read it. A
// client render (hydration included) sees undefined.

import { serverLoadCount } from "./lazy";

export interface StaticRenderInfo {
  /** Increases with every static render: a new pass of the same or another path. */
  readonly pass: number;
  /** The route being rendered. */
  readonly path: string;
  /**
   * The pass before this one, when it rendered the same app and path (the
   * prerender's loop renders a route again): whether it waited for code (then
   * what it rendered was incomplete).
   */
  readonly previous: { readonly pass: number; readonly waited: boolean } | undefined;
}

let current: StaticRenderInfo | undefined;
let title: string | undefined;
let passes = 0;
let last: { pass: number; path: string; app: unknown; waited: boolean } | undefined;

/** The running static render, or undefined outside one. */
export function staticRenderInfo(): StaticRenderInfo | undefined {
  return current;
}

/** Step 32 (PageMetaTitle): the page title a static pass rendered; the prerender writes it into `<title>`. */
export function setStaticTitle(value: string): void {
  if (current) title = value;
}

/** The title the last static pass set (undefined: none). */
export function staticTitle(): string | undefined {
  return title;
}

/** Runs `fn` as one static render pass of `app` (the rendered component) at `path`. */
export function inStaticRender<T>(path: string, app: unknown, fn: () => T): T {
  const outer = current;
  const pass = ++passes;
  const loadsBefore = serverLoadCount();
  title = undefined;
  const continues = last !== undefined && last.pass === pass - 1 && last.path === path && last.app === app;
  current = Object.freeze({ pass, path, previous: continues ? Object.freeze({ pass: last!.pass, waited: last!.waited }) : undefined });
  try {
    return fn();
  } finally {
    current = outer;
    last = { pass, path, app, waited: serverLoadCount() > loadsBefore };
  }
}
