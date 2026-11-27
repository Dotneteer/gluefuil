// The declarative validation rules of a bound input (step 22), after XMLUI's
// FormItem/Validations.ts. `required` runs first: when it fails, nothing else
// runs. Empty values pass every other rule (XMLUI fails `minValue` for an empty
// value: Number("") is 0; we don't).

export type Severity = "error" | "warning";

export interface FieldRules {
  required?: boolean;
  requiredInvalidMessage?: string;
  minLength?: number;
  maxLength?: number;
  lengthInvalidMessage?: string;
  lengthInvalidSeverity?: Severity;
  minValue?: number;
  maxValue?: number;
  rangeInvalidMessage?: string;
  rangeInvalidSeverity?: Severity;
  /** A built-in pattern: `email`, `url`, `phone`. */
  pattern?: string;
  patternInvalidMessage?: string;
  patternInvalidSeverity?: Severity;
  /** A regular expression: `^\d+$`, or `/^a/i` with flags. */
  regex?: string;
  regexInvalidMessage?: string;
  regexInvalidSeverity?: Severity;
  /** The value must equal this (`Object.is`): password confirmation. */
  matchValue?: unknown;
  matchInvalidMessage?: string;
}

/** One check's outcome. Valid results are kept (a field shows only invalid ones). */
export interface RuleResult {
  rule: string;
  valid: boolean;
  severity: Severity;
  message: string;
  /** From `onValidate`. */
  custom?: boolean;
  /** A custom result for an earlier value, kept while the new check runs. */
  stale?: boolean;
  /** From the server, after a failed submit (step 22B). */
  server?: boolean;
}

/** Empty as XMLUI's `required` sees it: undefined, null, a blank string, false, {} and []. */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return false;
  if (Array.isArray(value)) return value.length === 0;
  // Step 32B: only a plain object is empty without keys; a File (or another platform value) is a value.
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    return (proto === Object.prototype || proto === null) && Object.keys(value).length === 0;
  }
  return false;
}

const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
const PHONE_ALLOWED = /^[a-zA-Z0-9#*)(+.\-_&']+$/;

/** XMLUI's built-in patterns (components-core/forms/builtins: email, url, phone). */
export const PATTERNS: Readonly<Record<string, { test: (value: string) => boolean; message: string }>> = {
  email: { test: (value) => EMAIL.test(value), message: "Not a valid email address" },
  url: {
    test: (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    message: "Not a valid URL",
  },
  phone: { test: (value) => PHONE_ALLOWED.test(value) && /[0-9]/.test(value), message: "Not a valid phone number" },
};

/** `/re/flags` (XMLUI's delimiters / ~ @ ; % # ') or a bare expression. */
export function parseRegex(source: string): RegExp {
  const delimited = /^([/~@;%#'])(.*?)\1([gimsuy]*)$/.exec(source);
  return delimited ? new RegExp(delimited[2]!, delimited[3]!.replace(/[gy]/g, "")) : new RegExp(source);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isBlank = (value: unknown) => value === undefined || value === null || value === "";
const numeric = (value: unknown) => (typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN);

function result(rule: string, valid: boolean, severity: Severity | undefined, message: string): RuleResult {
  return { rule, valid, severity: severity ?? "error", message };
}

/** Runs the rules in XMLUI's order. A rule whose props are absent gives no result. */
export function validateRules(value: unknown, rules: FieldRules): RuleResult[] {
  const results: RuleResult[] = [];
  if (rules.required) {
    const required = result("required", !isEmptyValue(value), "error", rules.requiredInvalidMessage || "This field is required");
    results.push(required);
    if (!required.valid) return results;
  }
  const { minLength, maxLength } = rules;
  if (minLength !== undefined || maxLength !== undefined) {
    const text = typeof value === "string" ? value : undefined;
    const valid = text === undefined || text === "" || ((minLength === undefined || text.length >= minLength) && (maxLength === undefined || text.length <= maxLength));
    const message =
      rules.lengthInvalidMessage ||
      (maxLength === undefined
        ? `Input should be at least ${plural(minLength!, "character")}`
        : minLength === undefined
          ? `Input should be up to ${plural(maxLength, "character")}`
          : `Input length should be between ${minLength} and ${maxLength}`);
    results.push(result("length", valid, rules.lengthInvalidSeverity, message));
  }
  const { minValue, maxValue } = rules;
  if (minValue !== undefined || maxValue !== undefined) {
    const values = Array.isArray(value) ? value : [value];
    const valid = values.every((item) => {
      if (isBlank(item)) return true;
      const n = numeric(item);
      return !Number.isNaN(n) && (minValue === undefined || n >= minValue) && (maxValue === undefined || n <= maxValue);
    });
    const message =
      rules.rangeInvalidMessage ||
      (maxValue === undefined
        ? `Input should be at least ${minValue}`
        : minValue === undefined
          ? `Input should be at most ${maxValue}`
          : `Input should be between ${minValue} and ${maxValue}`);
    results.push(result("range", valid, rules.rangeInvalidSeverity, message));
  }
  if (rules.pattern !== undefined && rules.pattern !== "") {
    const pattern = PATTERNS[rules.pattern];
    if (pattern) {
      const valid = isBlank(value) || (typeof value === "string" && pattern.test(value));
      results.push(result("pattern", valid, rules.patternInvalidSeverity, rules.patternInvalidMessage || pattern.message));
    }
  }
  if (rules.regex !== undefined && rules.regex !== "") {
    let valid = true;
    if (!isBlank(value) && typeof value === "string") {
      try {
        valid = parseRegex(rules.regex).test(value);
      } catch {
        valid = false;
      }
    }
    results.push(result("regex", valid, rules.regexInvalidSeverity, rules.regexInvalidMessage || "Input is not in the correct format"));
  }
  if (rules.matchValue !== undefined) {
    results.push(result("match", Object.is(value, rules.matchValue), "error", rules.matchInvalidMessage || "Input does not match"));
  }
  return results;
}

/**
 * Normalizes what an `onValidate` handler returns (XMLUI's shapes): null or
 * undefined (nothing to say), a string (an error), a boolean (false: "Invalid
 * input"), `{ isValid, invalidMessage, severity }`, or an array of those.
 */
export function customResults(raw: unknown): RuleResult[] {
  if (raw === null || raw === undefined || raw === true || raw === "") return [];
  if (raw === false) return [{ rule: "custom", valid: false, severity: "error", message: "Invalid input", custom: true }];
  if (typeof raw === "string") return [{ rule: "custom", valid: false, severity: "error", message: raw, custom: true }];
  if (Array.isArray(raw)) return raw.flatMap(customResults);
  if (typeof raw === "object") {
    const { isValid, invalidMessage, severity } = raw as { isValid?: unknown; invalidMessage?: unknown; severity?: unknown };
    const valid = isValid !== false;
    return [
      {
        rule: "custom",
        valid,
        severity: severity === "warning" ? "warning" : "error",
        message: typeof invalidMessage === "string" && invalidMessage !== "" ? invalidMessage : valid ? "" : "Invalid input",
        custom: true,
      },
    ];
  }
  return [];
}

/** The most severe invalid result: "error", "warning", or "none". */
export function highestSeverity(results: readonly RuleResult[]): Severity | "none" {
  let highest: Severity | "none" = "none";
  for (const r of results) {
    if (r.valid) continue;
    if (r.severity === "error") return "error";
    highest = "warning";
  }
  return highest;
}
