// What a .pfui file defines and uses, without compiling it (step 14). Tools
// (the Vite plugin, the standalone loader) analyze component files first, so
// every file can be compiled knowing the interfaces of the components it uses.

import type { ContentNode, DocumentNode, ElementNode } from "../markup/ast";
import { parseMarkup } from "../markup/parser";
import { parseInterpolation } from "../script/interpolation";
import { parseStatements } from "../script/parse";

/** The template name of a component's default slot (`<Slot/>`); runtime DEFAULT_SLOT. */
export const DEFAULT_SLOT = "$$slot";

/** What a file needs to know about a user-defined component to use it. */
export interface UserComponentInfo {
  name: string;
  /**
   * Its slots by template name (DEFAULT_SLOT for `<Slot/>`), each with the
   * context variables its slot props provide to the caller's content (`$item`).
   */
  slots: Record<string, string[]>;
  /** Its methods (`method.x`, `<method name="x">`): the API its `id` exposes. */
  methods: string[];
  /**
   * The props it reads (`$props.x`), sorted; undefined: any prop (it uses
   * `$props` some other way, such as `$props[key]`).
   */
  props?: string[];
  /**
   * The events it emits (`emitEvent('x')`, `hasEventHandler('x')`), sorted;
   * undefined: any event (a computed name).
   */
  events?: string[];
  /**
   * The ESM module to import it from ("esm" format). Without it the component
   * is either defined in the file being compiled, or (the "function" format)
   * provided by `$$imports.components`.
   */
  module?: string;
}

export interface ModuleAnalysis {
  /** "component": the file is exactly one `<Component>`; "app": it has app markup. */
  kind: "app" | "component";
  /** The `<Component>` definitions at the top level, in order. */
  components: UserComponentInfo[];
  /** Every component name the file uses (element names starting with an uppercase letter), sorted. */
  references: string[];
}

/** Valid component names (XMLUI): an uppercase letter, then letters, digits, `_` and `$`. */
export const COMPONENT_NAME = /^[A-Z][A-Za-z0-9_$]*$/;

const isElement = (node: ContentNode): node is ElementNode => node.kind === "element";

const constantAttribute = (node: ElementNode, name: string): string | undefined => {
  const value = node.attributes.find((a) => a.name.full === name)?.value?.value;
  return value === undefined || value.includes("{") ? undefined : value;
};

/**
 * Analyzes markup (and, for a component file, its code-behind). Problems are
 * not reported here: `compileModule` reports them.
 */
export function analyzeModule(markup: string, options: { codeBehind?: string } = {}): ModuleAnalysis {
  return analyzeDocument(parseMarkup(markup).document, options.codeBehind);
}

export function analyzeDocument(document: DocumentNode, codeBehind?: string): ModuleAnalysis {
  const topLevel = document.children.filter(isElement);
  const definitions = topLevel.filter((e) => e.name.full === "Component");
  const components: UserComponentInfo[] = [];
  for (const definition of definitions) {
    const name = constantAttribute(definition, "name");
    if (name === undefined || !COMPONENT_NAME.test(name)) continue;
    // Code-behind belongs to the component of a component file.
    const usage = collectUsage(definition, definitions.length === 1 && topLevel.length === 1 ? codeBehind : undefined);
    components.push({ name, slots: collectSlots(definition), methods: collectMethods(definition), ...usage });
  }
  const references = new Set<string>();
  const visit = (node: ElementNode) => {
    const name = node.name.full;
    if (node.name.prefix === undefined && /^[A-Z]/.test(name) && name !== "Component" && name !== "Slot") references.add(name);
    for (const child of node.children) if (isElement(child)) visit(child);
  };
  for (const element of topLevel) visit(element);
  const kind = topLevel.length === definitions.length && definitions.length === 1 ? "component" : "app";
  return { kind, components, references: [...references].sort() };
}

