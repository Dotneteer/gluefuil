import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import * as runtime from "../src/index";

test("runtime package loads", () => {
  expect(typeof runtime.signal).toBe("function");
  expect(typeof runtime.loadModule).toBe("function");
});

test("React 19 renders in the jsdom test environment", () => {
  render(<p>harness works</p>);
  expect(screen.getByText("harness works")).toBeDefined();
});
