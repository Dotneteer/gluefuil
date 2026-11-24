// Step 22: the form store: values by path, dirty tracking, fields and their
// display, custom checks, validate(), reset.
import { afterEach, beforeEach, expect, test } from "vitest";
import { setErrorReporter } from "../../src/errors";
import { DEFAULT_FIELD_OPTIONS, FormStore, type FieldOptions } from "../../src/forms/store";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  restore = setErrorReporter((error) => errors.push(error));
});
afterEach(() => restore());

const options = (path: string, change: Partial<FieldOptions> = {}): FieldOptions => ({ ...DEFAULT_FIELD_OPTIONS, path, ...change });
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("data is copied, frozen and written by path; a field reads its path", () => {
  const data = { name: "Ann", address: { city: "Oslo" } };
  const store = new FormStore(data);
  const city = store.createField(options("address.city"));
  city.attach();
  expect(city.value.get()).toBe("Oslo");
  city.change("Paris");
  expect(store.getData()).toEqual({ name: "Ann", address: { city: "Paris" } });
  expect(data.address.city).toBe("Oslo");
  expect(Object.isFrozen(store.values.get())).toBe(true);
});

test("an initial value fills a missing path when the field attaches, without making it dirty", () => {
  const store = new FormStore({});
  const role = store.createField(options("role"));
  role.setInitial("user");
  expect(role.value.get()).toBe("user");
  expect(store.getData()).toEqual({});
  role.attach();
  expect(store.getData()).toEqual({ role: "user" });
  expect(store.dirty.get()).toBe(false);
});

test("dirty: a change marks the form and the fields at the path; setDirty(false) and markClean clear it", () => {
  const store = new FormStore({ a: 1 });
  const first = store.createField(options("a"));
  const second = store.createField(options("a"));
  first.attach();
  second.attach();
  first.change(2);
  expect(store.dirty.get()).toBe(true);
  expect(second.flags.get().dirty).toBe(true);
  store.setDirty(false);
  expect(store.dirty.get()).toBe(false);
  store.update({ a: 3 });
  expect(store.dirty.get()).toBe(true);
  store.markClean();
  expect(store.dirty.get()).toBe(false);
});

test("noSubmit fields are left out of $data and getData(), not of getAllData()", () => {
  const store = new FormStore({ a: 1, secret: { pin: 2, other: 3 } });
  store.createField(options("secret.pin", { noSubmit: true })).attach();
  expect(store.data.get()).toEqual({ a: 1, secret: { other: 3 } });
  expect(store.getData()).toEqual({ a: 1, secret: { other: 3 } });
  expect(store.getAllData()).toEqual({ a: 1, secret: { pin: 2, other: 3 } });
});

test("errorLate display through focus, typing and blur", () => {
  const store = new FormStore({ name: "" });
  const name = store.createField(options("name", { rules: { minLength: 3 } }));
  name.attach();
  name.focus();
  name.change("a");
  expect(name.shown.get()).toBe(false);
  name.blur();
  expect(name.shown.get()).toBe(true);
  name.focus();
  name.change("abc");
  expect(name.shown.get()).toBe(false);
});

test("showAll forces the display until the field is edited", () => {
  const store = new FormStore({});
  const name = store.createField(options("name", { rules: { required: true } }));
  name.attach();
  store.showAll();
  expect(name.shown.get()).toBe(true);
  name.focus();
  name.change("");
  expect(name.shown.get()).toBe(false);
});

test("a custom check: debounced, stale results marked, the latest wins", async () => {
  const store = new FormStore({ user: "" });
  const calls: unknown[] = [];
  const user = store.createField(
    options("user", {
      debounceMs: 5,
      validate: async (value) => {
        calls.push(value);
        await tick(5);
        return value === "taken" ? "Taken" : null;
      },
    }),
  );
  user.attach();
  user.change("t");
  user.change("taken");
  expect(user.pending.get()).toBe(true);
  await tick(30);
  expect(calls).toEqual(["taken"]);
  expect(user.results.get().map((r) => r.message)).toEqual(["Taken"]);
  user.change("taken!");
  expect(user.results.get().map((r) => [r.message, r.stale === true])).toEqual([["Taken", true]]);
  await tick(30);
  expect(user.results.get()).toEqual([]);
});

test("a custom check that throws is an error result, reported; the field is not stuck pending", async () => {
  const store = new FormStore({ x: "" });
  const x = store.createField(
    options("x", {
      validate: () => {
        throw new Error("boom");
      },
    }),
  );
  x.attach();
  x.change("1");
  await tick();
  expect(x.pending.get()).toBe(false);
  expect(x.results.get().map((r) => `${r.severity}: ${r.message}`)).toEqual(["error: The check failed: boom"]);
  expect(errors).toEqual([new Error("boom")]);
});

test("validate() waits for pending checks, checks unchecked values, and summarizes by path", async () => {
  const store = new FormStore({ a: "", b: "x" });
  store.createField(options("a", { rules: { required: true } })).attach();
  store.createField(options("b", { validate: async () => (await tick(10), { isValid: false, invalidMessage: "Soft", severity: "warning" }) })).attach();
  const summary = await store.validate();
  expect(summary).toEqual({ isValid: false, errors: { a: ["This field is required"] }, warnings: { b: ["Soft"] }, data: { a: "", b: "x" } });
  expect(store.firstInvalid()?.options.get().path).toBe("a");
});

test("reset(): back to the baseline (or new data), flags cleared, initial values written again", () => {
  const store = new FormStore({ name: "Ann" });
  const name = store.createField(options("name"));
  const role = store.createField(options("role"));
  role.setInitial("user");
  name.attach();
  role.attach();
  name.change("Bob");
  role.change("admin");
  store.reset();
  expect(store.getData()).toEqual({ name: "Ann", role: "user" });
  expect(store.dirty.get()).toBe(false);
  store.reset({ name: "Cy" });
  expect(store.getData()).toEqual({ name: "Cy", role: "user" });
  store.reset("not an object");
  expect(store.getData()).toEqual({ name: "Cy", role: "user" });
  store.clear();
  expect(store.getData()).toEqual({ role: "user" });
});

test("detach keeps the value; enabled follows the prop and submitting", () => {
  const store = new FormStore({ a: 1 });
  const a = store.createField(options("a"));
  a.attach();
  a.detach();
  expect(store.fields.get()).toEqual([]);
  expect(store.getData()).toEqual({ a: 1 });
  expect(store.enabled.get()).toBe(true);
  store.submitting.set(true);
  expect(store.enabled.get()).toBe(false);
});

test("leaving an input while its async check runs: the result shows when it settles (errorLate)", async () => {
  const store = new FormStore({ email: "" });
  const email = store.createField(options("email", { validate: async (value) => (await tick(10), value === "taken" ? "Already registered" : null) }));
  email.attach();
  email.focus();
  email.change("taken");
  email.blur();
  expect(email.shown.get()).toBe(false);
  await tick(30);
  expect(email.shown.get()).toBe(true);
  expect(email.results.get().map((r) => r.message)).toEqual(["Already registered"]);
});
