import { expect, test } from "vitest";
import * as components from "../src/index";
import { componentMetadata } from "../src/metadata";

test("components package loads", () => {
  expect(typeof components.Text).toBe("function");
});

test("every component has metadata, and the metadata entry point loads on its own", () => {
  expect(Object.keys(componentMetadata).sort()).toEqual(["App", "Button", "Items", "Stack", "Text", "TextBox"]);
  for (const name of Object.keys(componentMetadata)) expect(typeof (components as Record<string, unknown>)[name], name).toBe("function");
});

test("every built-in prop declares its value type (contracts, step 15)", () => {
  for (const [name, metadata] of Object.entries(componentMetadata)) {
    for (const [prop, contract] of Object.entries(metadata.props)) {
      expect(contract.valueType, `${name}.${prop}`).toBeDefined();
    }
  }
});
