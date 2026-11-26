// Items: renders `data` through its item template (XMLUI Items), with no
// wrapper element. The template receives $item, $itemIndex, $isFirst, $isLast.
// Step 31: an object's values are the items (XMLUI's orderedKeys order), and an
// instance is keyed by its item's id (decision F, .ai/plan/poc-31-tree-tilegrid.md).
import type { TemplateRenderer } from "@gluefuil/runtime";
import { DataUrl, isDataUrl } from "./data";
import { LayoutScope, useMultipleScope } from "./layout";

/** Integer keys ascending, then the other strings in insertion order (XMLUI components-core/utils/orderedKeys.ts). */
export function orderedValues(data: object): unknown[] {
  const numeric: string[] = [];
  const other: string[] = [];
  for (const key of Object.keys(data)) {
    const n = Number(key);
    if (key.trim() !== "" && Number.isInteger(n) && n >= 0 && String(n) === key) numeric.push(key);
    else other.push(key);
  }
  numeric.sort((a, b) => Number(a) - Number(b));
  return [...numeric, ...other].map((key) => (data as Record<string, unknown>)[key]);
}

/** The items of `data`: an array, or an object's values; else none. */
export function itemsOf(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") return orderedValues(data);
  return undefined;
}

/**
 * The instances' keys: the item's `$id`, `id` or `key` (the fields XMLUI looks
 * up), else its position; a repeated id falls back to the position. State stays
 * with its item through inserts and moves; a new identity remounts.
 */
export function itemKeys(items: readonly unknown[]): string[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    if (item !== null && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const id = record.$id ?? record.id ?? record.key;
      if (id !== undefined && id !== null && id !== "") {
        const key = `id:${String(id)}`;
        if (!seen.has(key)) {
          seen.add(key);
          return key;
        }
      }
    }
    return `#${index}`;
  });
}

export function Items({
  data,
  reverse,
  itemTemplate,
}: {
  data?: unknown;
  reverse?: unknown;
  itemTemplate?: TemplateRenderer;
}) {
  // Any number of items: none of them is a layout wrapper (layout.tsx).
  const scope = useMultipleScope();
  // `data="/api/users"`: loaded like a DataSource without an id (step 20).
  if (isDataUrl(data)) return <DataUrl url={data} render={(value) => <Items data={value} reverse={reverse} itemTemplate={itemTemplate} />} />;
  const list = itemsOf(data);
  if (!itemTemplate || !list) return null;
  const items = reverse === true || reverse === "true" ? [...list].reverse() : list;
  const keys = itemKeys(items);
  const last = items.length - 1;
  return (
    <LayoutScope value={scope}>
      {items.map((item, index) => itemTemplate({ $item: item, $itemIndex: index, $isFirst: index === 0, $isLast: index === last }, keys[index]))}
    </LayoutScope>
  );
}
