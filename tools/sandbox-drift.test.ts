// The sandbox lives in two places: the compiler resolves names against its
// tables (packages/compiler/src/codegen/names.ts); the runtime builds the
// objects compiled code reads (packages/runtime/src/script/sandbox.ts).
// This test keeps them in agreement.
import { expect, test } from "vitest";
import {
  ALLOWED_GLOBALS,
  APP_GLOBALS,
  BANNED_MEMBERS as COMPILER_BANNED_MEMBERS,
  CONSTRUCTIBLE,
  RESTRICTED_GLOBAL_MEMBERS,
} from "../packages/compiler/src/index";
import { APP_GLOBAL_NAMES } from "../packages/runtime/src/render/app-global-names";
import { BANNED_MEMBERS as RUNTIME_BANNED_MEMBERS, scriptGlobals } from "../packages/runtime/src/script/sandbox";

const LITERALS = new Set(["undefined", "NaN", "Infinity"]);

test("every allowed global exists in the runtime's globals object, and nothing else", () => {
  const expected = [...ALLOWED_GLOBALS].filter((name) => !LITERALS.has(name)).sort();
  expect(Object.keys(scriptGlobals).sort()).toEqual(expected);
});

test("banned member names agree", () => {
  expect([...RUNTIME_BANNED_MEMBERS].sort()).toEqual([...COMPILER_BANNED_MEMBERS].sort());
});

test("members the compiler reports as unavailable are really absent", () => {
  for (const [global, members] of RESTRICTED_GLOBAL_MEMBERS) {
    const object = scriptGlobals[global] as Record<string, unknown>;
    for (const member of members) expect(object[member], `${global}.${member}`).toBeUndefined();
  }
});

test("every constructible path is a constructor in the globals object", () => {
  for (const path of CONSTRUCTIBLE) {
    const value = path.split(".").reduce<unknown>((o, key) => (o as Record<string, unknown>)?.[key], scriptGlobals);
    expect(typeof value, path).toBe("function");
  }
});

test("app global names agree (compiler APP_GLOBALS, runtime APP_GLOBAL_NAMES)", () => {
  expect([...APP_GLOBALS].sort()).toEqual([...APP_GLOBAL_NAMES].sort());
});
