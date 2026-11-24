// Step 22: the validation rules (after XMLUI's FormItem/Validations.ts), the
// onValidate result shapes, the display timing, and field paths. Tables.
import { describe, expect, test } from "vitest";
import { INITIAL_FLAGS, isShown, type InteractionFlags, type ValidationMode } from "../../src/forms/display";
import { deleteAt, getAt, parseFieldPath, setAt } from "../../src/forms/paths";
import { customResults, highestSeverity, isEmptyValue, parseRegex, validateRules, type FieldRules } from "../../src/forms/rules";

/** The invalid results as "severity: message". */
const invalid = (value: unknown, rules: FieldRules) =>
  validateRules(value, rules)
    .filter((r) => !r.valid)
    .map((r) => `${r.severity}: ${r.message}`);

describe("isEmptyValue (required)", () => {
  test.each<[unknown, boolean]>([
    [undefined, true],
    [null, true],
    ["", true],
    ["   ", true],
    [false, true],
    [[], true],
    [{}, true],
    [0, false],
    ["a", false],
    [true, false],
    [[0], false],
    [{ a: 1 }, false],
  ])("%j → %s", (value, empty) => {
    expect(isEmptyValue(value)).toBe(empty);
  });
});

describe("validateRules", () => {
  test.each<[label: string, value: unknown, rules: FieldRules, expected: string[]]>([
    ["no rules", "x", {}, []],
    ["required, empty", "", { required: true }, ["error: This field is required"]],
    ["required, custom message", null, { required: true, requiredInvalidMessage: "Name, please" }, ["error: Name, please"]],
    ["required fails first: nothing else runs", "", { required: true, minLength: 3, regex: "^x" }, ["error: This field is required"]],
    ["minLength", "ab", { minLength: 3 }, ["error: Input should be at least 3 characters"]],
    ["minLength 1 (singular)", "", { minLength: 1, required: false }, []],
    ["maxLength", "abcd", { maxLength: 3 }, ["error: Input should be up to 3 characters"]],
    ["maxLength 1", "ab", { maxLength: 1 }, ["error: Input should be up to 1 character"]],
    ["both lengths", "a", { minLength: 2, maxLength: 4 }, ["error: Input length should be between 2 and 4"]],
    ["length as a warning", "abcd", { maxLength: 3, lengthInvalidSeverity: "warning" }, ["warning: Input should be up to 3 characters"]],
    ["length ignores non-strings", 12345, { maxLength: 3 }, []],
    ["minValue", 2, { minValue: 3 }, ["error: Input should be at least 3"]],
    ["minValue, a numeric string", "5", { minValue: 3 }, []],
    ["maxValue", 10, { maxValue: 3 }, ["error: Input should be at most 3"]],
    ["range", 0, { minValue: 1, maxValue: 5, rangeInvalidMessage: "1 to 5" }, ["error: 1 to 5"]],
    ["range: an empty value passes (XMLUI fails it)", "", { minValue: 3 }, []],
    ["range: not a number", "abc", { minValue: 3 }, ["error: Input should be at least 3"]],
    ["range: every array item", [1, 9], { minValue: 0, maxValue: 5 }, ["error: Input should be between 0 and 5"]],
    ["pattern email", "nope", { pattern: "email" }, ["error: Not a valid email address"]],
    ["pattern email ok", "a@b.c", { pattern: "email" }, []],
    ["pattern url", "ftp://x", { pattern: "url" }, ["error: Not a valid URL"]],
    ["pattern url ok", "https://example.com", { pattern: "url" }, []],
    ["pattern phone", "abc", { pattern: "phone" }, ["error: Not a valid phone number"]],
    ["pattern phone ok", "+36 (1) 234".replace(/ /g, ""), { pattern: "phone" }, []],
    ["pattern: empty passes", "", { pattern: "email" }, []],
    ["pattern: unknown name is ignored", "x", { pattern: "zip" }, []],
    ["regex", "12a", { regex: "^\\d+$" }, ["error: Input is not in the correct format"]],
    ["regex with flags", "ABC", { regex: "/^abc$/i" }, []],
    ["regex: empty passes", "", { regex: "^\\d+$" }, []],
    ["regex: invalid expression fails", "a", { regex: "(" }, ["error: Input is not in the correct format"]],
    ["regex as a warning", "x", { regex: "^\\d$", regexInvalidSeverity: "warning", regexInvalidMessage: "Digits" }, ["warning: Digits"]],
    ["matchValue", "a", { matchValue: "b" }, ["error: Input does not match"]],
    ["matchValue ok", "b", { matchValue: "b" }, []],
    ["several at once, in order", "abcdef", { maxLength: 3, regex: "^\\d+$", lengthInvalidSeverity: "warning" }, ["warning: Input should be up to 3 characters", "error: Input is not in the correct format"]],
  ])("%s", (_, value, rules, expected) => {
    expect(invalid(value, rules)).toEqual(expected);
  });

  test("valid results are kept (a rule that passed)", () => {
    expect(validateRules("abc", { minLength: 2 })).toEqual([{ rule: "length", valid: true, severity: "error", message: "Input should be at least 2 characters" }]);
  });

  test("parseRegex: delimiters and flags (g and y dropped: test() must not keep state)", () => {
    expect(parseRegex("/a/gi").flags).toBe("i");
    expect(parseRegex("#a#m").source).toBe("a");
    expect(parseRegex("a/b").source).toBe("a\\/b");
  });
});

