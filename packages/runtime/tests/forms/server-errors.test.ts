// Step 22B: a failed submit's validation problem (after XMLUI's
// server-error-mapping.ts) and how the store applies it.
import { describe, expect, test } from "vitest";
import { httpError } from "../../src/data/errors";
import { extractServerProblem } from "../../src/forms/server-errors";
import { DEFAULT_FIELD_OPTIONS, FormStore } from "../../src/forms/store";

/** The problem as "name: message (severity)" lines, plus the detail. */
const lines = (error: unknown) => {
  const problem = extractServerProblem(error);
  if (!problem) return undefined;
  return [...problem.fields.map((f) => `${f.name}: ${f.message} (${f.severity})`), ...(problem.detail !== undefined ? [`detail: ${problem.detail}`] : [])];
};

describe("extractServerProblem", () => {
  test.each<[label: string, error: unknown, expected: string[] | undefined]>([
    [
      "RFC 7807 invalid-params",
      { type: "about:blank", status: 422, detail: "Invalid user", "invalid-params": [{ name: "email", reason: "Taken" }, { name: "address.city", detail: "Unknown city" }] },
      ["email: Taken (error)", "address.city: Unknown city (error)", "detail: Invalid user"],
    ],
    ["RFC 7807 camelCase invalidParams", { invalidParams: [{ name: "a", reason: "Bad" }] }, ["a: Bad (error)"]],
    ["Spring errors array", { errors: [{ field: "name", defaultMessage: "Required" }, { objectName: "user", message: "Bad user" }] }, ["name: Required (error)", "user: Bad user (error)"]],
    ["Laravel errors object (the first message)", { message: "The given data was invalid.", errors: { email: ["Taken", "Also bad"], name: "Required" } }, ["email: Taken (error)", "name: Required (error)", "detail: The given data was invalid."]],
    ["XMLUI legacy details.issues", { details: { issues: [{ field: "a", message: "Soft", severity: "warn" }, { field: "b", message: "Hard" }] } }, ["a: Soft (warning)", "b: Hard (error)"]],
    ["legacy top-level issues", { issues: [{ field: "a", message: "M", severity: "warning" }] }, ["a: M (warning)"]],
    ["entries without a name or a message are skipped", { "invalid-params": [{ name: "a" }, { reason: "x" }, { name: "b", reason: "ok" }] }, ["b: ok (error)"]],
    ["only unusable entries: not recognized", { "invalid-params": [{ name: "a" }] }, undefined],
    ["RFC 7807 wins over errors in the same payload", { "invalid-params": [{ name: "a", reason: "R" }], errors: { b: ["L"] } }, ["a: R (error)"]],
    ["a plain message is no problem", { message: "Server exploded" }, undefined],
    ["an Error is no problem", new Error("boom"), undefined],
    ["not an object", "nope", undefined],
    ["found in response.data (axios)", { response: { data: { errors: { a: ["X"] } } } }, ["a: X (error)"]],
  ])("%s", (_, error, expected) => {
    expect(lines(error)).toEqual(expected);
  });

  test("a DataError: found in its body", () => {
    const error = httpError({ method: "PUT", url: "/api/users/1" }, 422, "Unprocessable", { title: "Invalid", "invalid-params": [{ name: "name", reason: "Required" }] });
    expect(lines(error)).toEqual(["name: Required (error)"]);
  });
});

describe("FormStore.applySubmitError", () => {
  const store = () => {
    const form = new FormStore({ email: "a@b.c", address: { city: "X" } });
    for (const path of ["email", "address.city"]) form.createField({ ...DEFAULT_FIELD_OPTIONS, path }).attach();
    return form;
  };
  const messages = (form: FormStore, path: string) => form.fields.peek().find((f) => f.options.peek().path === path)!.results.peek().map((r) => r.message);

  test("names of bound inputs go to them (nested paths too); others to the summary; the detail when nothing else did", () => {
    const form = store();
    form.applySubmitError({ detail: "Invalid", "invalid-params": [{ name: "email", reason: "Taken" }, { name: "address.city", reason: "Unknown" }] });
    expect(messages(form, "email")).toEqual(["Taken"]);
    expect(messages(form, "address.city")).toEqual(["Unknown"]);
    expect(form.generalErrors.get()).toEqual(["Invalid"]);
    expect(form.firstServerInvalid()?.options.peek().path).toBe("email");
    form.applySubmitError({ detail: "Invalid", "invalid-params": [{ name: "zip", reason: "Required" }] });
    expect(form.generalErrors.get()).toEqual(["zip: Required"]);
    expect(messages(form, "email")).toEqual([]);
  });

  test("an unrecognized error: its message, or the default", () => {
    const form = store();
    form.applySubmitError(new Error("Server exploded"));
    expect(form.generalErrors.get()).toEqual(["Server exploded"]);
    form.applySubmitError(undefined);
    expect(form.generalErrors.get()).toEqual(["Couldn't save the form."]);
  });

  test("an edit clears that input's server errors only; reset clears all; they block validate()", async () => {
    const form = store();
    form.applySubmitError({ "invalid-params": [{ name: "email", reason: "Taken" }, { name: "address.city", reason: "Unknown" }] });
    expect((await form.validate()).isValid).toBe(false);
    form.setValue(["address", "city"], "Y");
    expect(messages(form, "address.city")).toEqual([]);
    expect(messages(form, "email")).toEqual(["Taken"]);
    form.reset();
    expect(messages(form, "email")).toEqual([]);
    expect((await form.validate()).isValid).toBe(true);
  });

  test("loading disables the form", () => {
    const form = new FormStore({});
    form.loading.set(true);
    expect(form.enabled.get()).toBe(false);
  });
});
