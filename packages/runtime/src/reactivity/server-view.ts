// The server view: how values look to the server render and to hydration.
//
// Static generation renders on a machine without a viewport; the client
// hydrates on one with a viewport. Values that depend on the environment (the
// responsive breakpoint) must look the same to both, or hydration mismatches.
// React's getServerSnapshot is the hook for this: the server render and
// hydration read the server snapshot, and React re-renders afterwards wherever
// the client snapshot differs. Our server snapshots evaluate in the server
// view, and environment readers (visibility.ts `currentBreakpoint`) check it.

let depth = 0;

/** Runs `fn` in the server view. */
export function inServerView<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    depth--;
  }
}

/** True while evaluating a server snapshot (server rendering or hydration). */
export function isServerView(): boolean {
  return depth > 0;
}
