// Messages (step 34, decision A1): ICU MessageFormat on intl-messageformat,
// compiled once per locale and pattern. XMLUI's self-closing placeholders
// (`<link/>`) become paired tags first. Every argument and tag a message names
// gets a value (intl-messageformat throws on a missing one): a missing variable
// renders as nothing, a tag without a handler as its text.
import { IntlMessageFormat } from "intl-messageformat";
import { reportDiagnostic } from "../errors";
import { currentLocale, lookupMessage } from "./locale";

/** `<link/>` → `<link></link>` (XMLUI's I18n placeholders, components/I18n/I18n.tsx). */
export function pairSelfClosingTags(pattern: string): string {
  return pattern.replace(/<([A-Za-z][\w-]*)\s*\/>/g, "<$1></$1>");
}

interface Compiled {
  format: IntlMessageFormat;
  args: readonly string[];
  tags: readonly string[];
}

type AstElement = { type: number; value?: string; options?: Record<string, { value: AstElement[] }>; children?: AstElement[] };

/** The argument and tag names of a parsed message (intl-messageformat's TYPE: 1–6 arguments, 8 tag). */
function namesOf(elements: readonly AstElement[], args: Set<string>, tags: Set<string>): void {
  for (const element of elements) {
    if (element.type >= 1 && element.type <= 6 && element.value) args.add(element.value);
    if (element.type === 8 && element.value) tags.add(element.value);
    for (const option of Object.values(element.options ?? {})) namesOf(option.value, args, tags);
    if (element.children) namesOf(element.children, args, tags);
  }
}

const cache = new Map<string, Compiled | Error>();

/** The compiled message (cached); an Error when the pattern isn't valid ICU. */
export function compileMessage(pattern: string, locale: string): Compiled | Error {
  const key = `${locale}\u0000${pattern}`;
  let compiled = cache.get(key);
  if (!compiled) {
    try {
      const format = new IntlMessageFormat(pairSelfClosingTags(pattern), locale);
      const args = new Set<string>();
      const tags = new Set<string>();
      namesOf(format.getAst() as unknown as AstElement[], args, tags);
      compiled = { format, args: [...args], tags: [...tags] };
    } catch (error) {
      compiled = error instanceof Error ? error : new Error(String(error));
    }
    cache.set(key, compiled);
  }
  return compiled;
}

const reported = new Set<string>();
function reportOnce(id: string, message: string): void {
  if (reported.has(id)) return;
  reported.add(id);
  reportDiagnostic(message);
}

/** A tag handler: receives the tag's content (strings, or rendered parts). */
export type TagHandler = (content: unknown[]) => unknown;

/**
 * Formats `pattern` in `locale`. With `tags`, the result may be an array of
 * parts (a handler's return values among strings); without, a string.
 */
export function formatPattern(pattern: string, locale: string, vars?: Record<string, unknown> | null, tags?: Record<string, TagHandler>, id = pattern): string | unknown[] {
  const compiled = compileMessage(pattern, locale);
  if (compiled instanceof Error) {
    reportOnce(`icu\u0000${locale}\u0000${id}`, `i18n: the message '${id}' (${locale}) is not valid ICU: ${compiled.message}`);
    return id;
  }
  const values: Record<string, unknown> = {};
  for (const name of compiled.args) values[name] = vars?.[name];
  for (const name of compiled.tags) values[name] = tags?.[name] ?? ((content: unknown[]) => content.join(""));
  try {
    const result = compiled.format.format(values as Record<string, string>);
    return Array.isArray(result) && result.every((part) => typeof part === "string" || typeof part === "number") ? result.join("") : (result as string | unknown[]);
  } catch (error) {
    reportOnce(`format\u0000${locale}\u0000${id}`, `i18n: the message '${id}' (${locale}) failed to format: ${error instanceof Error ? error.message : String(error)}`);
    return id;
  }
}

/** `App.translate(key, vars)` in `locale`: the message, or the key (a diagnostic) when no bundle has it. */
export function translate(key: unknown, vars?: unknown, locale: string = currentLocale(), tags?: Record<string, TagHandler>): string | unknown[] {
  const id = String(key);
  const pattern = lookupMessage(locale, id);
  if (pattern === undefined) {
    reportOnce(`missing\u0000${locale}\u0000${id}`, `i18n: no message '${id}' for '${locale}'`);
    return id;
  }
  const variables = vars !== null && typeof vars === "object" ? (vars as Record<string, unknown>) : undefined;
  return formatPattern(pattern, locale, variables, tags, id);
}

/** A framework string (`gfui.*`) as text. */
export function text(key: string, vars?: Record<string, unknown>, locale: string = currentLocale()): string {
  const result = translate(key, vars, locale);
  return typeof result === "string" ? result : result.map(String).join("");
}

/** Forgets compiled messages and reported diagnostics (tests). */
export function resetMessageCache(): void {
  cache.clear();
  reported.clear();
}
