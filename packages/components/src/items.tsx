// Items: renders `data` through its item template (XMLUI Items), with no
// wrapper element. The template receives $item, $itemIndex, $isFirst, $isLast.
import type { TemplateRenderer } from "@patchfuil/runtime";
import { LayoutScope, useMultipleScope } from "./layout";

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
  if (!itemTemplate || !Array.isArray(data)) return null;
  const items = reverse === true || reverse === "true" ? [...data].reverse() : data;
  const last = items.length - 1;
  return (
    <LayoutScope value={scope}>
      {items.map((item, index) => itemTemplate({ $item: item, $itemIndex: index, $isFirst: index === 0, $isLast: index === last }, index))}
    </LayoutScope>
  );
}
