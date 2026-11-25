// Markdown (step 23; design: .ai/plan/poc-23-display.md). The component picks
// the text (content, the nested text, or a data URL); the renderer is a lazy
// chunk (markdown-render.tsx), read with `use()` inside a Suspense boundary:
// the fallback is empty, hydration keeps the prerendered HTML until the chunk
// arrives, and the prerender renders again once it loaded (runtime lazy.ts).
import { lazyResource, noteServerLoad } from "@gluefuil/runtime";
import { memo, Suspense, use, type ReactNode } from "react";
import { isDataUrl, useDataUrlState } from "./data";
import { useLayout, type LayoutProps } from "./layout";

const renderer = lazyResource(() => import("./markdown-render"));

/** Starts loading Markdown's renderer (an app can call it early to save the wait). */
export function preloadMarkdown(): Promise<unknown> {
  return renderer.load();
}

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";

/**
 * Removes the indent common to the non-blank lines, and blank lines at the
 * start and the end (XMLUI's removeIndents), so nested text can follow the
 * markup's indentation.
 */
export function removeIndents(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  let indent = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    indent = Math.min(indent, /^[ \t]*/.exec(line)![0].length);
  }
  if (!Number.isFinite(indent) || indent === 0) return lines.join("\n");
  return lines.map((line) => line.slice(Math.min(indent, /^[ \t]*/.exec(line)![0].length))).join("\n");
}

/**
 * The text of an `@{…}` value (XMLUI parse-binding-expr.ts mapByType):
 * nullish is empty, a function a placeholder, an object JSON.
 */
export function bindingText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "function") return "[function]";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** The nested text: a string child, or `$$parts` (the compiled `@{…}`: strings and values). */
function nestedText(parts: unknown, children: ReactNode): string | undefined {
  // Literal parts are strings, which bindingText keeps as they are.
  if (Array.isArray(parts)) return parts.map(bindingText).join("");
  if (typeof children === "string") return children;
  if (Array.isArray(children) && children.every((child) => typeof child === "string")) return children.join("");
  return undefined;
}

type MarkdownProps = LayoutProps & {
  content?: unknown;
  data?: unknown;
  removeIndents?: unknown;
  allowHtml?: unknown;
  openLinkInNewTab?: unknown;
  showHeadingAnchors?: unknown;
  grayscale?: unknown;
  truncateLinks?: unknown;
  interpolateBindings?: unknown;
  $$parts?: unknown;
  children?: ReactNode;
};

interface BodyProps {
  text: string;
  allowHtml: boolean;
  openLinkInNewTab: boolean;
  showHeadingAnchors: boolean;
}

/** Renders the text with the lazy renderer; suspends until it has loaded. */
function MarkdownBody({ text, allowHtml, openLinkInNewTab, showHeadingAnchors }: BodyProps) {
  const loading = renderer.load();
  // For a server render (the prerender renders again once it loaded); in a browser the set just holds this one promise.
  if (renderer.value === undefined) noteServerLoad(loading);
  // Always called (a retried render must call use() again); a loaded renderer doesn't suspend.
  const module = use(loading);
  return <>{module.renderMarkdown(text, { allowHtml, openLinkInNewTab, showHeadingAnchors })}</>;
}

/**
 * The Suspense boundary around the body, memoized on its inputs. While a
 * prerendered boundary waits for the chunk (dehydrated), any update to it makes
 * React drop the server HTML and render it again on the client; a re-render of
 * an ancestor (the takeover's own) must not reach it when the text is the same.
 */
const MarkdownBoundary = memo(function MarkdownBoundary(props: BodyProps) {
  return (
    <Suspense fallback={null}>
      <MarkdownBody {...props} />
    </Suspense>
  );
});

// A prerendered page with Markdown: start loading the renderer now, before the takeover needs it.
if (typeof document !== "undefined" && document.querySelector("[data-gfui-prerendered] .gfui-Markdown")) void renderer.load();

/**
 * `Markdown`: `content` wins, then the nested text, then `data` (a URL,
 * loaded once through the data layer).
 */
export function Markdown(props: MarkdownProps) {
  const layout = useLayout(props);
  const nested = nestedText(props.$$parts, props.children);
  const content = typeof props.content === "string" ? props.content : props.content !== undefined && props.content !== null ? String(props.content) : undefined;
  const url = content === undefined && nested === undefined && isDataUrl(props.data) ? props.data : undefined;
  const loaded = useDataUrlState(url);
  const raw = content ?? nested ?? (typeof loaded.value === "string" ? loaded.value : undefined) ?? "";
  const text = isFalse(props.removeIndents) ? raw : removeIndents(raw);
  return (
    <div
      className="gfui-Markdown"
      data-grayscale={isTrue(props.grayscale) ? "" : undefined}
      data-truncate-links={isTrue(props.truncateLinks) ? "" : undefined}
      {...layout.attributes}
      style={layout.style}
    >
      {text.trim() === "" ? null : (
        <MarkdownBoundary text={text} allowHtml={!isFalse(props.allowHtml)} openLinkInNewTab={isTrue(props.openLinkInNewTab)} showHeadingAnchors={isTrue(props.showHeadingAnchors)} />
      )}
    </div>
  );
}
