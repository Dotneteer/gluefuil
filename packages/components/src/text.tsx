// Text and Heading (step 16, our own components; XMLUI reference: Text.md,
// Heading.md). Text variants render the semantic element where one exists;
// all styling comes from theme variables (styles.ts). Step 23 added the text
// overflow props (shared with Link) and the APIs.
import { pointerData, useComponentApi, type PointerData, type RegisterApi, useFrameworkText } from "@gluefuil/runtime";
import { createElement, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { useLayout, type LayoutProps } from "./layout";
import { useTocEntry } from "./toc";

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

export const OVERFLOW_MODES = ["none", "ellipsis", "scroll", "flow"] as const;
export const BREAK_MODES = ["normal", "word", "anywhere", "keep", "hyphenate"] as const;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";

function lineCount(maxLines: unknown): number | undefined {
  const lines = typeof maxLines === "number" ? maxLines : typeof maxLines === "string" ? Number(maxLines) : NaN;
  return Number.isInteger(lines) && lines >= 1 ? lines : undefined;
}

/** The text-overflow props shared by Text, Heading and Link (XMLUI TextReact.tsx 429–540). */
export interface TextOverflowProps {
  maxLines?: unknown;
  overflowMode?: unknown;
  breakMode?: unknown;
  ellipses?: unknown;
  preserveLinebreaks?: unknown;
  inline?: unknown;
}

export interface TextOverflow {
  /** data-overflow (clamp, truncate, none, scroll, flow), data-break, data-preserve-linebreaks, data-inline, data-clip. */
  attributes: Record<string, string>;
  /** The line clamp of a multi-line truncation. */
  style: CSSProperties | undefined;
}

/**
 * The text-overflow props as data attributes (styled in styles.ts TEXT) and a
 * line-clamp style:
 * - `overflowMode` unset: `maxLines` truncates (one line: an ellipsis; more: a clamp);
 * - `ellipsis`: truncates, at `maxLines` or one line; `ellipses="false"` clips instead;
 * - `none` (one line, clipped), `scroll` (one line, scrolls), `flow` (wraps, scrolls vertically) ignore `maxLines`;
 * - `inline` ignores all of them (it has no block to clip), but not `breakMode`.
 */
export function textOverflow(props: TextOverflowProps): TextOverflow {
  const attributes: Record<string, string> = {};
  let style: CSSProperties | undefined;
  const { overflowMode, breakMode } = props;
  const lines = lineCount(props.maxLines);
  const inline = isTrue(props.inline);
  if (inline) attributes["data-inline"] = "";
  else if (overflowMode === "none" || overflowMode === "scroll" || overflowMode === "flow") attributes["data-overflow"] = overflowMode;
  else if (overflowMode === "ellipsis" || lines !== undefined) {
    if (lines !== undefined && lines > 1) {
      attributes["data-overflow"] = "clamp";
      style = { WebkitLineClamp: lines };
    } else attributes["data-overflow"] = "truncate";
    if (isFalse(props.ellipses)) attributes["data-clip"] = "";
  }
  if (typeof breakMode === "string" && (BREAK_MODES as readonly string[]).includes(breakMode)) attributes["data-break"] = breakMode;
  if (isTrue(props.preserveLinebreaks)) attributes["data-preserve-linebreaks"] = "";
  return { attributes, style };
}

const content = (value: unknown, children: ReactNode) => (value !== undefined && value !== null ? String(value) : children);

/** A style from the layout props and a component's own, merged (the component's own win). */
export function mergeStyles(layout: CSSProperties | undefined, own: CSSProperties | undefined): CSSProperties | undefined {
  return layout && own ? { ...layout, ...own } : (layout ?? own);
}

/** Whether an element's content is cut off (XMLUI's `hasOverflow()`). */
function overflows(element: HTMLElement | null): boolean {
  return element !== null && (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight);
}

function useOverflowApi(registerApi: RegisterApi | undefined, ref: RefObject<HTMLElement | null>, extra?: Record<string, () => unknown>) {
  const api = useMemo(() => ({ hasOverflow: () => overflows(ref.current), ...extra }), [ref, extra]);
  useComponentApi(registerApi, api);
}

type TextProps = LayoutProps &
  TextOverflowProps & { value?: unknown; variant?: unknown; registerApi?: RegisterApi; onContextMenu?: (ev?: unknown) => unknown; children?: ReactNode };

export function Text(props: TextProps) {
  const { value, variant, registerApi, onContextMenu, children } = props;
  const layout = useLayout(props);
  const overflow = textOverflow(props);
  const ref = useRef<HTMLElement>(null);
  useOverflowApi(registerApi, ref);
  const name = typeof variant === "string" && Object.hasOwn(TEXT_VARIANT_ELEMENTS, variant) ? variant : undefined;
  return createElement(
    name ? TEXT_VARIANT_ELEMENTS[name]! : "span",
    {
      ref,
      className: "gfui-Text",
      "data-variant": name,
      ...overflow.attributes,
      ...layout.attributes,
      style: mergeStyles(layout.style, overflow.style),
      onContextMenu: contextMenuHandler(onContextMenu),
    },
    content(value, children),
  );
}

/**
 * A `contextMenu` handler replaces the browser's menu. It gets the pointer
 * snapshot, never the DOM event (the sandbox invariant; step 27).
 */
export function contextMenuHandler(handler: unknown) {
  if (typeof handler !== "function") return undefined;
  return (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void (handler as (ev: PointerData) => unknown)(pointerData(event));
  };
}

/** `h3`, `H3` and `3` all mean level 3; anything else is 1. */
export function headingLevel(level: unknown): number {
  const match = /^[hH]?([1-6])$/.exec(String(level ?? ""));
  return match ? Number(match[1]) : 1;
}

/**
 * A heading's anchor id from its text (XMLUI: lowercase, spaces to dashes,
 * other punctuation removed), so `#getting-started` links to "Getting started".
 */
export function headingId(text: unknown): string | undefined {
  if (typeof text !== "string" && typeof text !== "number") return undefined;
  const id = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
  return id === "" ? undefined : id;
}

/** The text of React children made of strings and numbers (for an anchor id). */
function childrenText(children: ReactNode): string | undefined {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children) && children.every((child) => typeof child === "string" || typeof child === "number")) return children.join("");
  return undefined;
}

