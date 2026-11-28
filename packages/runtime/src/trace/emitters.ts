// Entry builders shared by the runtime's emitters (step 35). Each is called
// only while `tracing` (the caller checks, so nothing is built when it is off).
import { AppError } from "../errors/app-error";
import { activeTrace, emit, newTrace, traceFields, type ActiveTrace } from "./core";
import type { Cause, ErrorEntry, LogEntry } from "./entries";
import type { SourceLocation } from "./location";
import { MASK, preview } from "./preview";

/** The running segment's trace, or a new one for work that started on its own. */
export function currentOrNewTrace(): ActiveTrace {
  return activeTrace() ?? { context: newTrace() };
}

/** An error: who handled it, in the running trace. */
export function traceError(error: unknown, source: string, handledBy: ErrorEntry["handledBy"]): void {
  const appError = AppError.from(error);
  const active = activeTrace();
  emit({
    kind: "error",
    ...traceFields(active?.context),
    ...(active?.at ? { at: active.at } : {}),
    source,
    code: appError.code,
    category: appError.category,
    message: appError.message,
    ...(appError.status !== undefined ? { status: appError.status } : {}),
    handledBy,
  });
}

/** Diagnostic categories (`reportDiagnostic`'s optional details). */
export interface DiagnosticDetails {
  category?: "i18n" | "data" | "component" | "hydration" | "general";
  at?: SourceLocation;
}

/** A developer diagnostic. */
export function traceDiagnostic(problem: unknown, details: DiagnosticDetails = {}): void {
  const active = activeTrace();
  emit({
    kind: "diagnostic",
    ...traceFields(active?.context),
    ...(details.at ? { at: details.at } : active?.at ? { at: active.at } : {}),
    message: problem instanceof Error ? problem.message : String(problem),
    category: details.category ?? "general",
  });
}

/** A `console.*` call from script. */
export function traceLog(level: LogEntry["level"], args: readonly unknown[]): void {
  const active = activeTrace();
  emit({
    kind: "log",
    ...traceFields(active?.context),
    ...(active?.at ? { at: active.at } : {}),
    level,
    args: active?.sensitive ? args.map(() => MASK) : args.map(preview),
  });
}

/**
 * A variable's write: its state entry, in the running trace (or a new one).
 * Returns the cause later evaluations name.
 */
export function traceState(variable: string, at: SourceLocation | undefined, before: unknown, after: unknown): Cause {
  const active = currentOrNewTrace();
  const masked = active.sensitive === true;
  const seq = emit({
    kind: "state",
    ...traceFields(active.context),
    ...(at ? { at } : {}),
    variable,
    before: masked ? MASK : preview(before),
    after: masked ? MASK : preview(after),
  });
  return { traceId: active.context.traceId, spanId: active.context.spanId, entry: seq };
}

/** Causes without duplicates (the same write read twice). */
export function uniqueCauses(causes: readonly Cause[]): Cause[] {
  const seen = new Set<string>();
  const result: Cause[] = [];
  for (const cause of causes) {
    const key = `${cause.spanId}:${cause.entry ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cause);
    }
  }
  return result;
}

let group = 0;
let groupOpen = false;

/** The group of the renders happening now: one per synchronous run (a store flush and React's commit). */
export function renderGroup(): number {
  if (!groupOpen) {
    groupOpen = true;
    group++;
    void Promise.resolve().then(() => {
      groupOpen = false;
    });
  }
  return group;
}
