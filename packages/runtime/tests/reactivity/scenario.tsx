// The step 4 scenario, written by hand in the shape the compiler would produce
// (there is no markup compiler yet), once per reactivity option:
//
//   <App var.count="{0}" var.name="{'a'}" var.double="{count * 2}">
//     <Text id="count" value="{count}"/>
//     <Text id="name" value="{name}"/>
//     <Stack><Stack><Text id="deep" value="{count + 1}"/></Stack></Stack>
//     <Text id="double" value="{double}"/>
//     <Button id="inc" onClick="count++"/>
//     <Button id="rename" onClick="name = name + '!'"/>
//     <Button id="both" onClick="count++; name = name + '!'"/>
//   </App>
//
// Bindings are compiled by the real step 3 compiler; handlers are hand-written
// (handler compilation is step 6).
import { compileInterpolation, parseInterpolation } from "@patchfuil/compiler";
import { memo, useState, type ReactNode } from "react";
import { useComputed } from "../../src/reactivity/react";
import { createScope } from "../../src/reactivity/scope";
import { batch, computed, signal } from "../../src/reactivity/signals";
import { loadBinding, type Binding } from "../../src/script/load";

export type RenderCounts = Record<string, number>;

/** Compiles an attribute value with the step 3 compiler. */
export function bind(text: string, names: string[]): Binding {
  const parsed = parseInterpolation(text);
  const result = compileInterpolation(parsed.segments, { scope: new Set(names) });
  if (result.diagnostics.length > 0) throw new Error(result.diagnostics[0]!.message);
  return loadBinding(result.code);
}

const NAMES = ["count", "name", "double"];
const COUNT = bind("{count}", NAMES);
const NAME = bind("{name}", NAMES);
const DEEP = bind("{count + 1}", NAMES);
const DOUBLE = bind("{double}", NAMES);
const DOUBLE_INIT = bind("{count * 2}", NAMES);

// --- (a) Signals: one subscription per component -------------------------------------

export function createSignalsApp(renders: RenderCounts) {
  const tick = (id: string) => (renders[id] = (renders[id] ?? 0) + 1);

  function Text({ id, value, scope }: { id: string; value: Binding; scope: object }) {
    const [text] = useComputed(() => [value(scope)], [value, scope]);
    tick(id);
    return <span data-testid={id}>{String(text)}</span>;
  }

  function Stack({ id, children }: { id: string; children: ReactNode }) {
    tick(id);
    return <div>{children}</div>;
  }

  function Button({ id, onClick }: { id: string; onClick: () => void }) {
    tick(id);
    return <button onClick={onClick}>{id}</button>;
  }

  function App() {
    // A compiled container creates its variables once.
    const [state] = useState(() => {
      const count = signal(0);
      const name = signal("a");
      let scope: object;
      const double = computed(() => DOUBLE_INIT(scope));
      scope = createScope({ count: { signal: count }, name: { signal: name }, double: { signal: double } });
      return { count, name, scope };
    });
    const { count, name, scope } = state;
    tick("app");
    return (
      <>
        <Text id="count" value={COUNT} scope={scope} />
        <Text id="name" value={NAME} scope={scope} />
        <Stack id="outer">
          <Stack id="inner">
            <Text id="deep" value={DEEP} scope={scope} />
          </Stack>
        </Stack>
        <Text id="double" value={DOUBLE} scope={scope} />
        <Button id="inc" onClick={() => count.set(count.peek() + 1)} />
        <Button id="rename" onClick={() => name.set(name.peek() + "!")} />
        <Button
          id="both"
          onClick={() =>
            batch(() => {
              count.set(count.peek() + 1);
              name.set(name.peek() + "!");
            })
          }
        />
      </>
    );
  }

  return App;
}

// --- (b) Plain React state: state in the declaring component, values as props ---------

export function createReactStateApp(renders: RenderCounts, options: { memo: boolean }) {
  const tick = (id: string) => (renders[id] = (renders[id] ?? 0) + 1);
  const maybeMemo = <P extends object>(component: (props: P) => ReactNode) =>
    options.memo ? memo(component) : component;

  const Text = maybeMemo(function Text({ id, value }: { id: string; value: unknown }) {
    tick(id);
    return <span data-testid={id}>{String(value)}</span>;
  });

  const Stack = maybeMemo(function Stack({ id, children }: { id: string; children: ReactNode }) {
    tick(id);
    return <div>{children}</div>;
  });

  const Button = maybeMemo(function Button({ id, onClick }: { id: string; onClick: () => void }) {
    tick(id);
    return <button onClick={onClick}>{id}</button>;
  });

  function App() {
    const [count, setCount] = useState(0);
    const [name, setName] = useState("a");
    const scope = { count, name, double: count * 2 };
    tick("app");
    return (
      <>
        <Text id="count" value={COUNT(scope)} />
        <Text id="name" value={NAME(scope)} />
        <Stack id="outer">
          <Stack id="inner">
            <Text id="deep" value={DEEP(scope)} />
          </Stack>
        </Stack>
        <Text id="double" value={DOUBLE(scope)} />
        <Button id="inc" onClick={() => setCount((c) => c + 1)} />
        <Button id="rename" onClick={() => setName((n) => n + "!")} />
        <Button
          id="both"
          onClick={() => {
            setCount((c) => c + 1);
            setName((n) => n + "!");
          }}
        />
      </>
    );
  }

  return App;
}
