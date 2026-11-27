// AppError (step 33, .ai/plan/poc-33-errors.md § AppError): the shape, the
// conversions, the categories, freezing.
import { describe, expect, test } from "vitest";
import { APP_ERROR_CATEGORIES, AppError, categoryOfStatus, retryableByDefault, withFields, type AppErrorCategory } from "../../src/errors/app-error";
import { httpError, toDataError, withAttempts } from "../../src/data/errors";

describe("categories", () => {
  test.each<[AppErrorCategory, boolean]>([
    ["network", true],
    ["timeout", true],
    ["validation", false],
    ["authorization", false],
    ["not-found", false],
    ["conflict", false],
    ["rate-limit", true],
    ["server", true],
    ["parse", false],
    ["user-cancelled", false],
    ["internal", false],
  ])("%s: retryable by default %s", (category, retryable) => {
    expect(retryableByDefault(category)).toBe(retryable);
    expect(new AppError({ category }).retryable).toBe(retryable);
    expect(new AppError({ category, retryable: !retryable }).retryable).toBe(!retryable);
  });

  test("XMLUI's nine plus timeout and parse", () => {
    expect([...APP_ERROR_CATEGORIES].sort()).toEqual(
      ["authorization", "conflict", "internal", "network", "not-found", "parse", "rate-limit", "server", "timeout", "user-cancelled", "validation"].sort(),
    );
  });

  test.each<[number, AppErrorCategory]>([
    [400, "validation"],
    [422, "validation"],
    [401, "authorization"],
    [403, "authorization"],
    [404, "not-found"],
    [409, "conflict"],
    [429, "rate-limit"],
    [500, "server"],
    [599, "server"],
    [418, "internal"],
    [302, "internal"],
  ])("status %i → %s", (status, category) => {
    expect(categoryOfStatus(status)).toBe(category);
  });
});

describe("the class", () => {
  test("an Error, named AppError, with defaults: code unknown, category internal", () => {
    const error = new AppError({ message: "Boom" });
    expect(error).toBeInstanceOf(Error);
    expect([error.name, error.message, error.code, error.category, error.retryable]).toEqual(["AppError", "Boom", "unknown", "internal", false]);
    expect(error.stack).toContain("AppError");
    expect(Object.keys(error.data)).toEqual([]);
  });

  test("frozen, its data deeply; absent fields are absent", () => {
    const error = new AppError({ code: "x", category: "conflict", message: "m", data: { nested: { a: [1] } } });
    expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen((error.data.nested as { a: number[] }).a)).toBe(true);
    expect("status" in error).toBe(false);
    expect("correlationId" in error).toBe(false);
    expect(() => {
      (error as unknown as { code: string }).code = "y";
    }).toThrow(TypeError);
  });

  test("the class and its prototype are frozen too (script reads them)", () => {
    expect(Object.isFrozen(AppError)).toBe(true);
    expect(Object.isFrozen(AppError.prototype)).toBe(true);
  });

  test("an unknown category, or no object, is a TypeError", () => {
    expect(() => new AppError({ category: "oops" as AppErrorCategory })).toThrow(/Unknown AppError category 'oops'/);
    expect(() => new (AppError as unknown as new (x: unknown) => AppError)("text")).toThrow(TypeError);
  });

  test("toJSON: the fields that are there, the cause summarized", () => {
    const cause = new TypeError("inner");
    const error = new AppError({ code: "c", category: "server", message: "m", correlationId: "abc", data: { k: 1 }, cause, status: 503 });
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "AppError",
      code: "c",
      category: "server",
      retryable: true,
      message: "m",
      correlationId: "abc",
      data: { k: 1 },
      status: 503,
      cause: { name: "TypeError", message: "inner" },
    });
  });

  test("withFields: a new frozen error; the original is unchanged", () => {
    const error = new AppError({ code: "c", category: "server", message: "m" });
    const copy = withFields(error, { attempts: 3 });
    expect([copy.attempts, copy.code, error.attempts, Object.isFrozen(copy)]).toEqual([3, "c", undefined, true]);
  });
});

describe("AppError.from", () => {
  test.each<[string, unknown, Partial<AppError>]>([
    ["an Error", new Error("bad"), { code: "unknown", category: "internal", message: "bad" }],
    ["a TypeError", new TypeError("x is undefined"), { code: "unknown", category: "internal", message: "x is undefined" }],
    ["a string", "plain text", { code: "unknown", category: "internal", message: "plain text" }],
    ["a number", 42, { code: "unknown", category: "internal", message: "42" }],
    ["an object", { a: 1 }, { code: "unknown", category: "internal", message: "[object Object]" }],
    ["undefined", undefined, { code: "unknown", category: "internal", message: "Unknown error" }],
  ])("%s → internal/unknown", (_, value, expected) => {
    const error = AppError.from(value);
    expect(error).toMatchObject(expected);
    expect(error.cause).toBe(value);
  });

  test("an AppError is returned as it is", () => {
    const error = new AppError({ code: "mine", category: "validation" });
    expect(AppError.from(error)).toBe(error);
  });
});

describe("data errors are AppErrors", () => {
  const where = { method: "GET", url: "http://x/api" };

  test("httpError: step 20's fields, XMLUI's data, the correlation id", () => {
    const error = httpError(where, 503, "Service Unavailable", { message: "Down" }, 2000, "corr-1");
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "http-503", category: "server", status: 503, body: { message: "Down" }, retryAfterMs: 2000, correlationId: "corr-1", message: "Down" });
    expect(error.data).toEqual({ statusCode: 503, response: { message: "Down" }, retryAfterMs: 2000 });
  });

  test("toDataError: a thrown value as internal, with the request; withAttempts", () => {
    const error = toDataError(new Error("transform"), where);
    expect(error).toMatchObject({ code: "internal", category: "internal", message: "transform", method: "GET" });
    expect(withAttempts(error, 2).attempts).toBe(2);
    expect(withAttempts(withAttempts(error, 2), 2)).toEqual(withAttempts(error, 2));
  });
});
