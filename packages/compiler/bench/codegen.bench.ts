// Code generation: compile time for typical bindings, and the cost of running
// compiled code compared with the same expression written by hand.
// Run with `npm run bench`.
import { test } from "vitest";
// Benchmarks may reach into the runtime (only src/ is bound by package rules).
import { loadBinding } from "../../runtime/src/script/load";
import { compileInterpolation } from "../src/codegen/compile";
import { parseInterpolation } from "../src/script/interpolation";

const BINDINGS = [
  "{$item.name}",
  "Count: {count} of {items.length}",
  "{items.filter(u => u.active).map(u => u.name).join(', ')}",
  "{mediaSize.sizeIndex > 2 ? 'wide' : 'narrow'}",
  "{{ station: 'Brixton', wifi: true, toilets: false }}",
  "{`${$item.firstName} ${$item.lastName}`}",
  "{$props.value ?? '[no value]'}",
  "{formatDate($item.createdAt)}",
];

const SCOPE_NAMES = new Set(["$item", "count", "items", "mediaSize", "$props", "formatDate"]);
const parsed = BINDINGS.map((b) => parseInterpolation(b).segments);

test("compileInterpolation: 8 typical bindings (parsed)", async ({ bench }) => {
  await bench("compile x8", () => {
    for (const segments of parsed) compileInterpolation(segments, { scope: SCOPE_NAMES });
  }).run();
});

test("evaluation: compiled vs hand-written", async ({ bench }) => {
  const items = Array.from({ length: 20 }, (_, i) => ({ name: `user${i}`, active: i % 2 === 0 }));
  const scope = { items, count: 20 };
  const source = "{items.filter(u => u.active).map(u => u.name).join(', ')} ({count})";
  const compiled = loadBinding(compileInterpolation(parseInterpolation(source).segments, { scope: new Set(["items", "count"]) }).code);
  const handWritten = (s: typeof scope) => `${s.items.filter((u) => u.active).map((u) => u.name).join(", ")} (${s.count})`;
  let sink = "";
  await bench("compiled binding", () => {
    sink = compiled(scope) as string;
  }).run();
  await bench("hand-written JS", () => {
    sink = handWritten(scope);
  }).run();
  if (sink.length === 0) throw new Error("unreachable");
});

test("compileModule with and without a source map", async ({ bench }) => {
  const { compileModule } = await import("../src/module/compile-module");
  const markup = `<App var.count="{0}" var.items="{[1, 2, 3]}">
  <Text>Count: {count}</Text>
  <Stack gap="4px">
    <Text value="{items.filter(i => i > count).map(i => i * 2).join(', ')}"/>
    <Button label="Increment" onClick="count++; if (count > 2) items.push(count)"/>
  </Stack>
</App>`;
  await bench("compileModule (source map)", () => {
    compileModule(markup);
  }).run();
  await bench("compileModule (no source map)", () => {
    compileModule(markup, { sourceMap: false });
  }).run();
});
