import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { runtimeInfo } from "../src/index";

test("runtime package loads", () => {
  expect(runtimeInfo.name).toBe("@patchfuil/runtime");
});

test("React 19 renders in the jsdom test environment", () => {
  render(<p>harness works</p>);
  expect(screen.getByText("harness works")).toBeDefined();
});
