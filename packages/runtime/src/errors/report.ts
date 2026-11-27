// One place where the runtime reports errors it cannot throw to a caller
// (step 33: the error pipeline; design: .ai/plan/poc-33-errors.md § The error
// pipeline): failing handlers (sync or async), loader errors nothing handled,
// render errors a boundary caught, failing watchers, navigation events.
//
//   reportRuntimeError(error, source)
//     → the innermost error sink (an App registers one: App.errors, App onError,
//       then the default report: a toast, an announcement and the console)
//     → without a sink: the console (the platform's `reportError`)
//
// Developer diagnostics (duplicate ids, a column's bad type, hydration's
// recoverable errors) are not the user's errors: `reportDiagnostic` sends them
// to the console only.
//
// This module must not import the reactivity store (the store reports through it).
import { AppError } from "./app-error";

export type ErrorReporter = (error: unknown) => void;

/** Where an error came from (`App onError` and traces can tell). */
export type ErrorSource = "handler" | "lifecycle" | "loader" | "render" | "navigation" | "internal";

/** Receives what `reportRuntimeError` reports: the error as an AppError, what was thrown, the source. */
export type ErrorSink = (error: AppError, raw: unknown, source: ErrorSource) => void;

// Platform functions, typed here because the runtime is also type-checked
// without DOM types (tools/ includes it for the sandbox drift test).
const platform = globalThis as unknown as {
  reportError?: (error: unknown) => void;
  console: { error(...data: unknown[]): void; warn(...data: unknown[]): void };
  queueMicrotask(callback: () => void): void;
};

const defaultReporter: ErrorReporter = (error) => {
  if (typeof platform.reportError === "function") platform.reportError(error);
  else platform.console.error(error);
};

const defaultDiagnosticReporter: ErrorReporter = (problem) => platform.console.warn(problem);

/** `queueMicrotask`, typed without DOM types. */
export function scheduleMicrotask(callback: () => void): void {
  platform.queueMicrotask(callback);
}

let reporter: ErrorReporter = defaultReporter;
let diagnosticReporter: ErrorReporter = defaultDiagnosticReporter;
const sinks: ErrorSink[] = [];

/** Reports an error nothing handled: to the innermost sink (an App's), else to the console. Never throws. */
export function reportRuntimeError(error: unknown, source: ErrorSource = "internal"): void {
  try {
    const sink = sinks[sinks.length - 1];
    if (sink) sink(AppError.from(error), error, source);
    else reporter(error);
  } catch {
    // A failing sink or reporter must not break the runtime.
  }
}

/** The console stage of the default report (an App's sink calls it after `App onError`). Never throws. */
export function reportToConsole(error: unknown): void {
  try {
    reporter(error);
  } catch {
    // ignore
  }
}

/** A developer diagnostic: the console only (a warning), never the app's error handling. Never throws. */
export function reportDiagnostic(problem: unknown): void {
  try {
    diagnosticReporter(problem);
  } catch {
    // ignore
  }
}

/**
 * Adds an error sink (an App, on mount); returns the function that removes it.
 * The innermost (last added, still present) sink receives the errors.
 */
export function pushErrorSink(sink: ErrorSink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.lastIndexOf(sink);
    if (index >= 0) sinks.splice(index, 1);
  };
}

/** Replaces the console reporter (tests); returns a function that restores the previous one. */
export function setErrorReporter(next: ErrorReporter): () => void {
  const previous = reporter;
  reporter = next;
  return () => {
    reporter = previous;
  };
}

/** Replaces the diagnostic reporter (tests); returns a function that restores the previous one. */
export function setDiagnosticReporter(next: ErrorReporter): () => void {
  const previous = diagnosticReporter;
  diagnosticReporter = next;
  return () => {
    diagnosticReporter = previous;
  };
}

/** Removes every sink (tests). */
export function resetErrorSinks(): void {
  sinks.length = 0;
}
