// The layout system (steps 19D–19E; design: .ai/plan/poc-19d-layout.md).
//
//   LayoutContext   what a container tells what is inside it: its nesting
//                   level, whether it has a single child (then that child is a
//                   wrapper and keeps the level), the density shift, and its
//                   orientation and wrapping (for star sizes and percentages)
//   useLayout       the layout props (width, padding, …) of any component as a
//                   style and data-* attributes
//   Stack           the one layout container; VStack, HStack, CVStack and
//                   CHStack are compile-time aliases of it
//   SpaceFiller     the free space, or a line break in a wrapping stack
//
// The spacing itself is CSS (styles.ts LAYOUT): a container renders
// data-level (0–3) and data-orientation, and the rules map them to the
// space-level* theme variables. Nothing is measured, so a server render is
// right at every width.
import { createContext, createElement, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import { LAYOUT_PROP_NAMES, layoutCss, starShares } from "./layout-metadata";

export interface LayoutContextValue {
  /** The nesting level of the nearest container (the App content is 0). Not clamped. */
  level: number;
  /** The container has exactly one child: a container in it keeps `level` (the wrapper rule). */
  single: boolean;
  /** The density shift in effect: compact +1, comfortable −1. */
  shift: number;
  /** The nearest container's orientation and wrapping: how a star size or a percentage applies. */
  orientation: "vertical" | "horizontal";
  wrap: boolean;
}

/** Outside any container: the first container is the page (level 0). */
const ROOT: LayoutContextValue = { level: -1, single: false, shift: 0, orientation: "vertical", wrap: false };

export const LayoutContext = createContext<LayoutContextValue>(ROOT);

/** The highest level with values of its own (space-level0 … space-level3). */
export const MAX_LEVEL = 3;

const clampLevel = (level: number) => Math.min(MAX_LEVEL, Math.max(0, level));

/**
 * How many children a container renders from `children`, counted up to 2 (all
 * the wrapper rule needs): null, undefined and booleans are none, arrays are
 * their items. Cheaper than Children.toArray, which copies every element.
 */
export function childCount(children: ReactNode): number {
  if (children === null || children === undefined || typeof children === "boolean") return 0;
  if (!Array.isArray(children)) return 1;
  let count = 0;
  for (const child of children as ReactNode[]) {
    count += childCount(child);
    if (count >= 2) return 2;
  }
  return count;
}

/**
 * Provides a container's context to its children. `Page` and `Items` use it
 * too: they render several roots from one element, so a container's single
 * child may still have siblings in the DOM.
 */
export function LayoutScope({ value, children }: { value: LayoutContextValue; children?: ReactNode }) {
  return createElement(LayoutContext.Provider, { value }, children);
}

/** `Page`: its content is what the container above it holds. */
export function useRecountedScope(children: ReactNode): LayoutContextValue {
  const parent = useContext(LayoutContext);
  const single = parent.single && childCount(children) === 1;
  return useMemo(() => (single === parent.single ? parent : { ...parent, single }), [parent, single]);
}

/** `Items`: any number of items, so none of them is a wrapper. */
export function useMultipleScope(): LayoutContextValue {
  const parent = useContext(LayoutContext);
  return useMemo(() => (parent.single ? { ...parent, single: false } : parent), [parent]);
}

/** Bars (AppHeader, Footer, the NavPanel): their content starts at the deepest level. */
export const BAR_SCOPE: LayoutContextValue = { level: MAX_LEVEL - 1, single: false, shift: 0, orientation: "horizontal", wrap: false };

/** The App content: the page, level 0. */
export function pageScope(single: boolean): LayoutContextValue {
  return { level: 0, single, shift: 0, orientation: "vertical", wrap: false };
}

export type LayoutProps = Record<string, unknown> & { $$layoutFrom?: Record<string, unknown> };

export interface LayoutResult {
  style: CSSProperties | undefined;
  /** data-* attributes: data-surface (a background or a border). */
  attributes: Record<string, string>;
}

const PADDING_SIDES: Record<string, readonly string[]> = {
  paddingHorizontal: ["paddingLeft", "paddingRight"],
  paddingVertical: ["paddingTop", "paddingBottom"],
};

/**
 * The layout props as CSS. `$$layoutFrom` holds the layout props given to a
 * user component's tag; its root element applies them, and they win over the
 * root's own (the use site is more specific).
 */
const NONE: LayoutResult = Object.freeze({ style: undefined, attributes: Object.freeze({}) as Record<string, string> });

export function layoutStyle(props: LayoutProps, parent: LayoutContextValue): LayoutResult {
  let values: Record<string, unknown> | undefined;
  const outerValues = props.$$layoutFrom;
  for (const name of LAYOUT_PROP_NAMES) {
    const outer = outerValues?.[name];
    const value = outer !== undefined && outer !== null && outer !== "" ? outer : props[name];
    if (value !== undefined && value !== null && value !== "") (values ??= {})[name] = value;
  }
  // The common case: no layout props, nothing to compute (and nothing allocated).
  if (values === undefined) return NONE;
  const style: Record<string, string | number> = {};
  const attributes: Record<string, string> = {};
  const horizontal = parent.orientation === "horizontal";
  const size = (name: "width" | "height", mainAxis: boolean) => {
    const value = values[name];
    if (value === undefined) return;
    const shares = starShares(value);
    if (shares !== undefined) {
      // A share of the free space on the main axis; stretched on the other one.
      if (mainAxis) {
        style.flex = `${shares} 1 0px`;
        style[name === "width" ? "minWidth" : "minHeight"] = 0;
      } else style.alignSelf = "stretch";
      return;
    }
    const css = layoutCss(value)!;
    // A percentage width in a flow: gap-aware, and 100% on phones. Inline, as a
    // style is what every component (Mantine's too) puts on its root element.
    if (name === "width" && parent.wrap && /^\d+(\.\d+)?%$/.test(css)) {
      style.width = flowWidth(css, String(Number.parseFloat(css) / 100));
      style.flexShrink = 0;
      return;
    }
    style[name] = css;
    // A fixed size keeps it; percentages may shrink, so ones that add up to 100% fit with the gaps.
    if (mainAxis && !css.endsWith("%")) style.flexShrink = 0;
  };
  size("width", horizontal);
  size("height", !horizontal);
  for (const name of ["minWidth", "maxWidth", "minHeight", "maxHeight", "borderRadius", "backgroundColor", "border", "padding"]) {
    if (values[name] !== undefined) style[name] = layoutCss(values[name])!;
  }
  for (const name of ["paddingHorizontal", "paddingVertical", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
    if (values[name] === undefined) continue;
    for (const side of PADDING_SIDES[name] ?? [name]) style[side] = layoutCss(values[name])!;
  }
  if (values.backgroundColor !== undefined || values.border !== undefined) attributes["data-surface"] = "";
  return { style: Object.keys(style).length > 0 ? (style as CSSProperties) : undefined, attributes };
}

/**
 * The width of a percentage-sized item in a flow: `W - gap × (1 − W/100%)`, so
 * items adding up to 100% fill a row exactly with the gaps between them; 100%
 * on phones. `--pfui-flow-gap` and `--pfui-flow-wide` (1, or 0 on phones) come
 * from the wrapping stack (styles.ts LAYOUT).
 */
export function flowWidth(width: string, fraction: string): string {
  return `calc((${width} - var(--pfui-flow-gap) * ${1 - Number(fraction)}) * var(--pfui-flow-wide) + 100% * (1 - var(--pfui-flow-wide)))`;
}

/** `layoutStyle` in the current layout context. */
export function useLayout(props: LayoutProps): LayoutResult {
  return layoutStyle(props, useContext(LayoutContext));
}

/** Strips the layout props, for a component that forwards the rest. */
export function withoutLayoutProps<P extends Record<string, unknown>>(props: P): P {
  const rest: Record<string, unknown> = { ...props };
  for (const name of LAYOUT_PROP_NAMES) delete rest[name];
  delete rest.$$layoutFrom;
  return rest as P;
}

const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
const isTrue = (value: unknown) => value === true || value === "true";
const DENSITY_SHIFT: Record<string, number> = { compact: 1, normal: 0, comfortable: -1 };

/** The props of Stack (and of VStack, HStack, CVStack, CHStack, which the compiler turns into it). */
export interface StackProps extends LayoutProps {
  orientation?: unknown;
  gap?: unknown;
  horizontalAlignment?: unknown;
  verticalAlignment?: unknown;
  wrapContent?: unknown;
  itemWidth?: unknown;
  reverse?: unknown;
  density?: unknown;
  children?: ReactNode;
}

/**
 * The layout container. Its level is one deeper than the container around it,
 * unless it is that container's only child (a wrapper groups nothing). The
 * gap and the padding follow from the level (styles.ts LAYOUT) unless set.
 */
export function Stack(props: StackProps) {
  const { orientation, gap, horizontalAlignment, verticalAlignment, wrapContent, itemWidth, reverse, density, children } = props;
  const parent = useContext(LayoutContext);
  const horizontal = orientation === "horizontal";
  const wrap = isTrue(wrapContent);
  const level = Math.max(0, parent.single ? parent.level : parent.level + 1);
  const shift = typeof density === "string" && Object.hasOwn(DENSITY_SHIFT, density) ? DENSITY_SHIFT[density]! : parent.shift;
  const single = childCount(children) === 1;
  const scope = useMemo<LayoutContextValue>(
    () => ({ level, single, shift, orientation: horizontal ? "horizontal" : "vertical", wrap }),
    [level, single, shift, horizontal, wrap],
  );
  const { style, attributes } = layoutStyle(props, parent);
  const own: Record<string, string> = {
    flexDirection: `${horizontal ? "row" : "column"}${isTrue(reverse) ? "-reverse" : ""}`,
  };
  // Main axis → justify-content, cross axis → align-items.
  const main = horizontal ? horizontalAlignment : verticalAlignment;
  const cross = horizontal ? verticalAlignment : horizontalAlignment;
  if (typeof main === "string" && main !== "stretch" && Object.hasOwn(ALIGN, main)) own.justifyContent = ALIGN[main]!;
  if (typeof cross === "string" && Object.hasOwn(ALIGN, cross)) own.alignItems = ALIGN[cross]!;
  const gapCss = layoutCss(gap);
  // Inline, so it wins over the ladder (and over gap-Stack) on this stack only.
  if (gapCss !== undefined) own["--pfui-gap"] = gapCss;
  const itemWidthCss = wrap ? layoutCss(itemWidth) : undefined;
  if (itemWidthCss !== undefined) {
    own["--pfui-item-width"] = itemWidthCss;
    own["--pfui-item-fraction"] = /%$/.test(itemWidthCss) ? String(Number.parseFloat(itemWidthCss) / 100) : "1";
  }
  return (
    <div
      className="pfui-Stack"
      data-orientation={horizontal ? "horizontal" : "vertical"}
      data-level={clampLevel(level + shift)}
      data-wrap={wrap ? "" : undefined}
      data-item-width={itemWidthCss === undefined ? undefined : itemWidthCss.endsWith("%") ? "%" : "fixed"}
      {...attributes}
      style={{ ...own, ...style } as CSSProperties}
    >
      <LayoutScope value={scope}>{children}</LayoutScope>
    </div>
  );
}

/** The free space of a stack (pushes what follows to the end); a line break in a wrapping stack. */
export function SpaceFiller(props: LayoutProps) {
  const { style, attributes } = useLayout(props);
  return <div className="pfui-SpaceFiller" {...attributes} style={style} />;
}
