import { afterEach, describe, expect, test } from "vitest";
import { answerConfirm, confirm, confirmQueue, removeToast, resetOverlayState, toast, toasts } from "../../src/render/overlay-state";

afterEach(resetOverlayState);

describe("toast (step 27)", () => {
  test.each<[name: string, call: () => string, expected: Record<string, unknown>]>([
    ["toast(msg): neutral, 4 s", () => toast("Hi"), { kind: "default", message: "Hi", duration: 4000, position: undefined }],
    ["toast.success: 2 s", () => toast.success("Saved"), { kind: "success", duration: 2000 }],
    ["toast.error: 4 s", () => toast.error("Failed"), { kind: "error", duration: 4000 }],
    ["toast.loading: until removed", () => toast.loading("Working"), { kind: "loading", duration: false }],
    ["duration and position options", () => toast("x", { duration: 500, position: "top-left" }), { duration: 500, position: "top-left" }],
    ["an unknown position and a bad duration fall back", () => toast("x", { duration: -1, position: "middle" }), { duration: 4000, position: undefined }],
    ["a non-string message is shown as text", () => toast(42), { message: "42" }],
  ])("%s", (_name, call, expected) => {
    const id = call();
    expect(toasts.get().find((t) => t.id === id)).toMatchObject(expected);
  });

  test("each call returns its id; toast.remove(id) removes it", () => {
    const a = toast("a");
    const b = toast.loading("b");
    expect(a).not.toBe(b);
    expect(toasts.get().map((t) => t.message)).toEqual(["a", "b"]);
    toast.remove(b);
    expect(toasts.get().map((t) => t.message)).toEqual(["a"]);
    removeToast("unknown");
    expect(toasts.get()).toHaveLength(1);
  });

  test("a fixed id replaces the toast with that id (a loading toast becomes a success)", () => {
    toast.loading("Uploading", { id: "up" });
    const before = toasts.get()[0]!.version;
    expect(toast.success("Uploaded", { id: "up" })).toBe("up");
    expect(toasts.get()).toHaveLength(1);
    expect(toasts.get()[0]).toMatchObject({ id: "up", kind: "success", message: "Uploaded" });
    expect(toasts.get()[0]!.version).toBeGreaterThan(before);
  });

  test("the global is frozen data for script", () => {
    expect(Object.isFrozen(toast)).toBe(true);
    expect(Object.isFrozen(toasts.get()[0] ?? Object.freeze({}))).toBe(true);
  });
});

describe("confirm (step 27)", () => {
  test("positional arguments, XMLUI's defaults", () => {
    void confirm("Delete", "Sure?", "Delete");
    expect(confirmQueue.get()[0]).toMatchObject({ title: "Delete", message: "Sure?", actionLabel: "Delete", cancelLabel: "Cancel", width: undefined, actionThemeColor: "attention" });
    void confirm();
    expect(confirmQueue.get()[1]).toMatchObject({ title: "Confirm Operation", message: "Are you sure you want to perform this operation?", actionLabel: "Yes" });
  });

  test("an options object", () => {
    void confirm({ title: "T", message: "M", width: "400px", actionThemeColor: "primary" });
    expect(confirmQueue.get()[0]).toMatchObject({ title: "T", message: "M", width: "400px", actionThemeColor: "primary" });
  });

  test("answers resolve the promise in order; a second confirmation waits for the first", async () => {
    const first = confirm("one");
    const second = confirm("two");
    expect(confirmQueue.get().map((r) => r.title)).toEqual(["one", "two"]);
    answerConfirm(confirmQueue.get()[0]!.id, true);
    expect(confirmQueue.get().map((r) => r.title)).toEqual(["two"]);
    answerConfirm(confirmQueue.get()[0]!.id, false);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(confirmQueue.get()).toEqual([]);
  });

  test("a reset resolves what is pending with false", async () => {
    const p = confirm("x");
    resetOverlayState();
    await expect(p).resolves.toBe(false);
  });
});
