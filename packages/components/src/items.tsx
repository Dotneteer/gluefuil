// Items: renders `data` through its item template (XMLUI Items), with no
// wrapper element. The template receives $item, $itemIndex, $isFirst, $isLast.
import type { TemplateRenderer } from "@patchfuil/runtime";
import { DataUrl, isDataUrl } from "./data";
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
  // `data="/api/users"`: loaded like a DataSource without an id (step 20).
  if (isDataUrl(data)) return <DataUrl url={data} render={(value) => <Items data={value} reverse={reverse} itemTemplate={itemTemplate} />} />;
  if (!itemTemplate || !Array.isArray(data)) return null;
  const items = reverse === true || reverse === "true" ? [...data].reverse() : data;
  const last = items.length - 1;
  return (
    <LayoutScope value={scope}>
      {items.map((item, index) => itemTemplate({ $item: item, $itemIndex: index, $isFirst: index === 0, $isLast: index === last }, index))}
    </LayoutScope>
  );
}
