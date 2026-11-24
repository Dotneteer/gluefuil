// Layout props and their values (steps 19D–19E; design: .ai/plan/poc-19d-layout.md).
// React-free: the compiler checks literal values with it (E031), the
// components convert values to CSS with it (layout.tsx).

/** What a layout value is: the compiler checks literals by it, the runtime converts by it. */
export type LayoutValueKind = "size" | "spacing" | "color" | "border";

export interface LayoutPropMetadata {
  description: string;
  cssKind: LayoutValueKind;
  /** Star sizes (`*`, `2*`) are allowed: a share of the free space in a stack. */
  star?: boolean;
}

const size = (description: string, star = false): LayoutPropMetadata => ({ description, cssKind: "size", ...(star ? { star } : {}) });
const spacing = (description: string): LayoutPropMetadata => ({ description, cssKind: "spacing" });

/**
 * The layout props every visual component accepts (unless its metadata says
 * `layoutProps: false`). Margins are left out on purpose (XMLUI's "last
 * resort", website/content/docs/pages/layout.md § Paddings and gaps).
 */
export const LAYOUT_PROPS: Readonly<Record<string, LayoutPropMetadata>> = {
  width: size("The width: a length, a percentage of the parent, or a star size (*, 2*) in a horizontal stack.", true),
  height: size("The height: a length, a percentage of the parent, or a star size (*, 2*) in a vertical stack.", true),
  minWidth: size("The smallest width."),
  maxWidth: size("The largest width."),
  minHeight: size("The smallest height."),
  maxHeight: size("The largest height."),
  padding: spacing("The space inside the edges: one to four values, as in CSS. Stacks get it automatically when they are surfaces."),
  paddingHorizontal: spacing("The space inside the left and right edges."),
  paddingVertical: spacing("The space inside the top and bottom edges."),
  paddingTop: spacing("The space inside the top edge."),
  paddingRight: spacing("The space inside the right edge."),
  paddingBottom: spacing("The space inside the bottom edge."),
  paddingLeft: spacing("The space inside the left edge."),
  backgroundColor: { description: "The background color. A stack with a background is a surface: it gets inner padding.", cssKind: "color" },
  border: { description: "The border, as in CSS (1px solid $borderColor). A stack with a border is a surface.", cssKind: "border" },
  borderRadius: size("The radius of the corners."),
};

export const LAYOUT_PROP_NAMES: readonly string[] = Object.keys(LAYOUT_PROPS);

/** `*`, `2*`: a share of the free space. */
export const STAR_SIZE = /^\s*(\d*)\*\s*$/;

/** The number of shares of a star size, or undefined. */
export function starShares(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = STAR_SIZE.exec(value);
  if (!match) return undefined;
  return match[1] === "" ? 1 : Number(match[1]);
}

/** A plain number means pixels (XMLUI's rule for size values). */
const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;
const LENGTH = /^-?(\d+\.?\d*|\.\d+)(px|em|rem|%|vh|vw|dvh|dvw|svh|svw|lvh|lvw|ch|ex|vmin|vmax|pt|cm|mm|in)$/;
const SIZE_KEYWORDS = new Set(["auto", "none", "fit-content", "min-content", "max-content"]);
const THEME_REF = /\$([a-zA-Z][a-zA-Z0-9_]*(?:-{1,2}[a-zA-Z0-9_]+)*)/g;

/** The `$name` references in a value. */
export function themeRefs(text: string): string[] {
  return [...text.matchAll(THEME_REF)].map((match) => match[1]!);
}

function isLengthToken(token: string): boolean {
  if (NUMBER.test(token) || LENGTH.test(token)) return true;
  if (/^\$[a-zA-Z]/.test(token)) return true;
  if (/^(calc|min|max|clamp|var)\(.*\)$/.test(token)) return true;
  return false;
}

/**
 * Why a literal layout value is invalid, or undefined when it is fine (E031).
 * `isKnown` tells whether a `$name` is a theme variable.
 */
export function checkLayoutValue(
  prop: { cssKind: LayoutValueKind; star?: boolean },
  text: string,
  isKnown: (name: string) => boolean,
): string | undefined {
  const value = text.trim();
  if (value === "") return "expected a value";
  const unknown = themeRefs(value).find((name) => !isKnown(name));
  if (unknown !== undefined) return `'$${unknown}' is not a theme variable`;
  switch (prop.cssKind) {
    case "size":
      if (STAR_SIZE.test(value)) return prop.star ? undefined : "a star size is allowed only in width and height";
      if (SIZE_KEYWORDS.has(value) || isLengthToken(value)) return undefined;
      return "expected a length (16px, 2rem, 50%, 16), a star size (*, 2*) or a theme variable ($space-4)";
    case "spacing": {
      const tokens = value.split(/\s+/);
      if (tokens.length > 4) return "expected one to four lengths";
      if (tokens.every((token) => token === "auto" || isLengthToken(token))) return undefined;
      return "expected lengths (16px, 1rem, 16) or theme variables ($space-4)";
    }
    default:
      return undefined;
  }
}

/** A layout value as CSS: numbers are pixels, `$name` is the theme variable. */
export function layoutCss(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "" || value === false) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? `${value}px` : undefined;
  const text = String(value).trim();
  return text
    .split(/(\s+)/)
    .map((token) => (NUMBER.test(token) && token !== "0" ? `${token}px` : token))
    .join("")
    .replace(THEME_REF, (_, name: string) => `var(--pfui-${name})`);
}
