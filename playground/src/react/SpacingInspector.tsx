// The playground's spacing inspector (steps 19D–19F): a toggle that outlines
// every stack and labels it with its level, orientation and the gap (and
// padding) the browser actually computed. Playground-only: it reads the DOM,
// which markup can't. An app's own React component, used from markup: see
// `extensions` in vite.config.ts.
import { useEffect, useState, type CSSProperties } from "react";

const BUTTON: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "var(--pfui-borderRadius)",
  border: "1px solid var(--pfui-borderColor)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
};

const CLASS = "playground-inspect";

const CSS = `
.${CLASS} .pfui-Stack { outline: 1px dashed rgb(37 99 235 / 0.55); outline-offset: -1px; position: relative; }
.${CLASS} .pfui-Stack[data-surface] { outline-color: rgb(217 119 6 / 0.8); }
.${CLASS} .pfui-Stack::before {
  content: attr(data-inspect);
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  padding: 0 4px;
  font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #fff;
  background: rgb(37 99 235 / 0.85);
  pointer-events: none;
  white-space: nowrap;
}
.${CLASS} .pfui-Stack[data-surface]::before { background: rgb(217 119 6 / 0.9); }
`;

/** "L1 v · gap 16px", plus the padding of a surface. */
function label(stack: HTMLElement): string {
  const style = getComputedStyle(stack);
  const horizontal = stack.dataset.orientation === "horizontal";
  const gap = horizontal ? style.columnGap : style.rowGap;
  const surface = stack.hasAttribute("data-surface") ? ` · pad ${style.paddingTop}` : "";
  return `L${stack.dataset.level} ${horizontal ? "h" : "v"} · gap ${gap}${surface}`;
}

function relabel(): void {
  for (const stack of document.querySelectorAll<HTMLElement>(".pfui-Stack")) {
    const text = label(stack);
    if (stack.getAttribute("data-inspect") !== text) stack.setAttribute("data-inspect", text);
  }
}

export function SpacingInspector() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    document.documentElement.classList.add(CLASS);
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(relabel);
    };
    schedule();
    // New stacks, other levels, a theme change (space-base) and the window's width all change the labels.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-level", "style", "class"] });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.documentElement.classList.remove(CLASS);
      for (const stack of document.querySelectorAll(".pfui-Stack")) stack.removeAttribute("data-inspect");
    };
  }, [on]);
  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="playground-SpacingInspector" style={BUTTON} aria-pressed={on} onClick={() => setOn(!on)}>
        Spacing inspector: {on ? "on" : "off"}
      </button>
    </>
  );
}
