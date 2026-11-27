// The App's error sink (step 33; design: .ai/plan/poc-33-errors.md § App onError
// and App.errors). An error nothing else handled reaches it through
// `reportRuntimeError`:
//
//   1. it is added to `App.errors` (the last 50, a reactive frozen array);
//   2. `App onError(error, event)` runs, when there is one; `event.preventDefault()`
//      or returning false (also after an await) suppresses the default report;
//   3. the default report (XMLUI's signError, AppContent.tsx L1896): an error
//      toast, an assertive announcement (the App's live region) and the console.
//
// A handler that throws is reported to the console once and never fed back.
import { AppError, pushErrorSink, reportToConsole, type ErrorSource } from "../errors";
import { signal, type ReadonlySignal } from "../reactivity/signals";
import { toast } from "./overlay-state";

/** XMLUI's default size of `App.errors` (`errorBufferSize`, AppContent.tsx L1656). */
export const ERROR_BUFFER_SIZE = 50;

const buffer = signal<readonly AppError[]>(Object.freeze([]));
const announcementSignal = signal<{ readonly message: string; readonly count: number }>(Object.freeze({ message: "", count: 0 }));

/** The unhandled errors, oldest first (`App.errors`). */
export const appErrors: ReadonlySignal<readonly AppError[]> = buffer;

/** The latest error announcement (the App renders it in an assertive live region). */
export const errorAnnouncement: ReadonlySignal<{ readonly message: string; readonly count: number }> = announcementSignal;

/** `event` of `App onError`. */
export interface AppErrorEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** `App onError`: the error and the event; false (or a promise of false) suppresses the default report. */
export type AppErrorHandler = (error: AppError, event: AppErrorEvent) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function";
}

/** The default report of an unhandled error: a toast, an announcement, the console. */
export function defaultErrorReport(error: AppError, raw: unknown): void {
  const message = error.message || "Something went wrong";
  toast.error(message);
  const previous = announcementSignal.peek();
  announcementSignal.set(Object.freeze({ message, count: previous.count + 1 }));
  reportToConsole(raw);
}

/** The App's sink: the buffer, `onError` (read when an error arrives), the default report. */
export function appErrorSink(handler: () => AppErrorHandler | undefined) {
  return (error: AppError, raw: unknown, _source: ErrorSource): void => {
    const next = [...buffer.peek(), error];
    buffer.set(Object.freeze(next.length > ERROR_BUFFER_SIZE ? next.slice(next.length - ERROR_BUFFER_SIZE) : next));
    const onError = handler();
    if (!onError) {
      defaultErrorReport(error, raw);
      return;
    }
    let prevented = false;
    const event: AppErrorEvent = Object.freeze({
      preventDefault() {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    });
    const finish = (result: unknown) => {
      if (!prevented && result !== false) defaultErrorReport(error, raw);
    };
    let result: unknown;
    try {
      result = onError(error, event);
    } catch (handlerError) {
      reportToConsole(handlerError);
      finish(undefined);
      return;
    }
    if (isThenable(result)) {
      result.then(finish, (handlerError: unknown) => {
        reportToConsole(handlerError);
        finish(undefined);
      });
    } else finish(result);
  };
}

/** Registers an App's sink; returns the function that removes it. */
export function registerAppErrors(handler: () => AppErrorHandler | undefined): () => void {
  return pushErrorSink(appErrorSink(handler));
}

/** The `App` app global (XMLUI's `App.errors`). */
export const AppGlobal = Object.freeze({
  get errors(): readonly AppError[] {
    return buffer.get();
  },
});

/** Clears the buffer and the announcement (tests; a new page). */
export function resetAppErrors(): void {
  buffer.set(Object.freeze([]));
  announcementSignal.set(Object.freeze({ message: "", count: 0 }));
}
