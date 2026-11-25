// Text and Heading (step 16, our own components; XMLUI reference: Text.md,
// Heading.md). Text variants render the semantic element where one exists;
// all styling comes from theme variables (styles.ts).
import { createElement, type CSSProperties, type ReactNode } from "react";
import { useLayout, type LayoutProps } from "./layout";

/** Text variants and the element each renders (default: span). */
export const TEXT_VARIANT_ELEMENTS: Readonly<Record<string, string>> = {
  abbr: "abbr",
  caption: "span",
  cite: "cite",
  code: "code",
  deleted: "del",
  em: "em",
  inserted: "ins",
  keyboard: "kbd",
  marked: "mark",
  mono: "span",
  paragraph: "p",
  placeholder: "span",
  sample: "samp",
  secondary: "span",
  small: "small",
  strong: "strong",
  sub: "sub",
  subheading: "span",
  subtitle: "span",
  sup: "sup",
  title: "span",
  var: "var",
};

/** `maxLines`: a line clamp (with an ellipsis). */
function clamp(maxLines: unknown): CSSProperties | undefined {
  const lines = typeof maxLines === "number" ? maxLines : typeof maxLines === "string" ? Number(maxLines) : NaN;
  if (!Number.isInteger(lines) || lines < 1) return undefined;
  return { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" };
}

const content = (value: unknown, children: ReactNode) => (value !== undefined && value !== null ? String(value) : children);

/** A style from the layout props and a component's own, merged (the component's own win). */
function merge(layout: CSSProperties | undefined, own: CSSProperties | undefined): CSSProperties | undefined {
  return layout && own ? { ...layout, ...own } : (layout ?? own);
}

type TextProps = LayoutProps & { value?: unknown; variant?: unknown; maxLines?: unknown; children?: ReactNode };

export function Text(props: TextProps) {
  const { value, variant, maxLines, children } = props;
  const layout = useLayout(props);
  const name = typeof variant === "string" && Object.hasOwn(TEXT_VARIANT_ELEMENTS, variant) ? variant : undefined;
  return createElement(
    name ? TEXT_VARIANT_ELEMENTS[name]! : "span",
    { className: "gfui-Text", "data-variant": name, ...layout.attributes, style: merge(layout.style, clamp(maxLines)) },
    content(value, children),
  );
}

/** `h3`, `H3` and `3` all mean level 3; anything else is 1. */
export function headingLevel(level: unknown): number {
  const match = /^[hH]?([1-6])$/.exec(String(level ?? ""));
  return match ? Number(match[1]) : 1;
}

type HeadingProps = LayoutProps & { value?: unknown; level?: unknown; maxLines?: unknown; children?: ReactNode };

export function Heading(props: HeadingProps) {
  const { value, level, maxLines, children } = props;
  const layout = useLayout(props);
  const n = headingLevel(level);
  return createElement(
    `h${n}`,
    { className: "gfui-Heading", "data-level": n, ...layout.attributes, style: merge(layout.style, clamp(maxLines)) },
    content(value, children),
  );
}

const shortcut = (n: number) => {
  const H = (props: Omit<HeadingProps, "level">) => createElement(Heading, { ...props, level: n });
  H.displayName = `H${n}`;
  return H;
};

export const H1 = shortcut(1);
export const H2 = shortcut(2);
export const H3 = shortcut(3);
export const H4 = shortcut(4);
export const H5 = shortcut(5);
export const H6 = shortcut(6);
