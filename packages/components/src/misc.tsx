// Small components (step 32; design: .ai/plan/poc-32-remaining.md): Logo, NoResult,
// ToneSwitch, ToneChangerButton (XMLUI's props), and the non-visual PageMetaTitle
// and Redirect.
import { activeThemeTone, navigate, setStaticTitle, setThemeTone, staticRenderInfo, useSignal, useFrameworkText } from "@gluefuil/runtime";
import { useContext, useEffect, useRef } from "react";
import { AppInfoContext } from "./app-info";
import { Icon } from "./icons";
import { useLayout, type LayoutProps } from "./layout";

const isTrue = (value: unknown) => value === true || value === "true";
const name = (value: unknown, fallback: string) => (typeof value === "string" && value !== "" ? value : fallback);

/** `Logo`: the App's logo image for the active tone (`logo`, `logo-light`, `logo-dark`); nothing without one. */
export function Logo(props: LayoutProps & { alt?: unknown; inline?: unknown }) {
  const { alt, inline } = props;
  const layout = useLayout(props);
  const { logoUrl } = useContext(AppInfoContext);
  if (!logoUrl) return null;
  return <img className="gfui-Logo" src={logoUrl} alt={name(alt, "Logo")} data-inline={isTrue(inline) ? "" : undefined} {...layout.attributes} style={layout.style} />;
}

/** `NoResult`: an icon (default `noresult`; `hideIcon`) and a label, for an empty list. */
export function NoResult(props: LayoutProps & { label?: unknown; icon?: unknown; hideIcon?: unknown }) {
  const { label, icon, hideIcon } = props;
  const layout = useLayout(props);
  return (
    <div className="gfui-NoResult" {...layout.attributes} style={layout.style}>
      {isTrue(hideIcon) ? null : <Icon name={name(icon, "noresult")} fallback="noresult" />}
      {label === undefined || label === null ? null : <span className="gfui-NoResult-label">{String(label)}</span>}
    </div>
  );
}

type ToneHandler = (tone: "light" | "dark") => unknown;

/** `ToneSwitch`: a switch between the light and the dark tone; `didChange(tone)` after a change. */
export function ToneSwitch(props: LayoutProps & { iconLight?: unknown; iconDark?: unknown; onDidChange?: ToneHandler }) {
  const t = useFrameworkText();
  const { iconLight, iconDark, onDidChange } = props;
  const layout = useLayout(props);
  const dark = useSignal(activeThemeTone) === "dark";
  const toggle = () => {
    const tone = dark ? "light" : "dark";
    setThemeTone(tone);
    if (typeof onDidChange === "function") void onDidChange(tone);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t("gfui.aria.darkMode")}
      className="gfui-ToneSwitch"
      data-tone={dark ? "dark" : "light"}
      onClick={toggle}
      {...layout.attributes}
      style={layout.style}
    >
      <span className="gfui-ToneSwitch-thumb">
        <Icon name={dark ? name(iconDark, "moon") : name(iconLight, "sun")} fallback={dark ? "moon" : "sun"} />
      </span>
    </button>
  );
}

/** `ToneChangerButton` (deprecated in XMLUI for ToneSwitch): an icon button that switches the tone; `click(tone)`. */
export function ToneChangerButton(props: LayoutProps & { lightToDarkIcon?: unknown; darkToLightIcon?: unknown; onClick?: ToneHandler }) {
  const t = useFrameworkText();
  const { lightToDarkIcon, darkToLightIcon, onClick } = props;
  const layout = useLayout(props);
  const dark = useSignal(activeThemeTone) === "dark";
  const toggle = () => {
    const tone = dark ? "light" : "dark";
    setThemeTone(tone);
    if (typeof onClick === "function") void onClick(tone);
  };
  return (
    <button type="button" aria-label={t("gfui.aria.toggleColorMode")} className="gfui-ToneChangerButton" onClick={toggle} {...layout.attributes} style={layout.style}>
      <Icon name={dark ? name(darkToLightIcon, "sun") : name(lightToDarkIcon, "moon")} fallback={dark ? "sun" : "moon"} />
    </button>
  );
}

/**
 * `PageMetaTitle`: the browser tab's title, `value` plus " | " and the App's
 * `name` (unless `noSuffix`). A static render records it for the page's `<title>`.
 */
export function PageMetaTitle({ value, noSuffix, children }: { value?: unknown; noSuffix?: unknown; children?: unknown }) {
  const { name: appName } = useContext(AppInfoContext);
  const own = value !== undefined && value !== null && value !== "" ? String(value) : typeof children === "string" && children.trim() !== "" ? children.trim() : "gfui Application";
  const title = !isTrue(noSuffix) && appName ? `${own} | ${appName}` : own;
  if (staticRenderInfo()) setStaticTitle(title);
  // The title before it mounted comes back when it unmounts (leaving the page; XMLUI's Helmet does so).
  const original = useRef<string | undefined>(undefined);
  useEffect(() => {
    original.current ??= document.title;
    const before = original.current;
    return () => {
      document.title = before;
    };
  }, []);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}

/**
 * `Redirect`: navigates to `to` when it mounts (made visible by `when`), through
 * the App's `willNavigate`; `replace` replaces the history entry. A static
 * render never navigates.
 */
export function Redirect({ to, replace }: { to?: unknown; replace?: unknown }) {
  const done = useRef<string | undefined>(undefined);
  const target = typeof to === "string" ? to : "";
  useEffect(() => {
    // Once per target: StrictMode's simulated remount doesn't navigate twice.
    if (target === "" || done.current === target) return;
    done.current = target;
    void navigate(target, { replace: isTrue(replace) });
  }, [target, replace]);
  return null;
}
