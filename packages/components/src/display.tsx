// Display components (step 23; design: .ai/plan/poc-23-display.md): Image,
// Avatar, Badge, ProgressBar, Spinner, ContentSeparator (on Mantine) and Card
// (our own: a Stack that is a surface of the spacing ladder). Their look comes
// from theme variables only (styles.ts DISPLAY); Mantine's own variables are
// overridden there by unlayered rules.
import { Avatar as MantineAvatar, Badge as MantineBadge, Divider, Image as MantineImage, Loader, Progress } from "@mantine/core";
import { pointerData, useComponentApi, type RegisterApi, useFrameworkText } from "@gluefuil/runtime";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { layoutCss } from "./layout-metadata";
import { Stack, useLayout, type LayoutProps } from "./layout";
import { Link } from "./routing";
import { contextMenuHandler, Heading, mergeStyles, Text } from "./text";

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown) => (value === undefined || value === null ? undefined : String(value));

/** A number from a bound value or a literal string; undefined when it isn't one. */
function toNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The handlers of a clickable element: a click and Enter or Space (it gets
 * `role="button"` and a tab stop). Script gets the pointer snapshot, never the
 * DOM event (the sandbox invariant; step 27).
 */
function clickable(onClick: unknown): Record<string, unknown> {
  if (typeof onClick !== "function") return {};
  const run = (event: unknown) => void (onClick as (ev: unknown) => unknown)(pointerData(event));
  return {
    role: "button",
    tabIndex: 0,
    "data-clickable": "",
    onClick: run,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      run(event);
    },
  };
}

// --- Image ----------------------------------------------------------------

const ASPECT_RATIO = /^\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?$/;

type ImageProps = LayoutProps & {
  src?: unknown;
  data?: unknown;
  alt?: unknown;
  fit?: unknown;
  aspectRatio?: unknown;
  lazyLoad?: unknown;
  inline?: unknown;
  grayscale?: unknown;
  onClick?: (ev?: unknown) => unknown;
};

/**
 * A Blob's object URL while it is shown (step 32B: Image `data`, XMLUI
 * ImageReact.tsx 50–70); revoked when the Blob changes or the image unmounts.
 * After mount only: a static render has no Blob URL.
 */
function useBlobUrl(data: unknown): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (typeof Blob === "undefined" || !(data instanceof Blob)) {
      setUrl(undefined);
      return undefined;
    }
    const created = URL.createObjectURL(data);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [data]);
  return url;
}

/** `Image`: `src`, else `data` (a File or Blob); nothing without either. `fit`: contain (default) or cover. */
export function Image(props: ImageProps) {
  const { src, data, alt, fit, aspectRatio, lazyLoad, inline, grayscale, onClick } = props;
  const layout = useLayout(props);
  const blobUrl = useBlobUrl(text(src) ? undefined : data);
  const source = text(src) ?? blobUrl;
  if (!source) return null;
  const ratio = text(aspectRatio);
  const own: CSSProperties | undefined = ratio !== undefined && ASPECT_RATIO.test(ratio) ? { aspectRatio: ratio } : undefined;
  return (
    <MantineImage
      className="gfui-Image"
      src={source}
      alt={text(alt) ?? ""}
      fit={fit === "cover" ? "cover" : "contain"}
      loading={isTrue(lazyLoad) ? "lazy" : undefined}
      data-inline={isTrue(inline) ? "" : undefined}
      data-grayscale={isTrue(grayscale) ? "" : undefined}
      {...layout.attributes}
      {...clickable(onClick)}
      style={mergeStyles(layout.style, own)}
    />
  );
}

// --- Avatar ---------------------------------------------------------------

/** Up to three uppercase initials of a name (XMLUI AvatarReact.tsx abbreviateName). */
export function initials(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const result = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 3)
    .join("");
  return result === "" ? undefined : result;
}

export const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

type AvatarProps = LayoutProps & { name?: unknown; url?: unknown; size?: unknown; onClick?: (ev?: unknown) => unknown; onContextMenu?: (ev?: unknown) => unknown };

/**
 * `Avatar`: the image at `url`; the initials of `name` without one, or when it
 * fails to load (Mantine shows its placeholder on an error).
 */
