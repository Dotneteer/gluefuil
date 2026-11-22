// Syntax tree produced by parseMarkup(). Every node carries `start`/`end`
// UTF-16 offsets into the source text (end is exclusive).

export interface Span {
  start: number;
  end: number;
}

/** A tag or attribute name, optionally namespaced: `prefix:local`. */
export interface Name extends Span {
  prefix?: string;
  local: string;
  /** `prefix:local`, or just `local`. */
  full: string;
}

export interface DocumentNode extends Span {
  kind: "document";
  children: ContentNode[];
}

export type ContentNode = ElementNode | TextNode | CommentNode | CDataNode | ScriptNode;

export type MarkupNode = DocumentNode | ContentNode | AttributeNode;

export interface ElementNode extends Span {
  kind: "element";
  name: Name;
  attributes: AttributeNode[];
  children: ContentNode[];
  /** `<Tag … />` */
  selfClosing: boolean;
  /** From `<` to the end of the start tag (`>` or `/>`). */
  openTag: Span;
  /** The `</Tag>` span; absent when self-closing or never closed. */
  closeTag?: Span;
  /** Comments written inside the start tag, between attributes (XMLUI allows them). */
  tagComments?: CommentNode[];
}

export interface AttributeNode extends Span {
  kind: "attribute";
  name: Name;
  /** Absent for a valueless attribute (`<Component receivesContextVars>`). */
  value?: AttributeValue;
}

export interface AttributeValue extends Span {
  /** The raw text between the quotes. Entities are NOT decoded (XMLUI semantics). */
  text: string;
  quote: '"' | "'" | "`";
  /** Span of the text inside the quotes. Expression positions start here. */
  inner: Span;
}

export interface TextNode extends Span {
  kind: "text";
  /** Text with entities decoded. */
  value: string;
  /** Source text exactly as written. */
  raw: string;
}

export interface CommentNode extends Span {
  kind: "comment";
  /** Text between `<!--` and `-->`. */
  value: string;
}

export interface CDataNode extends Span {
  kind: "cdata";
  /** Text between `<![CDATA[` and `]]>`. */
  value: string;
}

/** `<script>…</script>`: content is not parsed as markup. */
export interface ScriptNode extends Span {
  kind: "script";
  content: string;
  /** Span of the content between the tags. */
  contentSpan: Span;
}
