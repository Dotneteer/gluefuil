import { expect, test } from "vitest";
import { componentsInfo } from "../src/index";
import { componentMetadata } from "../src/metadata";

test("components package loads and resolves the runtime workspace package", () => {
  expect(componentsInfo.name).toBe("@patchfuil/components");
  expect(componentsInfo.runtime).toBe("@patchfuil/runtime");
});

test("the metadata entry point loads on its own", () => {
  expect(componentMetadata).toEqual({});
});