export function Avatar(props: AvatarProps) {
  const { name, url, size, onClick, onContextMenu } = props;
  const layout = useLayout(props);
  const named = typeof size === "string" && (AVATAR_SIZES as readonly string[]).includes(size);
  const custom = named ? undefined : layoutCss(size);
  const own = custom === undefined ? undefined : ({ "--gfui-avatar-size": custom } as CSSProperties);
  const label = typeof name === "string" && name.trim() !== "" ? `Avatar of ${name}` : "Avatar";
  // The URL that failed to load. Mantine's own error state is reset by an effect after mount, so
  // an image that fails before it (a cached 404, a bad data: URL) would stay broken.
  const [failed, setFailed] = useState<string>();
  const source = text(url);
  return (
    <MantineAvatar
      className="gfui-Avatar"
      src={source !== undefined && source !== failed ? source : null}
      imageProps={{ onError: () => setFailed(source) }}
      alt={label}
      aria-label={label}
      role="img"
      data-size={named ? size : custom === undefined ? "sm" : "custom"}
      {...layout.attributes}
      {...clickable(onClick)}
      onContextMenu={contextMenuHandler(onContextMenu)}
      style={mergeStyles(layout.style, own)}
    >
      {initials(name) ?? <span aria-hidden="true" />}
    </MantineAvatar>
  );
}

// --- Badge ----------------------------------------------------------------

/** A `colorMap` entry: a color (the background), or `{ label, background }` (text and background). */
function badgeColors(colorMap: unknown, key: string | undefined): CSSProperties | undefined {
  if (key === undefined || colorMap === null || typeof colorMap !== "object" || !Object.hasOwn(colorMap, key)) return undefined;
  const entry = (colorMap as Record<string, unknown>)[key];
  if (typeof entry === "string") return { "--gfui-badge-bg": layoutCss(entry) } as CSSProperties;
  if (entry === null || typeof entry !== "object") return undefined;
  const { label, background } = entry as { label?: unknown; background?: unknown };
  const style: Record<string, string> = {};
  const color = typeof label === "string" ? layoutCss(label) : undefined;
  const bg = typeof background === "string" ? layoutCss(background) : undefined;
  if (color !== undefined) style["--gfui-badge-color"] = color;
  if (bg !== undefined) style["--gfui-badge-bg"] = bg;
  return style as CSSProperties;
}

type BadgeProps = LayoutProps & { value?: unknown; variant?: unknown; colorMap?: unknown; onContextMenu?: (ev?: unknown) => unknown; children?: ReactNode };

/** `Badge`: `value` or the children; `variant` badge (default) or pill; `colorMap` colors it by its value. */
export function Badge(props: BadgeProps) {
  const { value, variant, colorMap, onContextMenu, children } = props;
  const layout = useLayout(props);
  const label = text(value);
  return (
    <MantineBadge
      className="gfui-Badge"
      data-shape={variant === "pill" ? "pill" : "badge"}
      {...layout.attributes}
      onContextMenu={contextMenuHandler(onContextMenu)}
      style={mergeStyles(layout.style, badgeColors(colorMap, label))}
    >
      {label ?? children ?? " "}
    </MantineBadge>
  );
}

// --- ProgressBar ----------------------------------------------------------

/** `ProgressBar`: `value` from 0 to 1, clamped; a full bar takes the complete color. */
export function ProgressBar(props: LayoutProps & { value?: unknown }) {
  const layout = useLayout(props);
  const value = Math.min(1, Math.max(0, toNumber(props.value) ?? 0));
  return (
    <Progress
      className="gfui-ProgressBar"
      value={value * 100}
      data-complete={value >= 1 ? "" : undefined}
      {...layout.attributes}
      style={layout.style}
    />
  );
}

// --- Spinner --------------------------------------------------------------

/**
 * `Spinner`: shows after `delay` ms (default 400, as XMLUI), so a quick
 * operation shows none; `fullScreen` covers the viewport. With a delay, the
 * server renders nothing (the client shows it after hydration).
 */
export function Spinner(props: LayoutProps & { delay?: unknown; fullScreen?: unknown }) {
  const t = useFrameworkText();
  const layout = useLayout(props);
  const delay = Math.max(0, toNumber(props.delay) ?? 400);
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return undefined;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  if (!visible) return null;
  const spinner = <Loader className="gfui-Spinner" aria-label={t("gfui.aria.loading")} role="status" {...layout.attributes} style={layout.style} />;
  return isTrue(props.fullScreen) ? <div className="gfui-Spinner-fullScreen">{spinner}</div> : spinner;
}

// --- ContentSeparator -----------------------------------------------------

/**
 * `ContentSeparator`: a line, horizontal (default) or vertical. `thickness`
 * and `length` override the theme's (a vertical one stretches to its row's
 * height without a `length`).
 */
