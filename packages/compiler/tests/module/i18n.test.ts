// Step 34: the compiler's part of internationalization — ICU checks of a literal
// App localeBundles (E041), I18n's props and slots, the `key` prop, Locale's App.
// Design: .ai/plan/poc-34-i18n.md
import { describe, expect, test } from "vitest";
import { compileModule, icuProblem, localeBundleProblems, localeFileProblems, parseExpression } from "../../src/index";

const problems = (markup: string) =>
  compileModule(markup, { sourceMap: false }).diagnostics.map((d) => [d.severity ?? "error", d.code, markup.slice(d.start, d.end)]);
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;

describe("ICU checks", () => {
  test.each<[string, string | undefined]>([
    ["Hello, {name}!", undefined],
    ["{n, plural, one {# item} other {# items}}", undefined],
    ["Accept the <link/>.", undefined],
    ["{v, number, ::currency/EUR}", undefined],
    ["{n, plural, one {x}}", "missing other clause"],
    ["Hello {name", "expect argument closing brace"],
    ["<b>unclosed", "unclosed tag"],
  ])("%j: %s", (message, problem) => {
    expect(icuProblem(message)).toBe(problem);
  });

  test("a literal localeBundles: each invalid message is E041 at its literal", () => {
    const markup = `<App localeBundles="{{ en: { ok: 'Hi {name}', bad: '{n, plural, one {x}}', nested: { worse: 'Hi {name' } }, de: { ok: 'Hallo' } }}"/>`;
    expect(problems(markup)).toEqual([
      ["error", "E041", "'{n, plural, one {x}}'"],
      ["error", "E041", "'Hi {name'"],
    ]);
    expect(compileModule(markup, { sourceMap: false }).diagnostics[1]!.message).toBe("The message 'nested.worse' (en) is not valid ICU MessageFormat: expect argument closing brace");
  });

  test("bindings and non-literal parts are not checked", () => {
    expect(problems(`<App var.b="{{}}" localeBundles="{b}"/>`)).toEqual([]);
    expect(problems(`<App var.m="x" localeBundles="{{ en: { a: m, b: 'ok' } }}"/>`)).toEqual([]);
    expect(localeBundleProblems(parseExpression("{ en: { a: `x {`, b: `ok ${'{'}` } }").expression)).toHaveLength(1);
  });

  test("locale files (the plugin's check): nested keys, by dotted path", () => {
    expect(localeFileProblems({ a: "ok", form: { save: "Save {x", n: 1 } })).toEqual([{ key: "form.save", problem: "expect argument closing brace" }]);
  });
});

describe("I18n and Locale", () => {
  test("any prop is a variable; key goes as $$propKey (React keeps `key`)", () => {
    expect(problems(`<App var.u="Ada"><I18n key="greeting" name="{u}" count="3"/></App>`)).toEqual([]);
    const out = code(`<App var.u="Ada"><I18n key="greeting" name="{u}"/></App>`);
    expect(out).toContain('"$$propKey": "greeting"');
    expect(out).not.toMatch(/"key": "greeting"/);
  });

  test("key is required (E021)", () => {
    expect(problems(`<App><I18n name="x"/></App>`)).toEqual([["error", "E021", "I18n"]]);
  });

  test("a <property> of any name is a slot template with $content", () => {
    expect(problems(`<App><I18n key="terms"><property name="link"><Text>{$content}</Text></property></I18n></App>`)).toEqual([]);
    expect(code(`<App><I18n key="terms"><property name="link"><Text>{$content}</Text></property></I18n></App>`)).toContain('"$$slot.link"');
  });

  test("inside Locale, App is the scope's context variable; outside, the app global", () => {
    const out = code(`<App><Locale locale="de"><Text>{App.translate('a')}</Text></Locale><Text>{App.locale}</Text></App>`);
    expect(out).toContain('$$useContextScope($$p, ["App"])');
    expect(problems(`<App><Locale locale="de" decimalSeparator=","><Text>{App.formatNumber(1)}</Text></Locale></App>`)).toEqual([]);
  });

  test("any built-in's prop named key goes as $$propKey (Card)", () => {
    const out = code(`<App><Card key="x"/></App>`);
    expect(out).toContain('"$$propKey": "x"');
  });
});
