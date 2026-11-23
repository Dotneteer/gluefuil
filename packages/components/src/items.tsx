// Items: renders `data` through its item template (XMLUI Items), with no
// wrapper element. The template receives $item, $itemIndex, $isFirst, $isLast.
import type { TemplateRenderer } from "@patchfuil/runtime";

export function Items({
  data,
  reverse,
  itemTemplate,
}: {
  data?: unknown;
  reverse?: unknown;
  itemTemplate?: TemplateRenderer;
}) {
  if (!itemTemplate || !Array.isArray(data)) return null;
  const items = reverse === true || reverse === "true" ? [...data].reverse() : data;
  const last = items.length - 1;
  return items.map((item, index) =>
    itemTemplate({ $item: item, $itemIndex: index, $isFirst: index === 0, $isLast: index === last }, index),
  );
}
