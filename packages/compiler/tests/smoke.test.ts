import { expect, test } from "vitest";
import { compilerInfo } from "../src/index";

test("compiler package loads in a DOM-free environment", () => {
  expect(compilerInfo.name).toBe("@patchfuil/compiler");
  expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
});
