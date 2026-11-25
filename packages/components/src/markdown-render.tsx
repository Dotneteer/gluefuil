// Markdown's renderer (step 23; design: .ai/plan/poc-23-display.md). Loaded on
// demand (markdown.tsx imports it dynamically): an app without Markdown never
// downloads the parser.
//
// Markdown text → mdast (mdast-util-from-markdown with the GFM extensions:
// tables, task lists, strikethrough, autolinks, footnotes) → React elements,
// with our components where there is one: Heading, Text (inline code), Link
// (routes go through the router). Raw HTML passes the allowlist of
// markdown-html.ts.
import type { Nodes, Parents, RootContent, Root, Definition, FootnoteDefinition } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import { createElement, Fragment, type MouseEvent, type ReactNode } from "react";
import { isSafeUrl, tokenizeHtml, VOID_TAGS } from "./markdown-html";
import { Link } from "./routing";
import { Heading, Text } from "./text";

export interface RenderOptions {
  allowHtml: boolean;
  openLinkInNewTab: boolean;
  showHeadingAnchors: boolean;
}

/** Parses Markdown text (GFM) into mdast. */
export function parseMarkdown(text: string): Root {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

/** Renders Markdown text to React elements. */
export function renderMarkdown(text: string, options: RenderOptions): ReactNode {
  const tree = parseMarkdown(text);
  const definitions = new Map<string, Definition>();
  const footnotes: FootnoteDefinition[] = [];
  collect(tree, definitions, footnotes);
  const renderer = new Renderer(options, definitions);
  const body = renderer.children(tree);
  if (footnotes.length === 0) return body;
  return (
    <>
      {body}
      <section className="gfui-Markdown-footnotes">
        <ol>
          {footnotes.map((note) => (
            <li key={note.identifier} id={`footnote-${note.identifier}`}>
              {renderer.children(note)}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function collect(node: Nodes, definitions: Map<string, Definition>, footnotes: FootnoteDefinition[]): void {
  if (node.type === "definition") {
    if (!definitions.has(node.identifier)) definitions.set(node.identifier, node);
    return;
  }
  if (node.type === "footnoteDefinition") footnotes.push(node);
  if ("children" in node) for (const child of node.children) collect(child, definitions, footnotes);
}

/** A link to `#id` scrolls to that element: following it would be a route change under hash routing. */
function scrollToHash(event: MouseEvent<HTMLAnchorElement>) {
  const id = decodeURIComponent(event.currentTarget.getAttribute("href")!.slice(1));
  const target = id === "" ? null : document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** React's names for the HTML attributes of the allowlist. */
const REACT_ATTRIBUTE: Readonly<Record<string, string>> = { colspan: "colSpan", rowspan: "rowSpan" };

interface Frame {
  tag: string;
  attributes: Record<string, string | true>;
  children: ReactNode[];
}

class Renderer {
  private key = 0;

  constructor(
    private readonly options: RenderOptions,
    private readonly definitions: ReadonlyMap<string, Definition>,
  ) {}

  private nextKey(): number {
    return this.key++;
  }

  /**
   * A parent's children. Inline raw HTML comes as separate nodes (`<b>`, text,
   * `</b>`), so the open tags form a stack the following nodes render into.
   */
  children(parent: Parents, tight = false): ReactNode[] {
    const root: ReactNode[] = [];
    const stack: Frame[] = [];
    const out = () => (stack.length > 0 ? stack[stack.length - 1]!.children : root);
    const close = (index: number) => {
      while (stack.length > index) {
        const frame = stack.pop()!;
        out().push(this.htmlElement(frame.tag, frame.attributes, frame.children));
      }
    };
    for (const node of parent.children as RootContent[]) {
      if (node.type !== "html") {
        out().push(tight && node.type === "paragraph" ? <Fragment key={this.nextKey()}>{this.children(node)}</Fragment> : this.node(node));
        continue;
      }
      if (!this.options.allowHtml) {
        out().push(node.value);
        continue;
      }
      for (const token of tokenizeHtml(node.value)) {
        if (token.kind === "text") out().push(token.value);
        else if (token.kind === "open") {
          if (token.selfClosing) out().push(this.htmlElement(token.tag, token.attributes, []));
          else stack.push({ tag: token.tag, attributes: token.attributes, children: [] });
        } else {
          // Closes the nearest open element of that tag (and any left open inside it); a stray one is dropped.
          let index = stack.length - 1;
          while (index >= 0 && stack[index]!.tag !== token.tag) index--;
          if (index >= 0) close(index);
        }
      }
    }
    close(0);
    return root;
  }

  private htmlElement(tag: string, attributes: Record<string, string | true>, children: ReactNode[]): ReactNode {
    const key = this.nextKey();
    if (tag === "a") return this.link(typeof attributes.href === "string" ? attributes.href : undefined, typeof attributes.title === "string" ? attributes.title : undefined, children, key, attributes.target === "_blank");
    const props: Record<string, unknown> = { key };
    for (const [name, value] of Object.entries(attributes)) props[REACT_ATTRIBUTE[name] ?? name] = value;
    if (tag === "img") props.className = "gfui-Markdown-image";
    return VOID_TAGS.has(tag) ? createElement(tag, props) : createElement(tag, props, ...children);
  }

  private link(url: string | undefined, title: string | undefined, children: ReactNode[], key: number, blank = false): ReactNode {
    if (url === undefined || !isSafeUrl(url)) return <Fragment key={key}>{children}</Fragment>;
    if (url.startsWith("#")) {
      return (
        <a key={key} className="gfui-Link" href={url} title={title} onClick={scrollToHash}>
          {children}
        </a>
      );
    }
    return (
      <Link key={key} to={url} target={blank || this.options.openLinkInNewTab ? "_blank" : undefined}>
        {children}
      </Link>
    );
  }

  private image(url: string | undefined, alt: string, title: string | undefined, key: number): ReactNode {
    if (url === undefined || !isSafeUrl(url)) return alt;
    return <img key={key} className="gfui-Markdown-image" src={url} alt={alt} title={title ?? undefined} />;
  }

  node(node: RootContent): ReactNode {
    const key = this.nextKey();
    switch (node.type) {
      case "text":
        return node.value;
      case "paragraph":
        return <p key={key}>{this.children(node)}</p>;
      case "heading": {
        const text = toString(node);
        return (
          <Heading key={key} level={node.depth} showAnchor={this.options.showHeadingAnchors} $$anchorText={text}>
            {this.children(node)}
          </Heading>
        );
      }
      case "emphasis":
        return <em key={key}>{this.children(node)}</em>;
      case "strong":
        return <strong key={key}>{this.children(node)}</strong>;
      case "delete":
        return <del key={key}>{this.children(node)}</del>;
      case "inlineCode":
        return <Text key={key} variant="code" value={node.value} />;
      case "code":
        return (
          <pre key={key} className="gfui-Markdown-code">
            <code data-language={node.lang ?? undefined}>{node.value}</code>
          </pre>
        );
      case "blockquote":
        return <blockquote key={key}>{this.children(node)}</blockquote>;
      case "list": {
        const tight = node.spread !== true;
        const items = node.children.map((item) => {
          const task = item.checked === true || item.checked === false;
          return (
            <li key={this.nextKey()} data-task={task ? "" : undefined}>
              {task ? <input type="checkbox" checked={item.checked === true} disabled readOnly /> : null}
              {this.children(item, tight && item.spread !== true)}
            </li>
          );
        });
        return node.ordered ? (
          <ol key={key} start={node.start !== null && node.start !== undefined && node.start !== 1 ? node.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        );
      }
      case "thematicBreak":
        return <hr key={key} />;
      case "break":
        return <br key={key} />;
      case "link":
        return this.link(node.url, node.title ?? undefined, this.children(node), key);
      case "image":
        return this.image(node.url, node.alt ?? "", node.title ?? undefined, key);
      case "linkReference": {
        const definition = this.definitions.get(node.identifier);
        return definition ? this.link(definition.url, definition.title ?? undefined, this.children(node), key) : <Fragment key={key}>[{this.children(node)}]</Fragment>;
      }
      case "imageReference": {
        const definition = this.definitions.get(node.identifier);
        return definition ? this.image(definition.url, node.alt ?? "", definition.title ?? undefined, key) : `![${node.alt ?? ""}]`;
      }
      case "table": {
        const [head, ...body] = node.children;
        const align = (index: number) => node.align?.[index] ?? undefined;
        const row = (cells: typeof head, header: boolean) =>
          cells?.children.map((cell, index) =>
            createElement(header ? "th" : "td", { key: this.nextKey(), style: align(index) ? { textAlign: align(index) } : undefined }, ...this.children(cell)),
          );
        return (
          <div key={key} className="gfui-Markdown-table">
            <table>
              <thead>
                <tr>{row(head, true)}</tr>
              </thead>
              {body.length > 0 ? (
                <tbody>
                  {body.map((cells) => (
                    <tr key={this.nextKey()}>{row(cells, false)}</tr>
                  ))}
                </tbody>
              ) : null}
            </table>
          </div>
        );
      }
      case "footnoteReference":
        return (
          <sup key={key} className="gfui-Markdown-footnoteRef">
            <a href={`#footnote-${node.identifier}`} onClick={scrollToHash}>
              {node.label ?? node.identifier}
            </a>
          </sup>
        );
      case "html":
        // Handled in children(); a lone html node (allowHtml off) is text.
        return node.value;
      case "definition":
      case "footnoteDefinition":
      case "yaml":
        // Definitions are resolved by references; footnotes render at the end.
        return null;
      default:
        return "children" in node ? <Fragment key={key}>{this.children(node as Parents)}</Fragment> : null;
    }
  }
}
