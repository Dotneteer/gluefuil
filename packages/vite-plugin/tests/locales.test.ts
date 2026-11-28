// Step 34: locale files (src/locales/*.json), the app's own locale, their ICU
// checks and the code the entry gets; `<html lang dir>` from the prerender.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { appLocaleOf, localeFileErrors, localeFiles, localeRegistrationCode } from "../src/locales";
import { injectDocumentAttributes } from "../src/prerender";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "gfui-locales-"));
  mkdirSync(join(root, "src", "locales"), { recursive: true });
  writeFileSync(join(root, "src", "Main.gui"), "<App/>");
  writeFileSync(join(root, "src", "locales", "en.json"), JSON.stringify({ hi: "Hi {name}" }));
  writeFileSync(join(root, "src", "locales", "de-AT.json"), JSON.stringify({ hi: "Servus {name}", form: { save: "Speichern {" } }));
  writeFileSync(join(root, "src", "locales", "fr.json"), "{ not json");
  writeFileSync(join(root, "src", "locales", "notes.md"), "not a locale");
  writeFileSync(join(root, "src", "locales", "messages.json"), "{}");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("locale files", () => {
  test("the *.json files named by a locale, sorted; others ignored", () => {
    expect(localeFiles(join(root, "src", "Main.gui")).map((f) => f.locale)).toEqual(["de-AT", "en", "fr"]);
    expect(localeFiles(join(root, "elsewhere", "Main.gui"))).toEqual([]);
  });

  test("invalid JSON and invalid ICU messages are reported per file and key", () => {
    const messages = localeFileErrors(localeFiles(join(root, "src", "Main.gui"))).map((p) => p.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe("de-AT.json: the message 'form.save' is not valid ICU MessageFormat: expect argument closing brace");
    expect(messages[1]).toMatch(/^fr\.json is not valid JSON/);
  });

  test.each<[string, string]>([
    ["<App/>", "en"],
    ['<App defaultLocale="de">', "de"],
    ['<App defaultLocale="de" locale="fr-CA" name="x">', "fr-CA"],
    ['<App locale="{lang}">', "en"],
  ])("the app's own locale of %s: %s", (source, locale) => {
    expect(appLocaleOf(source)).toBe(locale);
  });

  test("the entry code: the app's locale and its language eagerly, the rest as lazy loaders", () => {
    const files = [
      { locale: "de", file: "/app/src/locales/de.json" },
      { locale: "de-AT", file: "/app/src/locales/de-AT.json" },
      { locale: "fr", file: "/app/src/locales/fr.json" },
    ];
    const code = localeRegistrationCode(files, "de-AT", (f) => `./locales/${f.split("/").pop()}`);
    expect(code).toContain('import $$locale0 from "./locales/de.json";');
    expect(code).toContain('$$registerBundle("de-AT", $$locale1);');
    expect(code).toContain('$$registerLocaleLoader("fr", () => import("./locales/fr.json"));');
    expect(localeRegistrationCode([], "en", (f) => f)).toBe("");
  });
});

describe("<html lang dir>", () => {
  test.each<[string, string]>([
    ['<!doctype html>\n<html lang="en">\n<head>', '<!doctype html>\n<html lang="ar" dir="rtl">\n<head>'],
    ["<html>", '<html lang="ar" dir="rtl">'],
    ['<html class="x" dir=ltr data-a="1">', '<html class="x" data-a="1" lang="ar" dir="rtl">'],
  ])("%j", (html, expected) => {
    expect(injectDocumentAttributes(html, { lang: "ar", dir: "rtl" })).toBe(expected);
  });
});
