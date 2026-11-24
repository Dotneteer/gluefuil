// Step 21B end to end in jsdom: globals (global.*, <global>, Globals.xs)
// reach user components in other files; their own names shadow them.
import { analyzeModule, compileModule, type UserComponentInfo } from "@patchfuil/compiler";
import { loadModule, setErrorReporter } from "@patchfuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ComponentType } from "react";
import { afterEach, expect, test } from "vitest";
import * as builtIns from "../src/index";

afterEach(cleanup);

/**
 * Compiles an app file, its Globals.xs and component files as the hosts do:
 * analyze the app for its globals and the components for their interfaces,
 * then compile every component file with both.
 */
function load(main: string, files: Record<string, string> = {}, globalsCode?: string, entryGlobals?: string[]): ComponentType {
  // entryGlobals: the components were compiled against another app's globals (another page of the project).
  const globals = entryGlobals ?? analyzeModule(main, globalsCode !== undefined ? { globalsCode } : {}).globals;
  const infos: Record<string, UserComponentInfo> = {};
  for (const [name, markup] of Object.entries(files)) {
    for (const info of analyzeModule(markup).components) if (info.name === name) infos[name] = info;
  }
  const components: Record<string, unknown> = { ...builtIns };
  for (const [name, markup] of Object.entries(files)) {
    const userComponents = Object.fromEntries(Object.entries(infos).filter(([other]) => other !== name));
    const result = compileModule(markup, { format: "function", fileName: `${name}.pfui`, userComponents, globals });
    expect(result.diagnostics).toEqual([]);
    components[name] = loadModule(result.code, { components });
  }
  const result = compileModule(main, { format: "function", userComponents: infos, ...(globalsCode !== undefined ? { globalsCode } : {}) });
  expect(result.diagnostics).toEqual([]);
  if (globalsCode !== undefined) expect(result.globalsDiagnostics).toEqual([]);
  return loadModule(result.code, { components }) as ComponentType;
}

function show(main: string, files?: Record<string, string>, globalsCode?: string) {
  const Main = load(main, files, globalsCode);
  return render(
    <StrictMode>
      <Main />
    </StrictMode>,
  );
}

const texts = () => [...document.querySelectorAll(".pfui-Text")].map((e) => e.textContent);
const click = (label: string, index = 0) => act(async () => fireEvent.click(screen.getAllByRole("button", { name: label })[index]!));

const FILES = {
  Writer: `<Component name="Writer"><Button label="Bump" onClick="count++; session.user = 'Bo'"/></Component>`,
  Reader: `<Component name="Reader"><Text>reader: {count} {session.user}</Text></Component>`,
};

test("a component writes a global; the app and another component file read it", async () => {
  show(`<App global.count="{1}" global.session="{ { user: 'Ada' } }"><Text>main: {count}</Text><Writer/><Reader/></App>`, FILES);
  expect(texts()).toEqual(["main: 1", "reader: 1 Ada"]);
  await click("Bump");
  expect(texts()).toEqual(["main: 2", "reader: 2 Bo"]);
});

test("a global declared with <global> works the same", async () => {
  show(`<App><global name="count" value="{5}"/><global name="session" value="{ { user: 'Ada' } }"/><Writer/><Reader/></App>`, FILES);
  await click("Bump");
  expect(texts()).toEqual(["reader: 6 Bo"]);
});

test("a component's own variable shadows the global: writing it leaves the global alone", async () => {
  show(`<App global.count="{1}"><Text>main: {count}</Text><Local/></App>`, {
    Local: `<Component name="Local" var.count="{100}"><Button label="Local" onClick="count++"/><Text>local: {count}</Text></Component>`,
  });
  await click("Local");
  expect(texts()).toEqual(["main: 1", "local: 101"]);
});

test("a component inside another sees the global, not its parent's variable of that name", async () => {
  show(`<App global.count="{1}"><Outer/></App>`, {
    Outer: `<Component name="Outer" var.count="{100}"><Text>outer: {count}</Text><Inner/></Component>`,
    Inner: `<Component name="Inner"><Text>inner: {count}</Text></Component>`,
  });
  expect(texts()).toEqual(["outer: 100", "inner: 1"]);
});

test("inline components in the app file see the globals", async () => {
  show(`
    <Component name="Bump"><Button label="Bump" onClick="count++"/></Component>
    <App global.count="{1}"><Text>main: {count}</Text><Bump/></App>`);
  await click("Bump");
  expect(texts()).toEqual(["main: 2"]);
});

test("each mounted app has its own globals", async () => {
  const Main = load(`<App global.count="{1}" global.session="{ { user: 'Ada' } }"><Writer/><Reader/></App>`, FILES);
  render(
    <>
      <Main />
      <Main />
    </>,
  );
  await click("Bump", 1);
  expect(texts()).toEqual(["reader: 1 Ada", "reader: 2 Bo"]);
});

test("a component rendered by an app that doesn't provide its global (another page) reads undefined; a write fails and is reported", async () => {
  const errors: unknown[] = [];
  const restore = setErrorReporter((error) => errors.push(error));
  const Main = load(`<App><Writer/><Reader/></App>`, FILES, undefined, ["count", "session"]);
  render(<Main />);
  expect(texts()).toEqual(["reader:  "]);
  await click("Bump");
  expect(errors.length).toBeGreaterThan(0);
  restore();
});

test("Globals.xs: its variables and functions reach a component file; a function writes a global", async () => {
  show(
    `<App><Text>main: {label()}</Text><Counter/></App>`,
    { Counter: `<Component name="Counter"><Button label="Bump" onClick="bump()"/><Text>counter: {label()}</Text></Component>` },
    "var n = 1;\nfunction label() { return 'n=' + n; }\nfunction bump() { n++; }",
  );
  expect(texts()).toEqual(["main: n=1", "counter: n=1"]);
  await click("Bump");
  expect(texts()).toEqual(["main: n=2", "counter: n=2"]);
});

test("Globals.xs and global.* together; a global initializer reads another global", () => {
  show(`<App global.base="{10}"><Show/></App>`, { Show: `<Component name="Show"><Text>{total}</Text></Component>` }, "var total = base + 1;");
  expect(texts()).toEqual(["11"]);
});