describe("customResults (onValidate's answer)", () => {
  test.each<[unknown, string[]]>([
    [null, []],
    [undefined, []],
    [true, []],
    ["", []],
    [false, ["error: Invalid input"]],
    ["Taken", ["error: Taken"]],
    [{ isValid: false, invalidMessage: "Weak", severity: "warning" }, ["warning: Weak"]],
    [{ isValid: false }, ["error: Invalid input"]],
    [{ isValid: true, invalidMessage: "fine" }, []],
    [["A", { isValid: false, invalidMessage: "B", severity: "warning" }, null], ["error: A", "warning: B"]],
    [42, []],
  ])("%j", (raw, expected) => {
    expect(customResults(raw).filter((r) => !r.valid).map((r) => `${r.severity}: ${r.message}`)).toEqual(expected);
  });

  test("highestSeverity", () => {
    expect(highestSeverity([])).toBe("none");
    expect(highestSeverity(customResults({ isValid: false, severity: "warning" }))).toBe("warning");
    expect(highestSeverity([...customResults({ isValid: false, severity: "warning" }), ...customResults("x")])).toBe("error");
  });
});

describe("isShown (when results show)", () => {
  const flags = (change: Partial<InteractionFlags>): InteractionFlags => ({ ...INITIAL_FLAGS, ...change });
  test.each<[mode: ValidationMode, label: string, change: Partial<InteractionFlags>, shown: boolean]>([
    ["errorLate", "untouched", {}, false],
    ["errorLate", "typing the first time (dirty, focused, never blurred)", { dirty: true, focused: true }, false],
    ["errorLate", "blurred invalid", { dirty: true, validOnBlur: false }, true],
    ["errorLate", "blurred valid", { dirty: true, validOnBlur: true }, false],
    ["errorLate", "focused again after a dirty blur, invalid on focus", { dirty: true, focused: true, afterFirstDirtyBlur: true }, true],
    ["errorLate", "… then turned valid while typing", { dirty: true, focused: true, afterFirstDirtyBlur: true, invalidToValid: true }, false],
    ["errorLate", "focused again, valid on focus", { dirty: true, focused: true, afterFirstDirtyBlur: true, validOnFocus: true }, false],
    ["errorLate", "a submit attempt, untouched", { forceShow: true }, true],
    ["onChanged", "untouched", {}, false],
    ["onChanged", "dirty and focused", { dirty: true, focused: true }, true],
    ["onLostFocus", "dirty and focused", { dirty: true, focused: true }, false],
    ["onLostFocus", "dirty, blurred invalid", { dirty: true }, true],
    ["onLostFocus", "dirty, blurred valid", { dirty: true, validOnBlur: true }, false],
    ["onLostFocus", "a submit attempt", { forceShow: true }, true],
  ])("%s: %s → %s", (mode, _, change, shown) => {
    expect(isShown(mode, flags(change))).toBe(shown);
  });
});

describe("field paths", () => {
  test.each<[string, (string | number)[]]>([
    ["name", ["name"]],
    ["address.city", ["address", "city"]],
    ["items[0].x", ["items", 0, "x"]],
    ["grid[1][2]", ["grid", 1, 2]],
  ])("parseFieldPath(%s)", (path, keys) => {
    expect(parseFieldPath(path)).toEqual(keys);
  });

  test("getAt tolerates missing parts", () => {
    expect(getAt({ a: { b: 1 } }, ["a", "b"])).toBe(1);
    expect(getAt({ a: null }, ["a", "b"])).toBeUndefined();
    expect(getAt(undefined, ["a"])).toBeUndefined();
  });

  test("setAt copies along the path, shares the rest, and creates objects and arrays", () => {
    const root = Object.freeze({ a: Object.freeze({ b: 1 }), c: Object.freeze({ d: 2 }) });
    const next = setAt(root, ["a", "b"], 3) as typeof root;
    expect(next).toEqual({ a: { b: 3 }, c: { d: 2 } });
    expect(next.c).toBe(root.c);
    expect(setAt({}, ["items", 0, "x"], 1)).toEqual({ items: [{ x: 1 }] });
  });

  test("deleteAt removes a nested key; a missing one changes nothing", () => {
    const root = { a: { b: 1, c: 2 } };
    expect(deleteAt(root, ["a", "b"])).toEqual({ a: { c: 2 } });
    expect(deleteAt(root, ["x", "y"])).toBe(root);
  });
});
