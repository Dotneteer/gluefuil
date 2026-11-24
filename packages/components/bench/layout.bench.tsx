// The cost of the layout context (steps 19D–19E): 1,000 stacks, nested
// 10 × 10 × 10, each with a text. `Stack` reads the context, computes its
// level and provides a new one; the baseline is step 5's Stack, a div with
// inline flex styles and no context. Mount, and a re-render of the whole
// tree. Run with `npm run bench`.
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { test } from "vitest";
import { Stack } from "../src/layout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

/** Step 5's Stack: no context, no levels. */
function PlainStack({ orientation, children }: { orientation?: string; children?: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: orientation === "horizontal" ? "row" : "column" }}>{children}</div>;
}

type StackType = (props: { orientation?: string; children?: ReactNode }) => ReactNode;

function tree(S: StackType, tick: number) {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  return (
    <S>
      {range(10).map((a) => (
        <S key={a} orientation="horizontal">
          {range(10).map((b) => (
            <S key={b}>
              {range(9).map((c) => (
                <S key={c} orientation="horizontal">
                  <span>
                    {a}.{b}.{c} #{tick}
                  </span>
                </S>
              ))}
            </S>
          ))}
        </S>
      ))}
    </S>
  );
}

function setup(S: StackType) {
  let rerender!: () => void;
  function App() {
    const [tick, setTick] = useState(0);
    rerender = () => setTick((t) => t + 1);
    return tree(S, tick);
  }
  const root = createRoot(document.createElement("div"));
  flushSync(() => root.render(<App />));
  return { root, rerender: () => flushSync(rerender) };
}

test("1,000 stacks: mount", async ({ bench }) => {
  await bench("Stack (layout context)", () => setup(Stack as StackType).root.unmount()).run();
  await bench("plain div stack (baseline)", () => setup(PlainStack).root.unmount()).run();
});

test("1,000 stacks: re-render", async ({ bench }) => {
  const layout = setup(Stack as StackType);
  const plain = setup(PlainStack);
  await bench("Stack (layout context)", layout.rerender).run();
  await bench("plain div stack (baseline)", plain.rerender).run();
});
