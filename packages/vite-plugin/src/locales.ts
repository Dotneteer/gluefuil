// Step 34 (decision B1): locale files, `src/locales/<locale>.json` beside the
// entry. Each is a lazy chunk the runtime loads when its locale becomes active,
// except the app's own locale (App `locale`, else `defaultLocale`, else en),
// which the prerender renders and hydration needs at once: that one is imported
// eagerly. Their messages are checked as ICU MessageFormat at build time.
import { localeFileProblems } from "@gluefuil/compiler";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** A file name that is a locale: `de.json`, `de-AT.json`, `zh-Hant-TW.json`. */
const LOCALE_FILE = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.json$/;

export interface LocaleFile {
  locale: string;
  file: string;
}

/** The locale files beside the entry (`<entry dir>/locales/*.json`). */
export function localeFiles(entry: string): LocaleFile[] {
  const folder = join(dirname(entry), "locales");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((name) => LOCALE_FILE.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ locale: match[1]!, file: join(folder, match[0]) }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

/** The app's own locale, read from the entry's root App: `locale`, else `defaultLocale`, else en. */
export function appLocaleOf(source: string): string {
  const app = /<App\b([^>]*)>/.exec(source)?.[1] ?? "";
  const literal = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([A-Za-z0-9-]+)"`).exec(app)?.[1];
  return literal("locale") ?? literal("defaultLocale") ?? "en";
}

export interface LocaleFileProblem {
  file: string;
  message: string;
}

/** Each file's messages that aren't valid JSON or ICU MessageFormat. */
export function localeFileErrors(files: readonly LocaleFile[]): LocaleFileProblem[] {
  const problems: LocaleFileProblem[] = [];
  for (const { file } of files) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      problems.push({ file, message: `${basename(file)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    for (const { key, problem } of localeFileProblems(json)) {
      problems.push({ file, message: `${basename(file)}: the message '${key}' is not valid ICU MessageFormat: ${problem}` });
    }
  }
  return problems;
}

/**
 * The code appended to the entry module: the app's locale (and its language's
 * file) registered at once, every other file as a loader of a lazy chunk.
 */
export function localeRegistrationCode(files: readonly LocaleFile[], appLocale: string, specifier: (file: string) => string): string {
  if (files.length === 0) return "";
  const eager = new Set([appLocale, appLocale.split("-")[0]]);
  const lines = ['import { registerBundle as $$registerBundle, registerLocaleLoader as $$registerLocaleLoader } from "@gluefuil/runtime";'];
  files.forEach(({ locale, file }, index) => {
    const path = JSON.stringify(specifier(file));
    if (eager.has(locale)) {
      lines.push(`import $$locale${index} from ${path};`, `$$registerBundle(${JSON.stringify(locale)}, $$locale${index});`);
    } else {
      lines.push(`$$registerLocaleLoader(${JSON.stringify(locale)}, () => import(${path}));`);
    }
  });
  return `\n// Step 34: the locale files (src/locales).\n${lines.join("\n")}\n`;
}
