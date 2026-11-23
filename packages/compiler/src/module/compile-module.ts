// Compiles a .pfui document to one JavaScript module whose default export is
// the root React component. See .ai/plan/poc-05-first-app.md and
// .ai/plan/poc-06-variables-handlers.md.
//
// Output shape:
//   header (imports, or destructuring of $$imports for the "function" format)
//   const $$scope = $$createAppScope();            // the root scope: app globals
//   const $$b0 = { "value": ($$s) => … };          // bindings of one element
//   const $$e0 = { "onClick": ($$s) => (…) => … };  // handlers of one element
//   const $$v0 = { "count": { init: ($$s) => 0 } }; // variables of one container
//   function $$K0({ $$p }) {                         // a container: an element declaring variables
//     const $$c = $$useScope($$p, $$v0);
//     return $$h(…);
//   }
//   function Main() {                                // with ids: a file scope holding them
//     const $$f = $$useFileScope($$scope, ["textBox"]);
//     return $$h(…);
//   }
//   footer (export default, or return)

import { componentMetadata, type ComponentMetadata } from "@patchfuil/components/metadata";
import { compileHandler, compileInterpolation } from "../codegen/compile";
import { APP_GLOBALS } from "../codegen/names";
import type { AttributeNode, ContentNode, ElementNode, Span } from "../markup/ast";
import { decodeEntitiesWithOffsets } from "../markup/entities";
import { parseMarkup } from "../markup/parser";
import { parseInterpolation, type InterpolationSegment } from "../script/interpolation";
import { parseStatements } from "../script/parse";
import type { Diagnostic } from "../source/diagnostic";
import { ModuleDiagnostics, type ModuleDiagnosticCode } from "./diagnostics";

export interface CompileModuleOptions {
  /**
   * "esm": imports from the runtime and components packages (build tools).
   * "function": a function body reading `$$imports.runtime` and
   * `$$imports.components` (runtime `loadModule`, standalone mode).
   */
  format?: "esm" | "function";
  /** The components markup may use. Default: the built-in components. */
  components?: Readonly<Record<string, ComponentMetadata>>;
  /** Module specifiers for the "esm" format. */
  runtimeModule?: string;
  componentsModule?: string;
}

export interface CompileModuleResult {
  code: string;
  /** Markup (M), script (S), binding (C) and module (E) diagnostics, in file positions. */
  diagnostics: Diagnostic[];
}

/** The runtime names compiled code uses, as `[export, local]`. */
const RUNTIME_IMPORTS: [string, string][] = [
  ["createElement", "$$h"],
  ["Bound", "$$Bound"],
  ["TextNode", "$$TextNode"],
  ["createAppScope", "$$createAppScope"],
  ["useScope", "$$useScope"],
  ["useFileScope", "$$useFileScope"],
  ["scriptGlobals", "$$g"],
  ["scriptRuntime", "$$r"],
];

/** Attribute forms that later steps implement; reported instead of ignored. */
function unsupportedAttribute(name: string): string | undefined {
  for (const prefix of ["method.", "event."]) {
    if (name.startsWith(prefix)) return `The '${prefix}' attribute '${name}'`;
  }
  if (name === "when") return `The '${name}' attribute`;
  return undefined;
}

/** Handler policies (runtime HANDLER_POLICIES). */
const HANDLER_POLICIES = new Set(["parallel", "single-flight", "queue", "drop-while-running"]);

