// Literal value checks for component contracts (step 15). Only attribute
// values without `{…}` are checked; bound values are known only at runtime.

import type { PropMetadata } from "@gluefuil/components/metadata";

/** Why a literal does not fit the prop's type and enum, or undefined when it fits. */
export function checkLiteral(prop: PropMetadata, text: string): { code: "E022" | "E023"; problem: string } | undefined {
  switch (prop.valueType) {
    case "boolean":
      if (text !== "true" && text !== "false") return { code: "E022", problem: "expected true or false" };
      break;
    case "number":
      if (text.trim() === "" || !Number.isFinite(Number(text))) return { code: "E022", problem: "expected a number" };
      break;
    case "integer":
      if (!/^\s*-?\d+\s*$/.test(text)) return { code: "E022", problem: "expected an integer" };
      break;
    default:
      break;
  }
  if (prop.availableValues && !prop.availableValues.includes(text)) {
    return { code: "E023", problem: `expected one of ${prop.availableValues.map((v) => `'${v}'`).join(", ")}` };
  }
  return undefined;
}
