import { describe, expect, test } from "vitest";
import { isPointerLike, pointerData } from "../../src/render/pointer";

const rect = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, top, width, height }) });

describe("pointerData (step 27): what pointer handlers receive instead of the DOM event", () => {
  test.each<[name: string, event: unknown, expected: Record<string, unknown>]>([
    ["a mouse click", { clientX: 10, clientY: 20, button: 0, detail: 1 }, { clientX: 10, clientY: 20, button: 0 }],
    ["a right click with modifiers", { clientX: 5, clientY: 6, button: 2, shiftKey: true, metaKey: true }, { button: 2, shiftKey: true, metaKey: true, ctrlKey: false }],
    ["a click synthesized from the keyboard: the element's center", { clientX: 0, clientY: 0, button: 0, detail: 0, currentTarget: rect(100, 50, 20, 10) }, { clientX: 110, clientY: 55, button: -1 }],
    ["a keyboard event (no position)", { key: "Enter", target: rect(0, 0, 40, 40) }, { clientX: 20, clientY: 20, button: -1 }],
    ["nothing at all", undefined, { clientX: 0, clientY: 0, button: -1 }],
  ])("%s", (_name, event, expected) => {
    expect(pointerData(event)).toMatchObject(expected);
  });

  test("plain frozen data: exactly the documented keys, no element, no event", () => {
    const target = rect(0, 0, 1, 1);
    const data = pointerData({ clientX: 1, clientY: 2, button: 0, detail: 1, target, nativeEvent: {} });
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.keys(data)).toEqual(["clientX", "clientY", "button", "shiftKey", "ctrlKey", "altKey", "metaKey"]);
    expect(Object.values(data).every((v) => typeof v === "number" || typeof v === "boolean")).toBe(true);
  });

  test("isPointerLike: a snapshot or any { clientX, clientY }", () => {
    expect(isPointerLike(pointerData({ clientX: 1, clientY: 1 }))).toBe(true);
    expect(isPointerLike({ clientX: 1, clientY: 2 })).toBe(true);
    expect(isPointerLike({ clientX: "1", clientY: 2 })).toBe(false);
    expect(isPointerLike(null)).toBe(false);
  });
});