/** Variable names: a letter or `_`, then letters, digits and `_` (XMLUI markup.md § Variables). */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** XMLUI's whitespace collapsing (transform.ts collapseWhitespace): every \s except U+00A0. */
const WHITESPACE_RUN = /[\f\n\r\t\v\u0020\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;

const NBSP = String.fromCharCode(0xa0);

/** One variable declared by an element. */
interface Declaration {
  name: string;
  /** Where to report problems with this declaration. */
  span: Span;
  /** The attribute holding the value (`var.x="…"`, or `value` of `<variable>`), if any. */
  value?: ValuedAttribute;
  /** True for `var.x` without a value: the string "true" (as any key-only attribute). */
  keyOnly: boolean;
}

type ValuedAttribute = AttributeNode & { value: NonNullable<AttributeNode["value"]> };

export function compileModule(markup: string, options: CompileModuleOptions = {}): CompileModuleResult {
  return new ModuleCompiler(options).compile(markup);
}

class ModuleCompiler {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly components: Readonly<Record<string, ComponentMetadata>>;
  private readonly usedComponents = new Set<string>();
  private readonly hoisted: string[] = [];
  /** Variables declared by the enclosing containers, innermost last. */
  private readonly frames: Set<string>[] = [];
  /** The component IDs of the file (collected before compiling: their order doesn't matter). */
  private readonly ids = new Set<string>();
  private counter = 0;
  private usesEmpty = false;

  constructor(private readonly options: CompileModuleOptions) {
    this.components = options.components ?? componentMetadata;
  }

  private report<C extends ModuleDiagnosticCode>(
    span: { start: number; end: number },
    code: C,
    ...args: Parameters<(typeof ModuleDiagnostics)[C]>
  ): void {
    const message = (ModuleDiagnostics[code] as (...a: unknown[]) => string)(...args);
    this.diagnostics.push({ code, severity: "error", message, start: span.start, end: span.end });
  }

  /** Every name visible at this point: app globals, the file's IDs, and the variables in scope. */
  private visibleNames(): Set<string> {
    const names = new Set<string>([...APP_GLOBALS, ...this.ids]);
    for (const frame of this.frames) for (const name of frame) names.add(name);
    return names;
  }

  /** The names a handler may write: the variables in scope. */
  private visibleVariables(): Set<string> {
    const names = new Set<string>();
    for (const frame of this.frames) for (const name of frame) names.add(name);
    return names;
  }

  compile(markup: string): CompileModuleResult {
    const parsed = parseMarkup(markup);
    this.diagnostics.push(...parsed.diagnostics);
    const root = this.findRoot(parsed.document.children, parsed.document);
    if (root) this.collectIds(root);
    const fileScope = this.ids.size > 0 ? "$$f" : "$$scope";
    const body = root ? this.node(root, fileScope, true) : "null";
    const prologue = this.ids.size > 0 ? `  const $$f = $$useFileScope($$scope, ${JSON.stringify([...this.ids])});\n` : "";
    const code = [
      this.header(),
      "const $$scope = $$createAppScope();",
      ...(this.usesEmpty ? ["const $$empty = Object.freeze({});"] : []),
      ...this.hoisted,
      `function Main() {\n${prologue}  return ${body};\n}`,
      this.options.format === "function" ? "return Main;" : "export default Main;",
      "",
    ].join("\n");
    this.diagnostics.sort((a, b) => a.start - b.start);
    // `await`/`async` in a binding: the parser's S030 already says it; drop the code generator's C009.
    const unsupported = new Set(this.diagnostics.filter((d) => d.code === "S030").map((d) => d.start));
    const diagnostics = this.diagnostics.filter((d) => !(d.code === "C009" && unsupported.has(d.start)));
    return { code, diagnostics };
  }

  private findRoot(nodes: ContentNode[], document: { start: number; end: number }): ElementNode | undefined {
    let root: ElementNode | undefined;
    for (const node of nodes) {
      if (node.kind === "comment") continue;
      if (node.kind === "text" && node.value.trim() === "") continue;
      if (node.kind === "element" && !root) {
        root = node;
        continue;
      }
      this.report(node, "E003", node.kind === "element" ? "a second root element" : "content outside the root element");
    }
    if (!root) this.report(document, "E003", "the document has none");
    return root;
  }

  private header(): string {
    const components = [...this.usedComponents].sort();
    if (this.options.format === "function") {
      const runtime = RUNTIME_IMPORTS.map(([name, local]) => `${name}: ${local}`).join(", ");
      const lines = [`const { ${runtime} } = $$imports.runtime;`];
      if (components.length > 0) {
        lines.push(`const { ${components.map((c) => `${c}: $$C_${c}`).join(", ")} } = $$imports.components;`);
      }
      return lines.join("\n");
    }
    const runtime = RUNTIME_IMPORTS.map(([name, local]) => `${name} as ${local}`).join(", ");
    const lines = [`import { ${runtime} } from ${JSON.stringify(this.options.runtimeModule ?? "@patchfuil/runtime")};`];
    if (components.length > 0) {
      const specifiers = components.map((c) => `${c} as $$C_${c}`).join(", ");
      lines.push(`import { ${specifiers} } from ${JSON.stringify(this.options.componentsModule ?? "@patchfuil/components")};`);
    }
    return lines.join("\n");
  }

  /** Hoists an object of compiled values; returns its name. */
  private hoist(prefix: string, entries: [name: string, code: string][]): string {
    const name = `${prefix}${this.counter++}`;
    this.hoisted.push(`const ${name} = { ${entries.map(([key, code]) => `${JSON.stringify(key)}: ${code}`).join(", ")} };`);
    return name;
  }

  /** Decodes and splits an attribute value; reports syntax diagnostics. */
  private segments(attribute: ValuedAttribute): InterpolationSegment[] {
    const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
    const parsed = parseInterpolation(decoded.value, { offsets: decoded.offsets });
    this.diagnostics.push(...parsed.diagnostics);
    return parsed.segments;
  }

  /** Compiles one interpolated value: a constant (JSON) or binding code with its dependencies. */
  private value(segments: InterpolationSegment[]): { constant: string } | { binding: string; dependencies: string[] } {
    const result = compileInterpolation(segments, { scope: this.visibleNames() });
    this.diagnostics.push(...result.diagnostics);
    return result.constant
      ? { constant: JSON.stringify(result.value) }
      : { binding: result.code, dependencies: result.dependencies };
  }

  /** Collects the file's IDs (E010 duplicate, E011 invalid). */
  private collectIds(node: ElementNode): void {
    const attribute = node.attributes.find((a) => a.name.full === "id");
    if (attribute) {
      const value = attribute.value?.value;
      if (value === undefined || !VARIABLE_NAME.test(value)) {
        this.report(attribute.value ?? attribute.name, "E011", value ?? "");
      } else if (this.ids.has(value)) {
        this.report(attribute.value!, "E010", value);
      } else {
        this.ids.add(value);
      }
    }
    for (const child of node.children) if (child.kind === "element") this.collectIds(child);
  }

  // --- Elements -------------------------------------------------------------------------

  /** An element rendered in the runtime scope held by the JavaScript variable `scopeVar`. */
  private node(node: ElementNode, scopeVar: string, isRoot: boolean): string {
    const name = node.name.full;
    if (node.name.prefix === undefined && /^[a-z]/.test(name)) {
      this.report(node.name, "E002", `The helper tag <${name}>`);
      return "null";
    }
    if (node.name.prefix !== undefined || !Object.hasOwn(this.components, name)) {
      this.report(node.name, "E001", name);
      return "null";
    }
    const declarations = this.declarations(node, isRoot);
    if (declarations.length === 0) return this.element(node, scopeVar);
    return this.container(node, declarations, scopeVar);
  }

  /** `var.*` / `global.*` attributes and `<variable>` / `<global>` children of an element. */
  private declarations(node: ElementNode, isRoot: boolean): Declaration[] {
    const found: Declaration[] = [];
    const seen = new Set<string>();
    const add = (name: string, span: Span, global: boolean, value: ValuedAttribute | undefined, keyOnly: boolean) => {
      if (!VARIABLE_NAME.test(name)) {
        this.report(span, "E008", `'${name}' is not a valid variable name`);
        return;
      }
      if (global && !isRoot) {
        this.report(span, "E006", name);
        return;
      }
      if (seen.has(name)) {
        this.report(span, "E007", name);
        return;
      }
      if (this.ids.has(name)) {
        this.report(span, "E012", name);
        return;
      }
      seen.add(name);
      found.push({ name, span, value, keyOnly });
    };
    for (const attribute of node.attributes) {
      const full = attribute.name.full;
      const prefix = full.startsWith("var.") ? "var." : full.startsWith("global.") ? "global." : undefined;
      if (!prefix) continue;
      const valued = attribute.value ? (attribute as ValuedAttribute) : undefined;
      add(full.slice(prefix.length), attribute.name, prefix === "global.", valued, !valued);
    }
    for (const child of node.children) {
      if (child.kind !== "element" || (child.name.full !== "variable" && child.name.full !== "global")) continue;
      const nameAttribute = child.attributes.find((a) => a.name.full === "name");
      const name = nameAttribute?.value?.value;
      if (name === undefined || name.includes("{")) {
        this.report(child.name, "E008", `<${child.name.full}> needs a constant 'name'`);
        continue;
      }
      const value = child.attributes.find((a) => a.name.full === "value");
      add(name, nameAttribute!.value!, child.name.full === "global", value?.value ? (value as ValuedAttribute) : undefined, false);
    }
    return found;
  }

  /** An element declaring variables: its own component, which creates them once per instance. */
  private container(node: ElementNode, declarations: Declaration[], scopeVar: string): string {
    const own = new Set(declarations.map((d) => d.name));
    this.frames.push(own);
    const entries: [string, string][] = [];
    const graph = new Map<string, string[]>();
    for (const declaration of declarations) {
      if (!declaration.value) {
        entries.push([declaration.name, `{ value: ${declaration.keyOnly ? '"true"' : "undefined"} }`]);
        continue;
      }
      const value = this.value(this.segments(declaration.value));
      if ("constant" in value) {
        entries.push([declaration.name, `{ value: ${value.constant} }`]);
      } else {
        entries.push([declaration.name, `{ init: ${value.binding} }`]);
        graph.set(declaration.name, value.dependencies.filter((d) => own.has(d)));
      }
    }
    this.reportCycles(graph, declarations);
    const definitions = this.hoist("$$v", entries);
    const body = this.element(node, "$$c");
    this.frames.pop();
    const component = `$$K${this.counter++}`;
    this.hoisted.push(`function ${component}({ $$p }) {\n  const $$c = $$useScope($$p, ${definitions});\n  return ${body};\n}`);
    return `$$h(${component}, { $$p: ${scopeVar} })`;
  }

  /** Reports each cycle among one container's variables once (E005). */
  private reportCycles(graph: Map<string, string[]>, declarations: Declaration[]): void {
    const state = new Map<string, "visiting" | "done">();
    const stack: string[] = [];
    const visit = (name: string) => {
      state.set(name, "visiting");
      stack.push(name);
      for (const next of graph.get(name) ?? []) {
        if (state.get(next) === "visiting") {
          const cycle = [...stack.slice(stack.indexOf(next)), next];
          this.report(declarations.find((d) => d.name === next)!.span, "E005", cycle.join(" → "));
        } else if (!state.has(next)) {
          visit(next);
        }
      }
      stack.pop();
      state.set(name, "done");
    };
    for (const name of graph.keys()) if (!state.has(name)) visit(name);
  }

  /** The element itself: props, bindings, handlers and children. */
  private element(node: ElementNode, scopeVar: string): string {
    const name = node.name.full;
    this.usedComponents.add(name);
    const metadata = this.components[name]!;

    const constants: [string, string][] = [];
    const bindings: [string, string][] = [];
    const handlers: [string, string][] = [];
    // `handlerPolicy` / `handlerTimeoutMs`, for all handlers ("*") or one (`:onClick`).
    const policies = new Map<string, string>();
    const timeouts = new Map<string, number>();
    for (const attribute of node.attributes) {
      const attributeName = attribute.name.full;
      if (attributeName.startsWith("var.") || attributeName.startsWith("global.")) continue;
      if (attributeName === "id") continue; // collected by collectIds; passed to Bound below
      const concurrency = attribute.name.prefix ?? attribute.name.local;
      if (concurrency === "handlerPolicy" || concurrency === "handlerTimeoutMs") {
        this.concurrencyAttribute(attribute, metadata, name, concurrency === "handlerPolicy" ? policies : timeouts);
        continue;
      }
      if (/^on[A-Z]/.test(attributeName)) {
        const event = attributeName[2]!.toLowerCase() + attributeName.slice(3);
        if (!this.checkEvent(metadata, name, event, attribute.name) || !attribute.value) continue;
        const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
        handlers.push([attributeName, this.handler(decoded.value, { offsets: decoded.offsets })]);
        continue;
      }
      const unsupported = unsupportedAttribute(attributeName);
      if (unsupported) {
        this.report(attribute.name, "E002", unsupported);
        continue;
      }
      if (!attribute.value) {
        // A key-only attribute means "true" (XMLUI transform.ts desugarKeyOnlyAttrs).
        constants.push([attributeName, '"true"']);
        continue;
      }
      const value = this.value(this.segments(attribute as ValuedAttribute));
      if ("constant" in value) constants.push([attributeName, value.constant]);
      else bindings.push([attributeName, value.binding]);
    }

    const children: string[] = [];
    for (const child of node.children) {
      if (child.kind === "element" && child.name.full === "event") {
        const handler = this.eventTag(child, metadata, name);
        if (handler) handlers.push(handler);
        continue;
      }
      if (child.kind === "element" && (child.name.full === "variable" || child.name.full === "global")) continue;
      const compiled = this.child(child, scopeVar);
      if (compiled !== undefined) children.push(compiled);
    }

    const component = `$$C_${name}`;
    const props = constants.length > 0 ? `{ ${constants.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(", ")} }` : "null";
    const args = children.length > 0 ? `, ${children.join(", ")}` : "";
    const idValue = node.attributes.find((a) => a.name.full === "id")?.value?.value;
    const id = idValue !== undefined && this.ids.has(idValue) ? idValue : undefined;
    if (bindings.length === 0 && handlers.length === 0 && id === undefined) return `$$h(${component}, ${props}${args})`;
    const bindingsName = bindings.length > 0 ? this.hoist("$$b", bindings) : this.empty();
    let handlersPart = "";
    if (handlers.length > 0) {
      handlersPart = `, handlers: ${this.hoist("$$e", handlers)}`;
      const perHandler = (settings: Map<string, unknown>) =>
        handlers
          .map(([prop]) => [prop, settings.get(prop) ?? settings.get("*")] as const)
          .filter(([, value]) => value !== undefined)
          .map(([prop, value]) => `${JSON.stringify(prop)}: ${JSON.stringify(value)}`);
      const policyEntries = perHandler(policies);
      const timeoutEntries = perHandler(timeouts);
      if (policyEntries.length > 0) handlersPart += `, policies: { ${policyEntries.join(", ")} }`;
      if (timeoutEntries.length > 0) handlersPart += `, timeouts: { ${timeoutEntries.join(", ")} }`;
    }
    const idPart = id === undefined ? "" : `, id: ${JSON.stringify(id)}`;
    return `$$h($$Bound, { type: ${component}, props: ${props}, bindings: ${bindingsName}${handlersPart}${idPart}, scope: ${scopeVar} }${args})`;
  }

  /**
   * `handlerPolicy="queue"`, `handlerPolicy:onClick="single-flight"`,
   * `handlerTimeoutMs="5000"`, `handlerTimeoutMs:onClick="0"`: constants only (E009).
   * The key is the handler prop (`onClick`), or "*" for all handlers of the element.
   */
  private concurrencyAttribute(attribute: AttributeNode, metadata: ComponentMetadata, component: string, into: Map<string, unknown>): void {
    const kind = attribute.name.prefix ?? attribute.name.local;
    let key = "*";
    if (attribute.name.prefix !== undefined) {
      const prop = attribute.name.local;
      if (!/^on[A-Z]/.test(prop)) {
        this.report(attribute.name, "E009", `'${attribute.name.full}': expected ${kind}:on<Event>`);
        return;
      }
      if (!this.checkEvent(metadata, component, prop[2]!.toLowerCase() + prop.slice(3), attribute.name)) return;
      key = prop;
    }
    const value = attribute.value?.value;
    if (value === undefined || value.includes("{")) {
      this.report(attribute.value ?? attribute.name, "E009", `'${attribute.name.full}' needs a constant value`);
      return;
    }
    if (kind === "handlerPolicy") {
      if (!HANDLER_POLICIES.has(value)) {
        this.report(attribute.value!, "E009", `Unknown handler policy '${value}' (use ${[...HANDLER_POLICIES].join(", ")})`);
        return;
      }
      into.set(key, value);
    } else {
      if (!/^\d+$/.test(value)) {
        this.report(attribute.value!, "E009", `'${attribute.name.full}' must be a whole number of milliseconds`);
        return;
      }
      into.set(key, Number(value));
    }
  }

  private empty(): string {
    this.usesEmpty = true;
    return "$$empty";
  }

  private checkEvent(metadata: ComponentMetadata, component: string, event: string, span: Span): boolean {
    if (metadata.events && Object.hasOwn(metadata.events, event)) return true;
    this.report(span, "E004", event, component);
    return false;
  }

  /** Compiles handler source (statements); returns the handler factory code. */
  private handler(source: string, position: { offsets?: number[]; offset?: number }): string {
    const parsed = parseStatements(source, position);
    this.diagnostics.push(...parsed.diagnostics);
    const result = compileHandler(parsed.program, { scope: this.visibleNames(), variables: this.visibleVariables() });
    this.diagnostics.push(...result.diagnostics);
    return result.code;
  }

  /** `<event name="click">statements</event>`; returns `[prop, factory]`. */
  private eventTag(tag: ElementNode, metadata: ComponentMetadata, component: string): [string, string] | undefined {
    const nameAttribute = tag.attributes.find((a) => a.name.full === "name");
    const event = nameAttribute?.value?.value;
    if (event === undefined || !/^[a-z][A-Za-z0-9]*$/.test(event)) {
      this.report(tag.name, "E008", "<event> needs a constant 'name'");
      return undefined;
    }
    if (!this.checkEvent(metadata, component, event, nameAttribute!.value!)) return undefined;
    const content = tag.children.filter((c) => c.kind !== "comment" && !(c.kind === "text" && c.value.trim() === ""));
    if (content.length > 1 || content.some((c) => c.kind === "element" || c.kind === "script")) {
      this.report(tag.name, "E002", "Components inside <event>");
      return undefined;
    }
    const prop = `on${event[0]!.toUpperCase()}${event.slice(1)}`;
    const text = content[0];
    if (!text) return [prop, this.handler("", { offset: tag.end })];
    if (text.kind === "cdata") return [prop, this.handler(text.value, { offset: text.start + "<![CDATA[".length })];
    if (text.kind !== "text") return undefined;
    // Handler code is not whitespace-collapsed (XMLUI exempts <event>).
    const decoded = decodeEntitiesWithOffsets(text.raw, text.start);
    return [prop, this.handler(decoded.value, { offsets: decoded.offsets })];
  }

  private child(node: ContentNode, scopeVar: string): string | undefined {
    switch (node.kind) {
      case "element":
        return this.node(node, scopeVar, false);
      case "text":
        return this.text(node.raw, node.start, scopeVar);
      case "cdata":
        // Literal text: no interpolation, no whitespace collapsing.
        return JSON.stringify(node.value);
      case "script":
        this.report({ start: node.start, end: node.contentSpan.start }, "E002", "<script>");
        return undefined;
      case "comment":
        return undefined;
    }
  }

  /** Text content: interpolated; whitespace runs in literal parts collapse to one space. */
  private text(raw: string, start: number, scopeVar: string): string | undefined {
    const decoded = decodeEntitiesWithOffsets(raw, start);
    if (decoded.value.trim() === "" && !decoded.value.includes(NBSP)) return undefined;
    const parsed = parseInterpolation(decoded.value, { offsets: decoded.offsets });
    this.diagnostics.push(...parsed.diagnostics);
    const segments = parsed.segments.map((segment) =>
      segment.kind === "literal" ? { ...segment, value: segment.value.replace(WHITESPACE_RUN, " ") } : segment,
    );
    const value = this.value(segments);
    if ("constant" in value) return value.constant;
    return `$$h($$Bound, { type: $$TextNode, bindings: ${this.hoist("$$b", [["value", value.binding]])}, scope: ${scopeVar} })`;
  }
}
