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
import { extractMarkers, jsString, mark } from "../codegen/markers";
import { APP_GLOBALS } from "../codegen/names";
import type { AttributeNode, ContentNode, ElementNode, Span } from "../markup/ast";
import { decodeEntitiesWithOffsets } from "../markup/entities";
import { parseMarkup } from "../markup/parser";
import { parseInterpolation, type InterpolationSegment } from "../script/interpolation";
import { parseStatements } from "../script/parse";
import type { Diagnostic } from "../source/diagnostic";
import { buildSourceMap, type SourceMap } from "../source/source-map";
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
  /** The source file's name, as the source map's `sources` entry. Default "Main.pfui". */
  fileName?: string;
  /** Produce a source map (default true). */
  sourceMap?: boolean;
}

export interface CompileModuleResult {
  code: string;
  /**
   * Source Map v3 from `code` back to the .pfui file: every expression,
   * statement, handler and element. Includes the source text.
   */
  map?: SourceMap;
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
  ["When", "$$When"],
  ["Fragment", "$$Fragment"],
  ["scriptGlobals", "$$g"],
  ["scriptRuntime", "$$r"],
];

/** Attribute forms that later steps implement; reported instead of ignored. */
function unsupportedAttribute(name: string): string | undefined {
  for (const prefix of ["method.", "event."]) {
    if (name.startsWith(prefix)) return `The '${prefix}' attribute '${name}'`;
  }
  return undefined;
}

/** Breakpoints of the responsive `when-*` attributes (runtime BREAKPOINT_NAMES). */
const BREAKPOINTS = ["xs", "sm", "md", "lg", "xl", "xxl"];

/** Lifecycle events every element accepts (aliases as in XMLUI). */
const LIFECYCLE: Readonly<Record<string, "mount" | "unmount">> = {
  onMount: "mount",
  onInit: "mount",
  onUnmount: "unmount",
  onCleanup: "unmount",
};

