// One place where the runtime reports errors it cannot throw to a caller:
// failing watchers, handler errors (sync or async), recovered store faults.
// The default uses the platform's `reportError` (which surfaces like an
// uncaught exception), or `console.error` where it is missing.

export type ErrorReporter = (error: unknown) => void;

// Platform functions, typed here because the runtime is also type-checked
// without DOM types (tools/ includes it for the sandbox drift test).
const platform = globalThis as unknown as {
  reportError?: (error: unknown) => void;
  console: { error(...data: unknown[]): void };
  queueMicrotask(callback: () => void): void;
};

const defaultReporter: ErrorReporter = (error) => {
  if (typeof platform.reportError === "function") platform.reportError(error);
  else platform.console.error(error);
};

/** `queueMicrotask`, typed without DOM types. */
export function scheduleMicrotask(callback: () => void): void {
  platform.queueMicrotask(callback);
}

let reporter: ErrorReporter = defaultReporter;

export function reportRuntimeError(error: unknown): void {
  try {
    reporter(error);
  } catch {
    // A failing reporter must not break the runtime.
  }
}

/** Replaces the error reporter; returns a function that restores the previous one. */
export function setErrorReporter(next: ErrorReporter): () => void {
  const previous = reporter;
  reporter = next;
  return () => {
    reporter = previous;
  };
}
