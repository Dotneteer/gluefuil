// Update cost of the two reactivity options, on 1,000 rows (jsdom).
// Each update is applied with flushSync, so the measured time includes React's
// render and commit. Run with `npm run bench`.
import { memo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { test } from "vitest";
import { useSignal } from "../src/reactivity/react";
import { batch, signal, type Signal } from "../src/reactivity/signals";

const ROWS = 1000;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function mount(element: React.ReactNode) {
  const root = createRoot(document.createElement("div"));
  flushSync(() => root.render(element));
  return root;
}

// --- (a) signals: each row subscribes to its own value -----------------------------

function signalsSetup() {
  const values: Signal<number>[] = Array.from({ length: ROWS }, (_, i) => signal(i));
  function Row({ value }: { value: Signal<number> }) {
    return <span>{useSignal(value)}</span>;
  }
  function App() {
    return (
      <div>
        {values.map((value, i) => (
          <Row key={i} value={value} />
        ))}
      </div>
    );
  }
  mount(<App />);
  let n = ROWS;
  return {
    one: () => flushSync(() => values[500]!.set(n++)),
    all: () => flushSync(() => batch(() => values.forEach((v) => v.set(n++)))),
  };
}

// --- (b) plain React state in the declaring component -------------------------------

function reactStateSetup(memoized: boolean) {
  let update!: (fn: (values: number[]) => number[]) => void;
  const PlainRow = ({ value }: { value: number }) => <span>{value}</span>;
  const Row = memoized ? memo(PlainRow) : PlainRow;
  function App() {
    const [values, setValues] = useState(() => Array.from({ length: ROWS }, (_, i) => i));
    update = setValues;
    return (
      <div>
        {values.map((value, i) => (
          <Row key={i} value={value} />
        ))}
      </div>
    );
  }
  mount(<App />);
  let n = ROWS;
  return {
    one: () =>
      flushSync(() =>
        update((values) => {
          const next = values.slice();
          next[500] = n++;
          return next;
        }),
      ),
    all: () => flushSync(() => update((values) => values.map(() => n++))),
  };
}

test(`update one of ${ROWS} rows`, async ({ bench }) => {
  const a = signalsSetup();
  const naive = reactStateSetup(false);
  const memoized = reactStateSetup(true);
  await bench("(a) signals", a.one).run();
  await bench("(b) React state", naive.one).run();
  await bench("(b) React state + memo", memoized.one).run();
});

test(`update all ${ROWS} rows`, async ({ bench }) => {
  const a = signalsSetup();
  const naive = reactStateSetup(false);
  const memoized = reactStateSetup(true);
  await bench("(a) signals", a.all).run();
  await bench("(b) React state", naive.all).run();
  await bench("(b) React state + memo", memoized.all).run();
});