/** Helper tags handled inside an element (not rendered as children). */
const HELPER_TAGS = new Set(["event", "variable", "global", "property"]);

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
  /** Context variables of the enclosing templates (readable, not writable). */
  private readonly contextFrames: Set<string>[] = [];
  /** The component IDs of the file (collected before compiling: their order doesn't matter). */
  private readonly ids = new Set<string>();
  private counter = 0;
  private usesEmpty = false;

  /** Source markers on (a source map is wanted). */
  private readonly markers: boolean;

  constructor(private readonly options: CompileModuleOptions) {
    this.components = options.components ?? componentMetadata;
    this.markers = options.sourceMap !== false;
  }

  /** A source marker for `offset`, when a source map is wanted. */
  private mark(offset: number, text: string): string {
    return this.markers ? mark(offset, text) : text;
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
    for (const frame of this.contextFrames) for (const name of frame) names.add(name);
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
    const marked = [
      this.header(),
      "const $$scope = $$createAppScope();",
      ...(this.usesEmpty ? ["const $$empty = Object.freeze({});"] : []),
      ...this.hoisted,
      `function Main() {\n${prologue}  return ${body};\n}`,
      this.options.format === "function" ? "return Main;" : "export default Main;",
      "",
    ].join("\n");
    const { code, pairs } = extractMarkers(marked);
    const fileName = this.options.fileName ?? "Main.pfui";
    const map = this.options.sourceMap === false ? undefined : buildSourceMap(code, markup, pairs, { source: fileName, file: `${fileName}.js` });
    this.diagnostics.sort((a, b) => a.start - b.start);
    // `await`/`async` in a binding: the parser's S030 already says it; drop the code generator's C009.
    const unsupported = new Set(this.diagnostics.filter((d) => d.code === "S030").map((d) => d.start));
    const diagnostics = this.diagnostics.filter((d) => !(d.code === "C009" && unsupported.has(d.start)));
    return { code, ...(map ? { map } : {}), diagnostics };
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

  /** Hoists a ready-made expression; returns its name. */
  private hoistRaw(prefix: string, expression: string): string {
    const name = `${prefix}${this.counter++}`;
    this.hoisted.push(`const ${name} = ${expression};`);
    return name;
  }

  /**
   * Compiles template content to a module-level function `$$Tn($$c)` that
   * renders it in the scope `$$c` (a TemplateInstance's scope, holding the
   * context variables).
   */
  private template(content: ContentNode[], contextVars: readonly string[]): string {
    this.contextFrames.push(new Set(contextVars));
    const parts: string[] = [];
    for (const child of content) {
      const compiled = this.child(child, "$$c");
      if (compiled !== undefined) parts.push(compiled);
    }
    this.contextFrames.pop();
    const body = parts.length === 0 ? "null" : parts.length === 1 ? parts[0]! : `$$h($$Fragment, null, ${parts.join(", ")})`;
    const name = `$$T${this.counter++}`;
    this.hoisted.push(`function ${name}($$c) {\n  return ${body};\n}`);
    return name;
  }

  /** `<property name="itemTemplate">markup</property>`: a template prop (E013 otherwise). */
  private propertyTag(tag: ElementNode, metadata: ComponentMetadata, component: string): [string, string] | undefined {
    const nameAttribute = tag.attributes.find((a) => a.name.full === "name");
    const property = nameAttribute?.value?.value;
    if (property === undefined || property.includes("{")) {
      this.report(tag.name, "E008", "<property> needs a constant 'name'");
      return undefined;
    }
    const template = metadata.templates?.[property];
    if (!template) {
      this.report(nameAttribute!.value!, "E013", `'${component}' has no template property '${property}'`);
      return undefined;
    }
    return [property, this.template(tag.children, template.contextVars)];
  }

  /** Hoists an object of compiled values; returns its name. */
  private hoist(prefix: string, entries: [name: string, code: string][]): string {
    const name = `${prefix}${this.counter++}`;
    this.hoisted.push(`const ${name} = { ${entries.map(([key, code]) => `${jsString(key)}: ${code}`).join(", ")} };`);
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
    const result = compileInterpolation(segments, { scope: this.visibleNames(), markers: this.markers });
    this.diagnostics.push(...result.diagnostics);
    return result.constant
      ? { constant: jsString(result.value!) }
      : { binding: result.code, dependencies: result.dependencies };
  }

  /**
   * Collects the file's IDs (E010 duplicate, E011 invalid). IDs inside templates
   * are E014 (one ID per rendered item needs its own design).
   */
  private collectIds(node: ElementNode, inTemplate = false): void {
    const attribute = node.attributes.find((a) => a.name.full === "id");
    if (attribute && inTemplate) {
      this.report(attribute.name, "E014");
    } else if (attribute) {
      const value = attribute.value?.value;
      if (value === undefined || !VARIABLE_NAME.test(value)) {
        this.report(attribute.value ?? attribute.name, "E011", value ?? "");
      } else if (this.ids.has(value)) {
        this.report(attribute.value!, "E010", value);
      } else {
        this.ids.add(value);
      }
    }
    const childrenAreTemplate = Boolean(this.components[node.name.full]?.childrenTemplate);
    for (const child of node.children) {
      if (child.kind !== "element") continue;
      const isProperty = child.name.full === "property";
      const isHelper = HELPER_TAGS.has(child.name.full);
      this.collectIds(child, inTemplate || isProperty || (childrenAreTemplate && !isHelper));
    }
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
    // `when` / `when-*` are evaluated in the enclosing scope, before the element exists.
    const visibility = this.visibility(node);
    if (visibility === "never") return "null";
    const declarations = this.declarations(node, isRoot);
    // A source marker at the element's start: render errors map to the tag.
    const element = this.mark(
      node.start,
      declarations.length === 0 ? this.element(node, scopeVar) : this.container(node, declarations, scopeVar),
    );
    if (!visibility) return element;
    return this.mark(node.start, `$$h($$When, { test: ${visibility}.test, responsive: ${visibility}.responsive, scope: ${scopeVar} }, ${element})`);
  }

  /**
   * Compiles `when` and `when-xs` … `when-xxl`: "never" for a constant false
   * `when` without responsive rules, undefined when the element is always
   * rendered, else the name of a hoisted `{ test, responsive }` object.
   */
  private visibility(node: ElementNode): "never" | string | undefined {
    let test: string | undefined;
    const responsive: [string, string][] = [];
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name !== "when" && !name.startsWith("when-")) continue;
      const breakpoint = name === "when" ? undefined : name.slice(5);
      if (breakpoint !== undefined && !BREAKPOINTS.includes(breakpoint)) {
        this.report(attribute.name, "E015", name);
        continue;
      }
      let code: string;
      if (!attribute.value) {
        code = "true";
      } else {
        const value = this.value(this.segments(attribute as ValuedAttribute));
        if ("constant" in value) {
          // Constant text: "false" and "" are false (as in XMLUI); anything else is true.
          const text = JSON.parse(value.constant) as string;
          code = text.trim() === "false" || text.trim() === "" ? "false" : "true";
        } else {
          code = value.binding;
        }
      }
      if (breakpoint === undefined) test = code;
      else responsive.push([breakpoint, code]);
    }
    if (responsive.length === 0) {
      if (test === undefined || test === "true") return undefined;
      if (test === "false") return "never";
    }
    const entries: [string, string][] = [];
    if (test !== undefined) entries.push(["test", test]);
    if (responsive.length > 0) entries.push(["responsive", `{ ${responsive.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(", ")} }`]);
    return this.hoist("$$w", entries);
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
    const body = this.mark(node.start, this.element(node, "$$c"));
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
      if (attributeName === "when" || attributeName.startsWith("when-")) continue; // see visibility()
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
    const templates: [string, string][] = [];
    const content: ContentNode[] = [];
    for (const child of node.children) {
      if (child.kind === "element" && child.name.full === "event") {
        const handler = this.eventTag(child, metadata, name);
        if (handler) handlers.push(handler);
        continue;
      }
      if (child.kind === "element" && (child.name.full === "variable" || child.name.full === "global")) continue;
      if (child.kind === "element" && child.name.full === "property") {
        const template = this.propertyTag(child, metadata, name);
        if (template) templates.push(template);
        continue;
      }
      content.push(child);
    }
    // Children as the template (Items): unless the template is also given as a <property>.
    const childrenTemplate = metadata.childrenTemplate;
    const meaningful = content.filter((c) => c.kind !== "comment" && !(c.kind === "text" && c.value.trim() === ""));
    if (childrenTemplate && meaningful.length > 0) {
      if (templates.some(([template]) => template === childrenTemplate)) {
        this.report(meaningful[0]!, "E013", `Content besides <property name="${childrenTemplate}">`);
      } else {
        templates.push([childrenTemplate, this.template(content, metadata.templates![childrenTemplate]!.contextVars)]);
      }
    } else {
      for (const child of content) {
        const compiled = this.child(child, scopeVar);
        if (compiled !== undefined) children.push(compiled);
      }
    }
    // onMount / onUnmount (any element): not component props.
    const lifecycle: [string, string][] = [];
    for (let i = handlers.length - 1; i >= 0; i--) {
      const kind = LIFECYCLE[handlers[i]![0]];
      if (kind) {
        lifecycle.unshift([kind, handlers[i]![1]]);
        handlers.splice(i, 1);
      }
    }

    const component = `$$C_${name}`;
    const props = constants.length > 0 ? `{ ${constants.map(([k, v]) => `${jsString(k)}: ${v}`).join(", ")} }` : "null";
    const args = children.length > 0 ? `, ${children.join(", ")}` : "";
    const idValue = node.attributes.find((a) => a.name.full === "id")?.value?.value;
    const id = idValue !== undefined && this.ids.has(idValue) ? idValue : undefined;
    if (bindings.length === 0 && handlers.length === 0 && id === undefined && templates.length === 0 && lifecycle.length === 0) {
      return `$$h(${component}, ${props}${args})`;
    }
    const bindingsName = bindings.length > 0 ? this.hoist("$$b", bindings) : this.empty();
    let handlersPart = "";
    if (handlers.length > 0) {
      handlersPart = `, handlers: ${this.hoist("$$e", handlers)}`;
      const perHandler = (settings: Map<string, unknown>) =>
        handlers
          .map(([prop]) => [prop, settings.get(prop) ?? settings.get("*")] as const)
          .filter(([, value]) => value !== undefined)
          .map(([prop, value]) => `${JSON.stringify(prop)}: ${JSON.stringify(value)}`);
      // Hoisted, so they are stable across renders (Bound keys its handler slots on them).
      const policyEntries = perHandler(policies);
      const timeoutEntries = perHandler(timeouts);
      if (policyEntries.length > 0) handlersPart += `, policies: ${this.hoistRaw("$$q", `{ ${policyEntries.join(", ")} }`)}`;
      if (timeoutEntries.length > 0) handlersPart += `, timeouts: ${this.hoistRaw("$$q", `{ ${timeoutEntries.join(", ")} }`)}`;
    }
    const idPart = id === undefined ? "" : `, id: ${JSON.stringify(id)}`;
    const templatesPart = templates.length > 0 ? `, templates: ${this.hoistRaw("$$t", `{ ${templates.map(([k, v]) => `${jsString(k)}: ${v}`).join(", ")} }`)}` : "";
    const lifecyclePart = lifecycle.length > 0 ? `, lifecycle: ${this.hoist("$$l", lifecycle)}` : "";
    return `$$h($$Bound, { type: ${component}, props: ${props}, bindings: ${bindingsName}${handlersPart}${idPart}${templatesPart}${lifecyclePart}, scope: ${scopeVar} }${args})`;
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
    if (`on${event[0]!.toUpperCase()}${event.slice(1)}` in LIFECYCLE) return true;
    if (metadata.events && Object.hasOwn(metadata.events, event)) return true;
    this.report(span, "E004", event, component);
    return false;
  }

  /** Compiles handler source (statements); returns the handler factory code. */
  private handler(source: string, position: { offsets?: number[]; offset?: number }): string {
    const parsed = parseStatements(source, position);
    this.diagnostics.push(...parsed.diagnostics);
    const result = compileHandler(parsed.program, { scope: this.visibleNames(), variables: this.visibleVariables(), markers: this.markers });
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
        return jsString(node.value);
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
    return this.mark(start, `$$h($$Bound, { type: $$TextNode, bindings: ${this.hoist("$$b", [["value", value.binding]])}, scope: ${scopeVar} })`);
  }
}