export function ContentSeparator(props: LayoutProps & { orientation?: unknown; thickness?: unknown; length?: unknown }) {
  const layout = useLayout(props);
  const vertical = props.orientation === "vertical";
  const own: Record<string, string> = {};
  const thickness = layoutCss(props.thickness);
  const length = layoutCss(props.length);
  if (thickness !== undefined) own["--gfui-separator-thickness"] = thickness;
  if (length !== undefined) own["--gfui-separator-length"] = length;
  return (
    <Divider
      className="gfui-ContentSeparator"
      orientation={vertical ? "vertical" : "horizontal"}
      data-length={length === undefined ? undefined : ""}
      {...layout.attributes}
      style={mergeStyles(layout.style, Object.keys(own).length > 0 ? (own as CSSProperties) : undefined)}
    />
  );
}

// --- Card -----------------------------------------------------------------

/** Card's props that are not Stack's. */
const CARD_OWN_PROPS = ["title", "subtitle", "avatarUrl", "showAvatar", "avatarSize", "linkTo", "registerApi", "onClick", "onDoubleClick", "onContextMenu"];

type ScrollBehavior = "auto" | "instant" | "smooth";
const scrollBehavior = (value: unknown): ScrollBehavior => (value === "instant" || value === "smooth" ? value : "auto");

type CardProps = LayoutProps & {
  title?: unknown;
  subtitle?: unknown;
  avatarUrl?: unknown;
  showAvatar?: unknown;
  avatarSize?: unknown;
  linkTo?: unknown;
  orientation?: unknown;
  horizontalAlignment?: unknown;
  verticalAlignment?: unknown;
  registerApi?: RegisterApi;
  onClick?: (ev?: unknown) => unknown;
  onDoubleClick?: (ev?: unknown) => unknown;
  onContextMenu?: (ev?: unknown) => unknown;
  children?: ReactNode;
};

/**
 * `Card`: a Stack that is always a surface (the ladder gives it padding and
 * gaps), with an optional title row first: an avatar (`avatarUrl`, or the
 * title's initials with `showAvatar`), the title (an h2, a link with `linkTo`)
 * and the subtitle.
 */
export function Card(props: CardProps) {
  const { title, subtitle, avatarUrl, showAvatar, avatarSize, linkTo, registerApi, onClick, onDoubleClick, onContextMenu, children } = props;
  const ref = useRef<HTMLDivElement>(null);
  const api = useMemo(
    () => ({
      scrollToTop: (behavior?: unknown) => ref.current?.scrollTo({ top: 0, behavior: scrollBehavior(behavior) }),
      scrollToBottom: (behavior?: unknown) => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: scrollBehavior(behavior) }),
      // Start and end follow the writing direction (scrollLeft is negative towards the end in RTL).
      scrollToStart: (behavior?: unknown) => ref.current?.scrollTo({ left: 0, behavior: scrollBehavior(behavior) }),
      scrollToEnd: (behavior?: unknown) => {
        const element = ref.current;
        if (!element) return;
        const rtl = getComputedStyle(element).direction === "rtl";
        element.scrollTo({ left: rtl ? -element.scrollWidth : element.scrollWidth, behavior: scrollBehavior(behavior) });
      },
    }),
    [],
  );
  useComponentApi(registerApi, api);
  const titleText = text(title);
  const subtitleText = text(subtitle);
  const avatarSource = text(avatarUrl);
  const avatar = isFalse(showAvatar) ? false : avatarSource !== undefined || isTrue(showAvatar);
  const heading = titleText === undefined ? null : <Heading level="h2" maxLines={1} value={titleText} />;
  const header =
    titleText !== undefined || subtitleText !== undefined || avatar ? (
      <div className="gfui-Card-header">
        {avatar ? <Avatar url={avatarSource} name={titleText} size={avatarSize ?? "sm"} /> : null}
        <div className="gfui-Card-titles">
          {heading && typeof linkTo === "string" && linkTo !== "" ? <Link to={linkTo}>{heading}</Link> : heading}
          {subtitleText === undefined ? null : <Text variant="secondary" value={subtitleText} />}
        </div>
      </div>
    ) : null;
  const element: Record<string, unknown> = { ref, onContextMenu: contextMenuHandler(onContextMenu), "data-surface": "" };
  if (typeof onClick === "function" || typeof onDoubleClick === "function") element["data-clickable"] = "";
  if (typeof onClick === "function") {
    // The second click of a double click is not a click (XMLUI CardReact.tsx 138–142).
    element.onClick = (event: MouseEvent) => {
      if (event.detail >= 2) return;
      void onClick(pointerData(event));
    };
  }
  if (typeof onDoubleClick === "function") {
    element.onDoubleClick = (event: MouseEvent) => {
      event.preventDefault();
      void onDoubleClick(pointerData(event));
    };
  }
  const stackProps: Record<string, unknown> = { ...props };
  for (const name of CARD_OWN_PROPS) delete stackProps[name];
  return <Stack {...stackProps} $$className="gfui-Card" $$element={element} $$before={header} />;
}
