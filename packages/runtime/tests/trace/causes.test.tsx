// Step 35: causes found by tracking reads (plan § Traces and causes). A handler
// writes a variable; a binding that reads it (directly, or through another
// computed) re-evaluates in a later render, outside the handler, and still names
// the write that caused it.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { computed } from "../../src/reactivity/signals";
import { Bound, createVariableScope, takeCauses, type TraceCell } from "../../src/render/elements";
import { HandlerSlot } from "../../src/render/handlers";
import { enableTrace, entries, resetTrace } from "../../src/trace/core";
import type { RenderEntry, StateEntry, TraceEntry } from "../../src/trace/entries";
import { locations } from "../../src/trace/location";

beforeEach(() => resetTrace());
afterEach(() => {
  cleanup();
  resetTrace();
});

const L = locations("Main.gui", ["var.filter", 1, 6, "var.page", 1, 20, "DataSource", 3, 3, "Text", 4, 3, "Button", 5, 3]);
const of = <K extends TraceEntry["kind"]>(kind: K) => entries().filter((e): e is Extract<TraceEntry, { kind: K }> => e.kind === kind);

function app() {
  const scope = createVariableScope({}, { filter: { value: "", at: L[0] }, page: { value: 1, at: L[1] } }) as { filter: string; page: number };
  const cells: TraceCell[] = [];
  function Source(props: { url?: string; $$trace?: TraceCell }) {
    if (props.$$trace) cells.push(props.$$trace);
    return <span data-testid="url">{props.url}</span>;
  }
  function Label({ value }: { value?: unknown }) {
    return <span data-testid="label">{String(value)}</span>;
  }
  const urlBindings = { url: (s: object) => `/api/users?q=${(s as typeof scope).filter}&page=${(s as typeof scope).page}` };
  // A derived value in between (a computed read inside a binding).
  const upper = computed(() => scope.filter.toUpperCase());
  const labelBindings = { value: () => upper.get() };
  render(
    <>
      <Bound type={Source} bindings={urlBindings} scope={scope} at={L[2]} traced />
      <Bound type={Label} bindings={labelBindings} scope={scope} at={L[3]} />
    </>,
  );
  const click = new HandlerSlot(
    (_x) => () => {
      scope.filter = "ada";
    },
    "parallel",
    undefined,
    {},
    { event: "click", at: L[4] },
  );
  return { scope, cells, click };
}

describe("causes from tracked reads", () => {
  test("a handler's write names its trace; a re-evaluation outside the handler names the write", () => {
    enableTrace({ render: true });
    const { cells, click } = app();
    act(() => click.invoke([]));
    expect(screen.getByTestId("url").textContent).toBe("/api/users?q=ada&page=1");
    const [handler] = of("handler");
    const [state] = of("state") as StateEntry[];
    expect(handler).toMatchObject({ event: "click", outcome: "ok", at: L[4] });
    expect(state).toMatchObject({ variable: "filter", before: "", after: "ada", at: L[0], traceId: handler!.traceId, spanId: handler!.spanId });
    // Both elements re-rendered after the handler's segment closed; each names the write.
    const renders = of("render") as RenderEntry[];
    expect(renders.map((r) => r.at?.element).sort()).toEqual(["DataSource", "Text"]);
    for (const r of renders) expect(r.causes).toEqual([{ traceId: handler!.traceId, spanId: handler!.spanId, entry: state!.seq }]);
    expect(new Set(renders.map((r) => r.group)).size).toBe(1);
    expect(renders.find((r) => r.at?.element === "DataSource")!.changed).toEqual(["url"]);
    // The traced component's cell holds the causes once (the fetch takes them).
    const cell = cells.at(-1)!;
    expect(cell.at).toBe(L[2]);
    expect(takeCauses(cell)).toHaveLength(1);
    expect(takeCauses(cell)).toEqual([]);
  });

  test("an unchanged dependency is not a cause: only the newest write since the last evaluation", () => {
    enableTrace({ render: true });
    const { scope, click } = app();
    act(() => {
      scope.page = 2; // a write outside any handler: its own trace
    });
    act(() => click.invoke([]));
    const renders = of("render") as RenderEntry[];
    const last = renders.filter((r) => r.at?.element === "DataSource").at(-1)!;
    const handler = of("handler")[0]!;
    expect(last.causes.map((c) => c.traceId)).toEqual([handler.traceId]);
  });

  test("with tracing off, nothing is recorded and no write mark is kept", () => {
    const { cells, click } = app();
    act(() => click.invoke([]));
    expect(entries()).toEqual([]);
    expect(takeCauses(cells.at(-1))).toEqual([]);
  });

  test("render entries only with render tracing on; the cell still gets causes", () => {
    enableTrace();
    const { cells, click } = app();
    act(() => click.invoke([]));
    expect(of("render")).toEqual([]);
    expect(takeCauses(cells.at(-1))).toHaveLength(1);
  });
});
