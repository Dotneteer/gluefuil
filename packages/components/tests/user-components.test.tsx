// Step 14 end to end in jsdom: user-defined components, one test per feature.
import { analyzeModule, compileModule, type UserComponentInfo } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ComponentType } from "react";
import { afterEach, expect, test, vi } from "vitest";
import * as builtIns from "../src/index";

afterEach(cleanup);

/**
 * Compiles an app file plus component files (name → markup, with optional
 * code-behind), as the standalone loader does: analyze all, then compile each
 * with the others' interfaces, "function" format, one shared components record.
 */
function load(main: string, files: Record<string, string | { markup: string; codeBehind: string }> = {}, mainCodeBehind?: string) {
  const sources = Object.fromEntries(Object.entries(files).map(([name, f]) => [name, typeof f === "string" ? { markup: f } : f]));
  const infos: Record<string, UserComponentInfo> = {};
  for (const [name, source] of Object.entries(sources)) {
    const codeBehind = (source as { codeBehind?: string }).codeBehind;
    for (const info of analyzeModule(source.markup, codeBehind !== undefined ? { codeBehind } : {}).components) if (info.name === name) infos[name] = info;
  }
  const components: Record<string, unknown> = { ...builtIns };
  const compile = (markup: string, fileName: string, codeBehind: string | undefined, own?: string) => {
    const userComponents = Object.fromEntries(Object.entries(infos).filter(([name]) => name !== own));
    const result = compileModule(markup, { format: "function", fileName, userComponents, ...(codeBehind !== undefined ? { codeBehind } : {}) });
    expect(result.diagnostics).toEqual([]);
    if (codeBehind !== undefined) expect(result.codeBehindDiagnostics).toEqual([]);
    return result.code;
  };
  for (const [name, source] of Object.entries(sources)) {
    components[name] = loadModule(compile(source.markup, `${name}.gui`, (source as { codeBehind?: string }).codeBehind, name), { components });
  }
  return loadModule(compile(main, "Main.gui", mainCodeBehind), { components }) as ComponentType;
}

function show(main: string, files?: Parameters<typeof load>[1], codeBehind?: string) {
  const Main = load(main, files, codeBehind);
  return render(
    <StrictMode>
      <Main />
    </StrictMode>,
  );
}

const texts = () => [...document.querySelectorAll(".gfui-Text")].map((e) => e.textContent);
const click = (label: string) => act(async () => fireEvent.click(screen.getByRole("button", { name: label })));

test("$props: values from the caller, with defaults through ??", () => {
  show(`
    <Component name="NameValue">
      <Stack>
        <Text>Name: {$props.name}</Text>
        <Text>Value: {$props.value ?? '[no value]'}</Text>
      </Stack>
    </Component>
    <App>
      <NameValue name="Mary" value="123"/>
      <NameValue name="{'Jo' + 'e'}"/>
    </App>`);
  expect(texts()).toEqual(["Name: Mary", "Value: 123", "Name: Joe", "Value: [no value]"]);
});

test("$props follow the caller's state; only the readers re-render", async () => {
  const renders = vi.fn();
  const Probe = (props: { value?: unknown }) => {
    renders(props.value);
    return <span className="gfui-Text">{String(props.value)}</span>;
  };
  const Main = (() => {
    const infos = analyzeModule(`<Component name="Show"><App><Probe value="static"/><Text>{$props.n}</Text></App></Component>`).components;
    const meta = { ...builtIns.componentMetadata, Probe: { description: "", props: { value: { description: "" } } } };
    const components: Record<string, unknown> = { ...builtIns, Probe };
    const show = compileModule(`<Component name="Show"><App><Probe value="static"/><Text>{$props.n}</Text></App></Component>`, { format: "function", components: meta });
    components.Show = loadModule(show.code, { components });
    const main = compileModule(`<App var.n="{1}"><Show n="{n}"/><Button label="Inc" onClick="n++"/></App>`, {
      format: "function",
      components: meta,
      userComponents: { Show: infos[0]! },
    });
    expect(main.diagnostics).toEqual([]);
    return loadModule(main.code, { components }) as ComponentType;
  })();
  render(<Main />);
  expect(texts()).toEqual(["static", "1"]);
  renders.mockClear();
  await click("Inc");
  expect(texts()).toEqual(["static", "2"]);
  // The component body did not re-render: its other children were untouched.
  expect(renders).not.toHaveBeenCalled();
});

test("private variables: one set per instance", async () => {
  show(
    `<App><Counter/><Counter/></App>`,
    {
      Counter: `
        <Component name="Counter">
          <variable name="count" value="{0}"/>
          <Stack><Button label="{'Increment ' + count}" onClick="count++"/></Stack>
        </Component>`,
    },
  );
  const [first] = screen.getAllByRole("button", { name: "Increment 0" });
  await act(async () => fireEvent.click(first!));
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Increment 1", "Increment 0"]);
});

