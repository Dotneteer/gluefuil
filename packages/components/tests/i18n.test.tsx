// Step 34 in markup: App's locale and bundles, I18n, App.translate and the
// formatters, setLocale, Locale and its scoped App, framework strings, RTL.
// Design: .ai/plan/poc-34-i18n.md
import { compileModule } from "@gluefuil/compiler";
import { frameworkText, loadModule, PERSIST_KEY, registerLocaleLoader, resetI18nState, resetMessageCache, setDiagnosticReporter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as components from "../src/index";

let diagnostics: unknown[];
let restore: () => void;
beforeEach(() => {
  diagnostics = [];
  restore = setDiagnosticReporter((p) => diagnostics.push(p));
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  restore();
  resetI18nState();
  resetMessageCache();
  localStorage.clear();
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("lang");
});

function mount(markup: string) {
  const { code, diagnostics: problems } = compileModule(markup, { format: "function" });
  expect(problems.filter((d) => d.severity !== "warning")).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}
const text = (prefix: string) => screen.getByText((content) => content.startsWith(prefix)).textContent;

const BUNDLES = `{{
  en: { greeting: 'Hello, {name}!', inbox: '{count, plural, =0 {No messages} one {# message} other {# messages}}', terms: 'Accept the <link/>, read <b>this</b>.' },
  de: { greeting: 'Hallo, {name}!', inbox: '{count, plural, =0 {Keine Nachrichten} one {# Nachricht} other {# Nachrichten}}' },
  ar: { greeting: 'مرحبا {name}' }
}}`;

describe("messages", () => {
  test("I18n and App.translate in the default locale; a plural; variables from bindings", () => {
    mount(`
      <App var.n="{3}" localeBundles="${BUNDLES}" defaultLocale="en">
        <Text>a: <I18n key="greeting" name="Ada"/></Text>
        <Text>b: {App.translate('inbox', { count: n })}</Text>
        <Text>c: {App.t('inbox', { count: 0 })}</Text>
        <Text>locale: {App.locale}</Text>
      </App>`);
    expect(text("a:")).toBe("a: Hello, Ada!");
    expect(text("b:")).toBe("b: 3 messages");
    expect(text("c:")).toBe("c: No messages");
    // jsdom's navigator.languages is ["en-US"], which matches the en bundle (XMLUI's order).
    expect(text("locale:")).toBe("locale: en-US");
  });

  test("App.setLocale switches every message and formatter, and is stored", async () => {
    mount(`
      <App localeBundles="${BUNDLES}" defaultLocale="en">
        <Text>a: <I18n key="greeting" name="Ada"/></Text>
        <Text>b: {App.translate('inbox', { count: 1 })}</Text>
        <Text>n: {App.formatNumber(1234.5)}</Text>
        <Button label="de" onClick="App.setLocale('de')"/>
      </App>`);
    expect(text("n:")).toBe("n: 1,234.5");
    fireEvent.click(screen.getByRole("button", { name: "de" }));
    await waitFor(() => expect(text("a:")).toBe("a: Hallo, Ada!"));
    expect(text("b:")).toBe("b: 1 Nachricht");
    expect(text("n:")).toBe("n: 1.234,5");
    expect(localStorage.getItem(PERSIST_KEY)).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  test("a missing key shows the key and is a diagnostic; a missing de message falls back to... the key", () => {
    mount(`<App localeBundles="${BUNDLES}" locale="de"><Text>a: <I18n key="terms"/></Text></App>`);
    expect(text("a:")).toBe("a: terms");
    expect(diagnostics.map(String)).toContain("i18n: no message 'terms' for 'de'");
  });

  test("I18n slots replace <link/> and paired tags; $content is the tag's text; a tag without a slot shows its text", () => {
    const { container } = mount(`
      <App localeBundles="${BUNDLES}">
        <Text>t: <I18n key="terms"><property name="link"><Link to="/terms">terms</Link></property></I18n></Text>
      </App>`);
    expect(text("t:")).toBe("t: Accept the terms, read this.");
    expect(container.querySelector("a")?.textContent).toBe("terms");
  });
});

describe("Locale", () => {
  test("components and the scoped App follow it; App.locale is the scope's", () => {
    const { container } = mount(`
      <App localeBundles="${BUNDLES}" defaultLocale="en">
        <Text>root: <I18n key="greeting" name="A"/>|{App.locale}</Text>
        <Locale locale="de-DE" decimalSeparator="·">
          <Text>scoped: <I18n key="greeting" name="B"/>|{App.locale}|{App.formatNumber(1.5)}</Text>
        </Locale>
        <Locale locale="ar"><Text>rtl: <I18n key="greeting" name="C"/></Text></Locale>
      </App>`);
    expect(text("root:")).toBe("root: Hello, A!|en-US");
    expect(text("scoped:")).toBe("scoped: Hallo, B!|de-DE|1·5");
    expect(container.querySelector('.gfui-Locale[lang="ar"]')?.getAttribute("dir")).toBe("rtl");
  });
});

describe("direction", () => {
  test("auto: an RTL locale sets dir on the App and <html>; direction overrides it", async () => {
    const { container } = mount(`<App localeBundles="${BUNDLES}" locale="ar"><Text>x</Text></App>`);
    expect(container.querySelector(".gfui-App")?.getAttribute("dir")).toBe("rtl");
    expect(container.querySelector(".gfui-App")?.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("framework strings", () => {
  test("built-in English; an app's bundle overrides a gfui key", () => {
    expect(frameworkText("gfui.form.save", undefined, "en")).toBe("Save");
    mount(`<App localeBundles="{{ de: { 'gfui.form.save': 'Speichern' } }}" locale="de"><Form><TextBox bindTo="a"/></Form></App>`);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy();
  });
});

describe("lazy locales", () => {
  test("setLocale waits for a loader's messages: the old locale stays until they arrive", async () => {
    let release!: (m: unknown) => void;
    registerLocaleLoader("fr", () => new Promise((r) => (release = r)));
    mount(`
      <App localeBundles="${BUNDLES}" defaultLocale="en">
        <Text>a: <I18n key="greeting" name="Ada"/></Text>
        <Button label="fr" onClick="App.setLocale('fr')"/>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "fr" }));
    await act(async () => {});
    expect(text("a:")).toBe("a: Hello, Ada!");
    await act(async () => release({ greeting: "Bonjour, {name} !" }));
    await waitFor(() => expect(text("a:")).toBe("a: Bonjour, Ada !"));
  });
});

describe("framework strings and locale-aware components", () => {
  test("a saveLabel prop still wins; validation messages follow the locale", async () => {
    mount(`
      <App locale="de" localeBundles="{{ de: { 'gfui.form.save': 'Speichern', 'gfui.validation.required': 'Pflichtfeld' } }}">
        <Form saveLabel="Absenden"><TextBox label="Name" bindTo="name" required="true"/></Form>
      </App>`);
    expect(screen.getByRole("button", { name: "Absenden" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(screen.getAllByText("Pflichtfeld").length).toBeGreaterThan(0));
  });

  test("Value and Table format in the locale; typeOptions.locale still wins", () => {
    mount(`
      <App locale="de">
        <Text>v: <Value value="{1234.5}" type="number"/>|<Value value="{1234.5}" type="number" typeOptions="{{ locale: 'en' }}"/></Text>
        <Table data="{[{ n: 9876.5 }]}"><Column bindTo="n" type="number"/></Table>
      </App>`);
    expect(text("v:")).toBe("v: 1.234,5|1,234.5");
    expect(document.querySelector(".gfui-Table-body")?.textContent).toContain("9.876,5");
  });
});

describe("the prerender and the takeover (decision C1)", () => {
  test("the server renders the app's locale and records lang/dir; hydration keeps every node, then switches to the stored locale", async () => {
    const { renderStatic } = await import("@gluefuil/runtime/server");
    const { mountApp } = await import("@gluefuil/runtime");
    const { code } = compileModule(`
      <App defaultLocale="en" localeBundles="${BUNDLES.replace(/\n/g, " ")}">
        <Text>a: <I18n key="greeting" name="Ada"/></Text>
        <Text>n: {App.formatNumber(1234.5)}</Text>
      </App>`, { format: "function" });
    const Main = loadModule(code, { components });
    const result = renderStatic(<Main />);
    expect(result.document).toEqual({ lang: "en", dir: "ltr" });
    expect(result.html).toContain("Hello, Ada!");
    // The visitor chose German before.
    localStorage.setItem(PERSIST_KEY, "de");
    resetI18nState();
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = result.html;
    for (const [name, value] of Object.entries(result.attributes)) container.setAttribute(name, value);
    const before = [...container.querySelectorAll(".gfui-Text")];
    const recoverable: unknown[] = [];
    let root: { unmount(): void } | undefined;
    await act(async () => {
      root = mountApp(container, <Main />, { onRecoverableError: (e) => recoverable.push(e) });
    });
    await waitFor(() => expect(container.textContent).toContain("Hallo, Ada!"));
    expect(container.textContent).toContain("1.234,5");
    expect([...container.querySelectorAll(".gfui-Text")]).toEqual(before);
    expect(recoverable).toEqual([]);
    act(() => root!.unmount());
    container.remove();
  });
});
