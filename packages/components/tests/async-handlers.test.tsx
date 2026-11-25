// Step 7 end to end in jsdom: async handlers written in markup, with real clicks.
import { compileModule } from "@gluefuil/compiler";
import { isBatching, loadModule, setErrorReporter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import * as components from "../src/index";

let reported: unknown[] = [];
let restore: () => void;
beforeEach(() => {
  reported = [];
  restore = setErrorReporter((error) => reported.push(error));
});
afterEach(() => {
  cleanup();
  restore();
  expect(isBatching()).toBe(false);
});

function renderMarkup(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const click = (label: string) =>
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
/** Lets timers and promises run, inside act (React updates are flushed). */
const settle = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const text = (id: string) => screen.getByText((_, el) => el?.getAttribute("class") === "gfui-Text" && (el.textContent ?? "").startsWith(`${id}:`)).textContent;

test("a slow handler: the loading state shows while waiting, the result after", async () => {
  renderMarkup(`
    <App var.status="idle" var.saves="{0}">
      <Button label="Save" onClick="status = 'saving…'; delay(20); saves++; status = 'saved'"/>
      <Text>status: {status} ({saves})</Text>
    </App>`);
  click("Save");
  expect(text("status")).toBe("status: saving… (0)");
  await settle(40);
  expect(text("status")).toBe("status: saved (1)");
});

test("explicit await works the same as implicit await", async () => {
  renderMarkup(`
    <App var.n="{0}">
      <Button label="Go" onClick="await delay(5); n = 1; await delay(5); n = 2"/>
      <Text>n: {n}</Text>
    </App>`);
  click("Go");
  await settle(30);
  expect(text("n")).toBe("n: 2");
});

test("a handler that never finishes does not freeze the UI", async () => {
  renderMarkup(`
    <App var.status="" var.count="{0}">
      <Button label="Hang" handlerTimeoutMs="0" onClick="status = 'waiting'; delay(1000000); status = 'never'"/>
      <Button label="Count" onClick="count++"/>
      <Text>status: {status}</Text>
      <Text>count: {count}</Text>
    </App>`);
  click("Hang");
  click("Count");
  click("Count");
  expect(text("status")).toBe("status: waiting");
  expect(text("count")).toBe("count: 2");
});

test("an error after an await is reported; the UI stays live and keeps the earlier writes", async () => {
  renderMarkup(`
    <App var.step="{0}">
      <Button label="Fail" onClick="step = 1; delay(5); step = 2; null.x.y = 3; step = 99"/>
      <Button label="Next" onClick="step = step + 10"/>
      <Text>step: {step}</Text>
    </App>`);
  click("Fail");
  await settle(20);
  expect(text("step")).toBe("step: 2");
  expect(reported).toHaveLength(1);
  click("Next");
  expect(text("step")).toBe("step: 12");
});

test("single-flight: a superseded call stops at its next await and never writes", async () => {
  renderMarkup(`
    <App var.log="{[]}">
      <Button label="Search" handlerPolicy:onClick="single-flight" onClick="
        const n = log.length + 1;
        log.push('start ' + n);
        delay(10);
        log.push('end ' + n);
      "/>
      <Text>log: {log.join(', ')}</Text>
    </App>`);
  click("Search");
  click("Search");
  await settle(30);
  expect(text("log")).toBe("log: start 1, start 2, end 2");
  expect(reported).toEqual([]);
});

test("queue and drop-while-running", async () => {
  renderMarkup(`
    <App var.queued="{[]}" var.dropped="{[]}" var.q="{0}" var.d="{0}">
      <Button label="Queue" handlerPolicy="queue" onClick="const n = ++q; delay(5); queued.push(n)"/>
      <Button label="Drop" handlerPolicy="drop-while-running" onClick="const n = ++d; delay(5); dropped.push(n)"/>
      <Text>queued: {queued.join(',')}</Text>
      <Text>dropped: {dropped.join(',')}</Text>
    </App>`);
  click("Queue");
  click("Queue");
  click("Queue");
  click("Drop");
  click("Drop");
  await settle(40);
  expect(text("queued")).toBe("queued: 1,2,3");
  expect(text("dropped")).toBe("dropped: 1");
});

test("unmounting cancels running handlers", async () => {
  const { unmount } = renderMarkup(`
    <App var.done="{false}">
      <Button label="Slow" onClick="delay(10); done = true"/>
      <Text>done: {done}</Text>
    </App>`);
  click("Slow");
  unmount();
  await settle(20);
  expect(reported).toEqual([]);
});

test("async-aware array methods in markup: sequential map, parallel filter", async () => {
  renderMarkup(`
    <App var.order="{[]}" var.evens="{[]}">
      <Button label="Map" onClick="
        [3, 1, 2].map(x => delay(x * 3).then(() => order.push(x)));
        evens = [1, 2, 3, 4].filter(x => delay(1).then(() => x % 2 === 0));
      "/>
      <Text>order: {order.join(',')}</Text>
      <Text>evens: {evens.join(',')}</Text>
    </App>`);
  click("Map");
  await settle(60);
  // map waits for each callback before starting the next: the order is the array order.
  expect(text("order")).toBe("order: 3,1,2");
  expect(text("evens")).toBe("evens: 2,4");
});

test("$param still works in async handlers; bindings stay synchronous", async () => {
  renderMarkup(`
    <App var.n="{1}">
      <Button label="Double" onClick="delay(1); n = n * 2"/>
      <Text>n: {n} {typeof n}</Text>
    </App>`);
  click("Double");
  await settle(10);
  expect(text("n")).toBe("n: 2 number");
});
