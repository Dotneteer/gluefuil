// The error pipeline (step 33, .ai/plan/poc-33-errors.md § The error pipeline,
// § App onError and App.errors): sinks, the App's sink, the default report.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AppError, pushErrorSink, reportDiagnostic, reportRuntimeError, resetErrorSinks, setDiagnosticReporter, setErrorReporter } from "../../src/errors";
import { AppGlobal, appErrors, errorAnnouncement, ERROR_BUFFER_SIZE, registerAppErrors, resetAppErrors, type AppErrorHandler } from "../../src/render/app-errors";
import { resetOverlayState, toasts } from "../../src/render/overlay-state";

let consoleErrors: unknown[];
let diagnostics: unknown[];
let restore: (() => void)[];

beforeEach(() => {
  consoleErrors = [];
  diagnostics = [];
  restore = [setErrorReporter((e) => consoleErrors.push(e)), setDiagnosticReporter((p) => diagnostics.push(p))];
});
afterEach(() => {
  for (const r of restore) r();
  resetErrorSinks();
  resetAppErrors();
  resetOverlayState();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("without an App", () => {
  test("an error goes to the console reporter as it was thrown", () => {
    const thrown = new Error("x");
    reportRuntimeError(thrown, "handler");
    expect(consoleErrors).toEqual([thrown]);
    expect(appErrors.peek()).toEqual([]);
    expect(toasts.peek()).toEqual([]);
  });

  test("a diagnostic goes to its own reporter, never the console's", () => {
    reportDiagnostic("duplicate ids");
    expect([diagnostics, consoleErrors]).toEqual([["duplicate ids"], []]);
  });
});

describe("sinks", () => {
  test("the innermost sink receives the AppError, the raw value and the source", () => {
    const outer: unknown[] = [];
    const inner: unknown[] = [];
    pushErrorSink((e, raw, source) => outer.push([e.message, raw, source]));
    const removeInner = pushErrorSink((e, raw, source) => inner.push([e instanceof AppError, raw, source]));
    reportRuntimeError("boom", "loader");
    expect([outer, inner]).toEqual([[], [[true, "boom", "loader"]]]);
    removeInner();
    reportRuntimeError("again");
    expect(outer).toEqual([["again", "again", "internal"]]);
  });

  test("a throwing sink doesn't break the caller", () => {
    pushErrorSink(() => {
      throw new Error("sink");
    });
    expect(() => reportRuntimeError("x")).not.toThrow();
  });
});

describe("the App's sink", () => {
  const app = (handler?: AppErrorHandler) => registerAppErrors(() => handler);

  test("without onError: App.errors, the toast, the announcement, the console", () => {
    app();
    const thrown = new Error("Save failed");
    reportRuntimeError(thrown, "handler");
    expect(appErrors.peek().map((e) => e.message)).toEqual(["Save failed"]);
    expect(AppGlobal.errors[0]).toBe(appErrors.peek()[0]);
    expect(toasts.peek().map((t) => [t.kind, t.message])).toEqual([["error", "Save failed"]]);
    expect(errorAnnouncement.peek()).toEqual({ message: "Save failed", count: 1 });
    expect(consoleErrors).toEqual([thrown]);
  });

  test.each<[string, AppErrorHandler, boolean]>([
    ["returns nothing", () => undefined, true],
    ["calls preventDefault()", (_, event) => event.preventDefault(), false],
    ["returns false", () => false, false],
  ])("onError that %s: default report %s", (_, handler, reported) => {
    app(handler);
    reportRuntimeError(new Error("x"));
    expect(toasts.peek().length).toBe(reported ? 1 : 0);
    expect(consoleErrors.length).toBe(reported ? 1 : 0);
    expect(appErrors.peek().length).toBe(1);
  });

  test("onError receives the AppError and the event; defaultPrevented follows", () => {
    const seen: unknown[] = [];
    app((error, event) => {
      seen.push(error.code, error.category, event.defaultPrevented);
      event.preventDefault();
      seen.push(event.defaultPrevented, Object.isFrozen(event));
    });
    reportRuntimeError(new AppError({ code: "export-off", category: "validation", message: "Off" }));
    expect(seen).toEqual(["export-off", "validation", false, true, true]);
  });

  test("an async onError: false or preventDefault after an await suppresses; else reported after it settles", async () => {
    app(async (error, event) => {
      await tick();
      if (error.message === "prevent") event.preventDefault();
      if (error.message === "false") return false;
      return undefined;
    });
    for (const message of ["prevent", "false", "report"]) reportRuntimeError(new Error(message));
    expect(toasts.peek()).toEqual([]);
    await tick();
    await tick();
    expect(toasts.peek().map((t) => t.message)).toEqual(["report"]);
  });

  test("a throwing onError: its error goes to the console once (no loop), and the default report runs", async () => {
    const handlerError = new Error("handler broke");
    app(() => {
      throw handlerError;
    });
    reportRuntimeError(new Error("original"));
    expect(consoleErrors.map(String)).toEqual(["Error: handler broke", "Error: original"]);
    expect(appErrors.peek().length).toBe(1);
    app(() => Promise.reject(handlerError));
    reportRuntimeError(new Error("second"));
    await tick();
    expect(consoleErrors.map(String).slice(2)).toEqual(["Error: handler broke", "Error: second"]);
  });

  test(`App.errors keeps the last ${ERROR_BUFFER_SIZE}, frozen`, () => {
    app(() => false);
    for (let i = 0; i < ERROR_BUFFER_SIZE + 5; i++) reportRuntimeError(new Error(`e${i}`));
    const list = appErrors.peek();
    expect([list.length, list[0]!.message, list.at(-1)!.message, Object.isFrozen(list)]).toEqual([ERROR_BUFFER_SIZE, "e5", `e${ERROR_BUFFER_SIZE + 4}`, true]);
  });

  test("the handler is read when an error arrives (a new onError after mount applies)", () => {
    let handler: AppErrorHandler | undefined;
    registerAppErrors(() => handler);
    reportRuntimeError(new Error("a"));
    handler = () => false;
    reportRuntimeError(new Error("b"));
    expect(toasts.peek().map((t) => t.message)).toEqual(["a"]);
  });
});
