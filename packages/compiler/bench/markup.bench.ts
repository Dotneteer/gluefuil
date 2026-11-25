// Parser throughput on synthetic but realistic gfui markup.
// Run with `npm run bench`. Vitest 5: benchmarks are tests that use the `bench` fixture.
import { test } from "vitest";
import { parseMarkup } from "../src/markup/parser";

/** A card-like block similar to real app pages: attributes, expressions, text, events. */
function block(i: number): string {
  return `
  <Card var.expanded="{false}" title="Item ${i}" when="{items.length > ${i}}">
    <!-- block ${i} -->
    <HStack gap="$space-2" verticalAlignment="center">
      <Icon name="star" />
      <Text variant="strong">Name: {$item.name} &amp; more</Text>
      <SpaceFiller />
      <Button label="Toggle" onClick="expanded = !expanded" />
    </HStack>
    <Fragment when="{expanded}">
      <Text value="{formatDate($item.createdAt)}" />
      <Button label="Delete">
        <event name="click">
          { deleteItem.execute($item.id); toast('Deleted ${i}'); }
        </event>
      </Button>
    </Fragment>
  </Card>`;
}

function app(blocks: number): string {
  let body = "";
  for (let i = 0; i < blocks; i++) body += block(i);
  return `<App>\n  <DataSource id="items" url="/api/items" />${body}\n</App>\n`;
}

const sizes = [
  ["~10 KB", app(17)],
  ["~100 KB", app(170)],
  ["~1 MB", app(1700)],
] as const;

for (const [label, markup] of sizes) {
  test(`parseMarkup ${label} (${(markup.length / 1024).toFixed(0)} KiB)`, async ({ bench }) => {
    await bench(`parseMarkup ${label}`, () => {
      parseMarkup(markup);
    }).run();
  });
}
