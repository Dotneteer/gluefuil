// Step 35: what tracing costs. A handler call that writes a variable (through a
// HandlerSlot, as compiled code runs it), and 100 bound elements re-rendering
// after one write, each with tracing off and on (render entries too). Off must
// cost nothing measurable. Run with `npm run bench`.
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { test } from "vitest";
import { variable } from "../src/reactivity/variable";
import { Bound, createVariableScope } from "../src/render/elements";
import { HandlerSlot, setDefaultHandlerTimeout } from "../src/render/handlers";
import { clearTrace, disableTrace, enableTrace } from "../src/trace/core";
import { locations } from "../src/trace/location";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
setDefaultHandlerTimeout(0);
const L = locations("src/Main.gui", ["Button", 3, 5, "count", 1, 6, "#text", 4, 9]);

function handlerSetup() {
  const count = variable(() => 0, { name: "count", at: L[1] });
  const slot = new HandlerSlot((_x) => () => count.set(count.peek() + 1), "parallel", undefined, {}, { event: "click", at: L[0] });
  return () => slot.invoke([{ clientX: 1, clientY: 2 }]);
}

function rendersSetup() {
  const scope = createVariableScope({}, { n: { value: 0, at: L[1] } }) as { n: number };
  const bindings = { value: (s: object) => (s as { n: number }).n };
  function Label({ value }: { value?: unknown }) {
    return <span>{String(value)}</span>;
  }
  const root = createRoot(document.createElement("div"));
  flushSync(() =>
    root.render(
      <div>
        {Array.from({ length: 100 }, (_, i) => (
          <Bound key={i} type={Label} bindings={bindings} scope={scope} at={L[2]} />
        ))}
      </div>,
    ),
  );
  return () => flushSync(() => (scope.n += 1));
}

test("a handler call that writes a variable", async ({ bench }) => {
  const call = handlerSetup();
  // The switch is set once per run, not per call (master's baseline has no switch to call).
  disableTrace();
  await bench("tracing off", call).run();
  enableTrace({ size: 1000 });
  await bench("tracing on", call).run();
  disableTrace();
  clearTrace();
});

test("100 elements re-render after one write", async ({ bench }) => {
  const write = rendersSetup();
  disableTrace();
  await bench("tracing off", write).run();
  enableTrace({ size: 1000, render: false });
  await bench("tracing on", write).run();
  enableTrace({ size: 1000, render: true });
  await bench("tracing on, with render entries", write).run();
  disableTrace();
  clearTrace();
});