test("emitEvent calls the caller's handler with arguments (an arrow handler) and returns its result", async () => {
  show(`
    <Component name="IncButton">
      <variable name="count" value="{0}"/>
      <variable name="answer" value=""/>
      <Stack>
        <Button label="Click to increment: {count}" onClick="count++; answer = emitEvent('incremented', count)"/>
        <Text>answer: {answer}</Text>
        <Text>has handler: {hasEventHandler('incremented')}, {hasEventHandler('other')}</Text>
      </Stack>
    </Component>
    <App var.text="">
      <IncButton onIncremented="(clickCount) => { text += ' ' + clickCount; return 'ok ' + clickCount }"/>
      <Text value="{text}"/>
    </App>`);
  expect(texts()).toEqual(["answer: ", "has handler: true, false", ""]);
  await click("Click to increment: 0");
  await click("Click to increment: 1");
  expect(texts()).toEqual(["answer: ok 2", "has handler: true, false", " 1 2"]);
});

test("emitEvent without a handler is undefined", async () => {
  show(`
    <Component name="Quiet">
      <variable name="got" value="unset"/>
      <Stack><Button label="emit" onClick="got = String(emitEvent('nobody'))"/><Text>{got}</Text></Stack>
    </Component>
    <App><Quiet/></App>`);
  await click("emit");
  expect(texts()).toEqual(["undefined"]);
});

test("methods: through the caller's id (method.* attribute and <method>), and inside through $self", async () => {
  show(
    `<App var.got="">
       <Counter id="counter1"/>
       <Button label="Reset (external)" onClick="counter1.reset()"/>
       <Button label="Double" onClick="got = counter1.doubled(21)"/>
       <Text>got: {got}</Text>
     </App>`,
    {
      Counter: `
        <Component name="Counter" method.reset="count = 0">
          <variable name="count" value="{0}"/>
          <method name="doubled">(n) => n * 2</method>
          <Stack>
            <Text value="{count}"/>
            <Button label="Increment" onClick="count++"/>
            <Button label="Reset" onClick="$self.reset()"/>
          </Stack>
        </Component>`,
    },
  );
  await click("Increment");
  await click("Increment");
  expect(texts()[0]).toBe("2");
  await click("Reset");
  expect(texts()[0]).toBe("0");
  await click("Increment");
  await click("Reset (external)");
  expect(texts()[0]).toBe("0");
  await click("Double");
  expect(texts()[1]).toBe("got: 42");
});

test("the default slot renders the caller's children, in the caller's scope; the fallback otherwise", async () => {
  show(`
    <Component name="InfoCard">
      <Stack>
        <Text>[{$props.title}]</Text>
        <Slot><Text>nothing given</Text></Slot>
      </Stack>
    </Component>
    <App var.name="caller">
      <InfoCard title="a"><Text>child of {name}</Text><Button label="Rename" onClick="name = 'renamed'"/></InfoCard>
      <InfoCard title="b"/>
    </App>`);
  expect(texts()).toEqual(["[a]", "child of caller", "[b]", "nothing given"]);
  await click("Rename");
  expect(texts()[1]).toBe("child of renamed");
});

test("named slots with slot props: $item flows back into the caller's template", () => {
  show(
    `<App var.prefix="#">
       <StatusList items="{[{ label: 'Build', ok: true }, { label: 'Tests', ok: false }]}">
         <property name="rowTemplate">
           <Text>{prefix}{$index} {$item.ok ? '✓' : '✗'} {$item.label}</Text>
         </property>
       </StatusList>
       <StatusList items="{[{ label: 'Deploy' }]}"/>
     </App>`,
    {
      StatusList: `
        <Component name="StatusList">
          <Items data="{$props.items}">
            <Slot name="rowTemplate" item="{$item}" index="{$itemIndex}">
              <Text>default: {$item.label}</Text>
            </Slot>
          </Items>
        </Component>`,
    },
  );
  expect(texts()).toEqual(["#0 ✓ Build", "#1 ✗ Tests", "default: Deploy"]);
});

test("a component uses another; recursion through the shared table", () => {
  show(`<App><Tree depth="{3}"/></App>`, {
    Tree: `
      <Component name="Tree">
        <Stack>
          <Leaf label="{'depth ' + $props.depth}"/>
          <Tree when="{$props.depth > 1}" depth="{$props.depth - 1}"/>
        </Stack>
      </Component>`,
    Leaf: `<Component name="Leaf"><Text>{$props.label}</Text></Component>`,
  });
  expect(texts()).toEqual(["depth 3", "depth 2", "depth 1"]);
});

test("IDs inside a component are its own, per instance", async () => {
  show(`<App><Echo/><Echo/></App>`, {
    Echo: `
      <Component name="Echo">
        <Stack><TextBox id="box"/><Text>echo: {box.value}</Text></Stack>
      </Component>`,
  });
  const [first] = screen.getAllByRole("textbox");
  act(() => fireEvent.change(first!, { target: { value: "hi" } }));
  expect(texts()).toEqual(["echo: hi", "echo: "]);
});

test("code-behind: var and function, for a component and for the app", async () => {
  show(
    `<App><Greeter/><Text>{shout('app')}</Text></App>`,
    {
      Greeter: {
        markup: `
          <Component name="Greeter">
            <Stack><Text>{greet(name)}</Text><Button label="Rename" onClick="rename('Ada')"/></Stack>
          </Component>`,
        codeBehind: `
          var name = 'world';
          function greet(who) { return 'Hello, ' + who + '!'; }
          function rename(next) { name = next; }`,
      },
    },
    `function shout(s) { return s.toUpperCase() + '!'; }`,
  );
  expect(texts()).toEqual(["Hello, world!", "APP!"]);
  await click("Rename");
  expect(texts()[0]).toBe("Hello, Ada!");
});