type HeadingProps = LayoutProps &
  TextOverflowProps & {
    value?: unknown;
    level?: unknown;
    showAnchor?: unknown;
    omitFromToc?: unknown;
    registerApi?: RegisterApi;
    /** Internal (Markdown): the text for the anchor id when the children are elements. */
    $$anchorText?: string;
    children?: ReactNode;
  };

export function Heading(props: HeadingProps) {
  const t = useFrameworkText();
  const { value, level, showAnchor, registerApi, children } = props;
  const layout = useLayout(props);
  const overflow = textOverflow(props);
  const ref = useRef<HTMLHeadingElement>(null);
  const scroll = useMemo(() => ({ scrollIntoView: () => ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }) }), []);
  useOverflowApi(registerApi, ref, scroll);
  const n = headingLevel(level);
  const text = content(value, children);
  // Step 32: every heading with text has an anchor id (XMLUI), and is in the table of contents unless omitFromToc.
  const plain = props.$$anchorText ?? (typeof text === "string" ? text : childrenText(text));
  const id = headingId(plain);
  useTocEntry(ref, id, n, plain?.trim(), isTrue(props.omitFromToc));
  const anchor = isTrue(showAnchor) ? id : undefined;
  return createElement(
    `h${n}`,
    {
      ref,
      id,
      className: "gfui-Heading",
      "data-level": n,
      ...overflow.attributes,
      ...layout.attributes,
      style: mergeStyles(layout.style, overflow.style),
    },
    text,
    anchor === undefined
      ? null
      : createElement("a", { className: "gfui-Heading-anchor", href: `#${anchor}`, onClick: scrollToHeading, "aria-label": t("gfui.aria.headingLink"), key: "anchor" }, "#"),
  );
}

/**
 * A heading anchor's click scrolls to the heading. Following `#id` would be a
 * route change under hash routing, so the browser's default is prevented.
 */
function scrollToHeading(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  event.currentTarget.parentElement?.scrollIntoView({ block: "start", behavior: "smooth" });
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