/** Every `<Slot>` in a definition's body (in templates too): name → context variables. */
function collectSlots(definition: ElementNode): Record<string, string[]> {
  const slots: Record<string, Set<string>> = {};
  const visit = (node: ElementNode) => {
    if (node.name.full === "Slot") {
      const name = constantAttribute(node, "name") ?? DEFAULT_SLOT;
      const vars = (slots[name] ??= new Set());
      for (const attribute of node.attributes) {
        if (attribute.name.full !== "name") vars.add(`$${attribute.name.full}`);
      }
    }
    for (const child of node.children) if (isElement(child)) visit(child);
  };
  for (const child of definition.children) if (isElement(child)) visit(child);
  return Object.fromEntries(Object.entries(slots).map(([name, vars]) => [name, [...vars].sort()]));
}

function collectMethods(definition: ElementNode): string[] {
  const methods = new Set<string>();
  for (const attribute of definition.attributes) {
    if (attribute.name.full.startsWith("method.")) methods.add(attribute.name.full.slice("method.".length));
  }
  for (const child of definition.children) {
    if (isElement(child) && child.name.full === "method") {
      const name = constantAttribute(child, "name");
      if (name !== undefined) methods.add(name);
    }
  }
  return [...methods].sort();
}

/**
 * The props and events a definition uses, from its expressions, handlers and
 * code-behind. Code that does not parse makes both "any": a wrong contract
 * would reject valid callers.
 */
function collectUsage(definition: ElementNode, codeBehind: string | undefined): { props?: string[]; events?: string[] } {
  const props = new Set<string>();
  const events = new Set<string>();
  let anyProp = false;
  let anyEvent = false;
  const walk = (node: unknown, parent: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parent);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const n = node as { type?: string; [key: string]: unknown };
    if (n.type === "Identifier") {
      const p = parent as { type?: string; object?: unknown; computed?: boolean; callee?: unknown; property?: unknown };
      if (n.name === "$props") {
        if (p?.type === "MemberExpression" && p.object === node && !p.computed) {
          props.add(((p.property as { name: string }).name));
        } else if (!(p?.type === "MemberExpression" && p.property === node)) {
          anyProp = true;
        }
      }
      if (n.name === "emitEvent" || n.name === "hasEventHandler") {
        const call = parent as { type?: string; callee?: unknown; arguments?: { type: string; value?: unknown }[] };
        const first = call?.type === "CallExpression" && call.callee === node ? call.arguments?.[0] : undefined;
        if (first?.type === "Literal" && typeof first.value === "string") events.add(first.value);
        else if (!(p?.type === "MemberExpression" && p.property === node)) anyEvent = true;
      }
      return;
    }
    for (const [key, value] of Object.entries(n)) {
      if (key === "start" || key === "end" || key === "raw") continue;
      if (value && typeof value === "object") walk(value, node);
    }
  };
  const statements = (source: string) => {
    const parsed = parseStatements(source);
    if (parsed.diagnostics.length > 0) anyProp = anyEvent = true;
    walk(parsed.program, undefined);
  };
  const interpolation = (source: string) => {
    const parsed = parseInterpolation(source);
    if (parsed.diagnostics.length > 0) anyProp = anyEvent = true;
    for (const segment of parsed.segments) if (segment.kind === "expression") walk(segment.expression, undefined);
  };
  const visit = (element: ElementNode) => {
    const codeTag = element.name.full === "event" || element.name.full === "method";
    for (const attribute of element.attributes) {
      if (!attribute.value) continue;
      const name = attribute.name.full;
      const handler = /^on[A-Z]/.test(name) || name.startsWith("method.");
      if (handler) statements(attribute.value.value);
      else if (!(codeTag && name === "name")) interpolation(attribute.value.value);
    }
    for (const child of element.children) {
      if (child.kind === "element") visit(child);
      else if (codeTag && (child.kind === "text" || child.kind === "cdata")) statements(child.value);
      else if (child.kind === "text") interpolation(child.value);
    }
  };
  visit(definition);
  if (codeBehind !== undefined) statements(codeBehind);
  return {
    ...(anyProp ? {} : { props: [...props].sort() }),
    ...(anyEvent ? {} : { events: [...events].sort() }),
  };
}
