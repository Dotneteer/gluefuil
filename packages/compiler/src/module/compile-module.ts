// Compiles a .pfui document to one JavaScript module whose default export is
// the root React component. See .ai/plan/poc-05-first-app.md.
//
// Output shape:
//   header (imports, or destructuring of $$imports for the "function" format)
//   const $$scope = $$createScope({});
//   const $$b0 = { "value": ($$s) => … };     // one hoisted object per element with bindings
//   function Main() { return $$h(…); }
//   footer (export default, or return)

import { componentMetadata, type ComponentMetadata } from "@patchfuil/components/metadata";
import { compileInterpolation } from "../codegen/compile";
import type { ElementNode, ContentNode } from "../markup/ast";
import { decodeEntitiesWithOffsets } from "../markup/entities";
import { parseMarkup } from "../markup/parser";
import { parseInterpolation, type InterpolationSegment } from "../script/interpolation";
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
  ["createScope", "$$createScope"],
  ["scriptGlobals", "$$g"],
  ["scriptRuntime", "$$r"],
];

/** Attribute forms that later steps implement; reported instead of ignored. */
function unsupportedAttribute(name: string): string | undefined {
  if (/^on[A-Z]/.test(name)) return `The event handler '${name}'`;
  for (const prefix of ["var.", "global.", "method.", "event."]) {
    if (name.startsWith(prefix)) return `The '${prefix}' attribute '${name}'`;
  }
  if (name === "when" || name === "id") return `The '${name}' attribute`;
  return undefined;
}

/** XMLUI's whitespace collapsing (transform.ts collapseWhitespace): every \s except U+00A0. */
const WHITESPACE_RUN = /[\f\n\r\t\v\u0020\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;

export function compileModule(markup: string, options: CompileModuleOptions = {}): CompileModuleResult {
  return new ModuleCompiler(options).compile(markup);
}

class ModuleCompiler {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly components: Readonly<Record<string, ComponentMetadata>>;
  private readonly usedComponents = new Set<string>();
  private readonly hoisted: string[] = [];
  /** Names available to bindings. Variables and ids arrive in steps 6 and 8. */
  private readonly scopeNames = new Set<string>();

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

  compile(markup: string): CompileModuleResult {
    const parsed = parseMarkup(markup);
    this.diagnostics.push(...parsed.diagnostics);
    const root = this.findRoot(parsed.document.children, parsed.document);
    const body = root ? this.element(root) : "null";
    const code = [
      this.header(),
      "const $$scope = $$createScope({});",
      ...this.hoisted,
      `function Main() {\n  return ${body};\n}`,
      this.options.format === "function" ? "return Main;" : "export default Main;",
      "",
    ].join("\n");
    this.diagnostics.sort((a, b) => a.start - b.start);
    return { code, diagnostics: this.diagnostics };
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

  /** Hoists a bindings object; returns its name. */
  private hoist(bindings: [name: string, code: string][]): string {
    const name = `$$b${this.hoisted.length}`;
    const entries = bindings.map(([prop, code]) => `${JSON.stringify(prop)}: ${code}`).join(", ");
    this.hoisted.push(`const ${name} = { ${entries} };`);
    return name;
  }

  /** Compiles one interpolated value; returns a constant (JSON) or binding code. */
  private value(segments: InterpolationSegment[]): { constant: string } | { binding: string } {
    const result = compileInterpolation(segments, { scope: this.scopeNames });
    this.diagnostics.push(...result.diagnostics);
    return result.constant ? { constant: JSON.stringify(result.value) } : { binding: result.code };
  }

  private element(node: ElementNode): string {
    const name = node.name.full;
    if (node.name.prefix === undefined && /^[a-z]/.test(name)) {
      this.report(node.name, "E002", `The helper tag <${name}>`);
      return "null";
    }
    if (node.name.prefix !== undefined || !Object.hasOwn(this.components, name)) {
      this.report(node.name, "E001", name);
      return "null";
    }
    this.usedComponents.add(name);

    const constants: [string, string][] = [];
    const bindings: [string, string][] = [];
    for (const attribute of node.attributes) {
      const attributeName = attribute.name.full;
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
      const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
      const parsed = parseInterpolation(decoded.value, { offsets: decoded.offsets });
      this.diagnostics.push(...parsed.diagnostics);
      const value = this.value(parsed.segments);
      if ("constant" in value) constants.push([attributeName, value.constant]);
      else bindings.push([attributeName, value.binding]);
    }

    const children = this.children(node.children);
    const component = `$$C_${name}`;
    const props = constants.length > 0 ? `{ ${constants.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(", ")} }` : "null";
    const args = children.length > 0 ? `, ${children.join(", ")}` : "";
    if (bindings.length === 0) return `$$h(${component}, ${props}${args})`;
    return `$$h($$Bound, { type: ${component}, props: ${props}, bindings: ${this.hoist(bindings)}, scope: $$scope }${args})`;
  }

  private children(nodes: ContentNode[]): string[] {
    const out: string[] = [];
    for (const node of nodes) {
      switch (node.kind) {
        case "element":
          out.push(this.element(node));
          break;
        case "text": {
          const text = this.text(node.raw, node.start);
          if (text !== undefined) out.push(text);
          break;
        }
        case "cdata":
          // Literal text: no interpolation, no whitespace collapsing.
          out.push(JSON.stringify(node.value));
          break;
        case "script":
          this.report({ start: node.start, end: node.contentSpan.start }, "E002", "<script>");
          break;
        case "comment":
          break;
      }
    }
    return out;
  }

  /** Text content: interpolated; whitespace runs in literal parts collapse to one space. */
  private text(raw: string, start: number): string | undefined {
    const decoded = decodeEntitiesWithOffsets(raw, start);
    if (decoded.value.trim() === "" && !decoded.value.includes(" ")) return undefined;
    const parsed = parseInterpolation(decoded.value, { offsets: decoded.offsets });
    this.diagnostics.push(...parsed.diagnostics);
    const segments = parsed.segments.map((segment) =>
      segment.kind === "literal" ? { ...segment, value: segment.value.replace(WHITESPACE_RUN, " ") } : segment,
    );
    const value = this.value(segments);
    if ("constant" in value) return value.constant;
    return `$$h($$Bound, { type: $$TextNode, bindings: ${this.hoist([["value", value.binding]])}, scope: $$scope })`;
  }
}
