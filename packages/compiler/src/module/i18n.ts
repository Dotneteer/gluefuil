// Step 34: ICU MessageFormat checks at build time (decision B1). The runtime
// formats with intl-messageformat; this is its parser, so a message that passes
// here parses there. XMLUI's `<link/>` placeholders are paired first, as the
// runtime does (runtime src/i18n/messages.ts pairSelfClosingTags).
import { parse } from "@formatjs/icu-messageformat-parser";
import type * as ScriptAst from "../script/ast";

/** The problem of an ICU message, or undefined when it parses. */
export function icuProblem(message: string): string | undefined {
  try {
    parse(message.replace(/<([A-Za-z][\w-]*)\s*\/>/g, "<$1></$1>"));
    return undefined;
  } catch (error) {
    const kind = error instanceof Error ? error.message : String(error);
    return kind.toLowerCase().replace(/_/g, " ");
  }
}

export interface MessageProblem {
  /** Offsets of the string literal in the file. */
  start: number;
  end: number;
  locale: string;
  key: string;
  problem: string;
}

const keyOf = (property: ScriptAst.Property): string | undefined => {
  if (property.computed) return undefined;
  const key = property.key;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) return String(key.value);
  return undefined;
};

const stringOf = (node: ScriptAst.Expression): string | undefined => {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
};

/** Flattens nested message objects (`{ form: { save: '…' } }`) to dotted keys with their literals. */
function* messages(object: ScriptAst.ObjectExpression, prefix: string): Generator<[string, ScriptAst.Expression]> {
  for (const property of object.properties) {
    if (property.type !== "Property") continue;
    const key = keyOf(property);
    if (key === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (property.value.type === "ObjectExpression") yield* messages(property.value, path);
    else yield [path, property.value];
  }
}

/**
 * The problems of a literal `localeBundles` object (`{ en: { key: 'message' } }`):
 * each string message that isn't valid ICU. Non-literal parts are skipped.
 */
export function localeBundleProblems(expression: ScriptAst.Expression | null): MessageProblem[] {
  if (!expression || expression.type !== "ObjectExpression") return [];
  const problems: MessageProblem[] = [];
  for (const property of expression.properties) {
    if (property.type !== "Property") continue;
    const locale = keyOf(property);
    if (locale === undefined || property.value.type !== "ObjectExpression") continue;
    for (const [key, node] of messages(property.value, "")) {
      const text = stringOf(node);
      if (text === undefined) continue;
      const problem = icuProblem(text);
      if (problem) problems.push({ start: node.start, end: node.end, locale, key, problem });
    }
  }
  return problems;
}

/** The problems of a locale file's messages (flat or nested), by key. */
export function localeFileProblems(json: unknown, prefix = ""): { key: string; problem: string }[] {
  const problems: { key: string; problem: string }[] = [];
  if (json === null || typeof json !== "object" || Array.isArray(json)) return problems;
  for (const [key, value] of Object.entries(json)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      const problem = icuProblem(value);
      if (problem) problems.push({ key: path, problem });
    } else problems.push(...localeFileProblems(value, path));
  }
  return problems;
}
