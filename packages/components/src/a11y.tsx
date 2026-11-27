// Accessibility helpers (step 32; design: .ai/plan/poc-32-remaining.md): SkipLink,
// LiveRegion and FocusScope, after XMLUI's (SkipLinkReact.tsx, LiveRegionReact.tsx,
// FocusScopeReact.tsx). All render in place, so the prerender has them.
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useLayout, type LayoutProps } from "./layout";

const isFalse = (value: unknown) => value === false || value === "false";
const isTrue = (value: unknown) => value === true || value === "true";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** The focusable elements inside `root`, in tab order (positive tabindex is not reordered). */
function tabbables(root: HTMLElement): HTMLElement[] {
  // Skip links are not content (a SkipLink inside the main region must not focus itself).
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true" && !el.classList.contains("gfui-SkipLink"));
}

// --- SkipLink ---------------------------------------------------------------

/** The skip target: the element with that id; for "main" (the default), the App's main region too. */
function skipTarget(id: string): HTMLElement | null {
  return document.getElementById(id) ?? (id === "main" ? document.querySelector<HTMLElement>("main") : null);
}

/**
 * `SkipLink`: a link off screen until it has focus (the first Tab of a page);
 * following it moves focus to `target` (its first focusable element, or the
 * element itself) and scrolls there.
 */
export function SkipLink({ label, target }: { label?: unknown; target?: unknown }) {
  const id = String(target ?? "main").replace(/^#/, "") || "main";
  const go = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    const element = skipTarget(id);
    if (!element) return;
    const focus = element.matches(FOCUSABLE) ? element : (tabbables(element)[0] ?? element);
    if (focus === element && !element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
    focus.focus({ preventScroll: true });
    element.scrollIntoView({ block: "start" });
  };
  return (
    <a
      className="gfui-SkipLink"
      href={`#${id}`}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === " ") go(event);
      }}
    >
      {label === undefined || label === null || label === "" ? "Skip to main content" : String(label)}
    </a>
  );
}

// --- LiveRegion -------------------------------------------------------------

/**
 * `LiveRegion`: a visually hidden region that screen readers announce when its
 * `message` changes; `politeness` polite (default, `role="status"`) or
 * assertive (`role="alert"`).
 */
export function LiveRegion({ message, politeness }: { message?: unknown; politeness?: unknown }) {
  const assertive = politeness === "assertive";
  return (
    <div className="gfui-LiveRegion" role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} aria-atomic="true">
      {message === undefined || message === null ? "" : String(message)}
    </div>
  );
}

// --- FocusScope -------------------------------------------------------------

type FocusScopeProps = LayoutProps & { trap?: unknown; restore?: unknown; autoFocus?: unknown; children?: ReactNode };

/**
 * `FocusScope`: with `trap` (default), Tab and Shift+Tab cycle inside it; with
 * `restore` (default), focus returns where it was when the scope unmounts;
 * `autoFocus` focuses its first focusable element when it mounts.
 */
export function FocusScope(props: FocusScopeProps) {
  const { trap, restore, autoFocus, children } = props;
  const layout = useLayout(props);
  const ref = useRef<HTMLDivElement>(null);
  const trapping = !isFalse(trap);
  const restoring = !isFalse(restore);
  const focusing = isTrue(autoFocus);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (focusing && ref.current) {
      const first = tabbables(ref.current)[0];
      (first ?? ref.current).focus();
    }
    return () => {
      if (restoring && before && before.isConnected && (!ref.current || ref.current.contains(document.activeElement) || document.activeElement === document.body)) before.focus();
    };
    // On mount and unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!trapping || event.key !== "Tab" || !ref.current) return;
    const list = tabbables(ref.current);
    if (list.length === 0) {
      event.preventDefault();
      return;
    }
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const current = document.activeElement;
    if (event.shiftKey && (current === first || current === ref.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div ref={ref} className="gfui-FocusScope" tabIndex={-1} onKeyDown={onKeyDown} data-trap={trapping ? "" : undefined} {...layout.attributes} style={layout.style}>
      {children}
    </div>
  );
}
