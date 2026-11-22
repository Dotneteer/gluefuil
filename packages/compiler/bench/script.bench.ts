// Script parser throughput: typical binding expressions and handlers.
// Run with `npm run bench`.
import { test } from "vitest";
import { parseInterpolation } from "../src/script/interpolation";
import { parseStatements } from "../src/script/parse";

const BINDINGS = [
  "{$item.name}",
  "Count: {count} of {items.length}",
  "{users.value.filter(u => u.active).map(u => u.name).join(', ')}",
  "{mediaSize.sizeIndex > 2 ? 'wide' : 'narrow'}",
  "{{ station: 'Brixton', wifi: true, toilets: false }}",
  "{`${$item.firstName} ${$item.lastName}`}",
  "{$props.value ?? '[no value]'}",
  "{formatDate($item.createdAt)}",
];

const HANDLER = `
  const selected = items.value.filter(item => item.selected);
  if (selected.length === 0) {
    toast('Nothing selected');
    return;
  }
  for (const item of selected) {
    try {
      deleteItem.execute(item.id);
    } catch (error) {
      toast.error(\`Could not delete \${item.name}: \${error.message}\`);
    }
  }
  items.refetch();
`;

test("parseInterpolation: 8 typical bindings", async ({ bench }) => {
  await bench("parseInterpolation x8", () => {
    for (const binding of BINDINGS) parseInterpolation(binding);
  }).run();
});

test("parseStatements: a 15-line handler", async ({ bench }) => {
  await bench("parseStatements handler", () => {
    parseStatements(HANDLER);
  }).run();
});
