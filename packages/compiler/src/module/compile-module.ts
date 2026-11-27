// Compiles a .gui document to one JavaScript module whose default export is
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

import {
  acceptsLayoutProps,
  attachedBehaviors,
  checkLayoutValue,
  componentMetadata,
  isKnownThemeVariable,
  LAYOUT_PROP_NAMES,
  layoutProp,
  themeVariableNames,
  type BehaviorMetadata,
  type ComponentMetadata,
  type EventMetadata,
  type PropMetadata,
} from "@gluefuil/components/metadata";
import { compileExpression, compileFunction, compileHandler, compileInterpolation } from "../codegen/compile";
import { extractMarkers, jsString, mark } from "../codegen/markers";
import { APP_GLOBALS } from "../codegen/names";
import type { AttributeNode, ContentNode, ElementNode, Span } from "../markup/ast";
import { decodeEntitiesWithOffsets } from "../markup/entities";
import { parseMarkup } from "../markup/parser";
import { parseInterpolation, type InterpolationSegment } from "../script/interpolation";
import { parseMarkdownBindings } from "../script/markdown-bindings";
import type { ArrayExpression, Expression, FunctionDeclaration, Literal } from "../script/ast";
import { parseStatements } from "../script/parse";
import type { Diagnostic } from "../source/diagnostic";
import { buildSourceMap, type SourceMap } from "../source/source-map";
import { didYouMean } from "../source/suggest";
import { analyzeDocument, COMPONENT_NAME, DEFAULT_SLOT, rootGlobalNames, type UserComponentInfo } from "./analyze";
import { checkLiteral } from "./contracts";
import { ModuleDiagnostics, type ModuleDiagnosticCode } from "./diagnostics";
import { shellConfig, type ShellConfig } from "./shell";

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
  /**
   * "esm": the module to import a component from, by name, for components not
   * in `componentsModule` (an app's own React components: the Vite plugin's
   * `extensions`). Their metadata goes in `components`.
   */
  componentModules?: Readonly<Record<string, string>>;
  /** The source file's name, as the source map's `sources` entry. Default "Main.gui". */
  fileName?: string;
  /** Produce a source map (default true). */
  sourceMap?: boolean;
  /**
   * User-defined components of other files (from `analyzeModule`), by name.
   * Components defined in this file are found by the compiler itself.
   */
  userComponents?: Readonly<Record<string, UserComponentInfo>>;
  /**
   * The file's code-behind (`Main.gui.xs`, `components/X.gui.xs`): top-level
   * `var` and `function` declarations for the app root, or for the file's component.
   */
  codeBehind?: string;
  /**
   * Contract violations (unknown props, events and API members, missing
   * required props, invalid literals) are errors (default true), or
   * warnings (false: for migrating XMLUI markup). Deprecations are always
   * warnings. See .ai/plan/poc-15-contracts.md.
   */
  strictContracts?: boolean;
  /**
   * The app's global variables (step 21B: `analyzeModule(entry).globals`),
   * visible inside every `<Component>` body of this file below the
   * component's own names. An app file's own globals need not be listed.
   */
  globals?: readonly string[];
  /**
   * `Globals.xs` (an app file only): top-level `var` and `function`
   * declarations that become globals, beside the root's `global.*`.
   */
  globalsCode?: string;
}

export interface CompileModuleResult {
  code: string;
  /**
   * Source Map v3 from `code` back to the .gui file: every expression,
   * statement, handler and element. Includes the source text.
   */
  map?: SourceMap;
  /** Markup (M), script (S), binding (C) and module (E) diagnostics, in file positions. */
  diagnostics: Diagnostic[];
  /** Diagnostics of the code-behind, in positions of the code-behind source (when given). */
  codeBehindDiagnostics?: Diagnostic[];
  /** Diagnostics of `Globals.xs`, in its positions (when `globalsCode` is given). */
  globalsDiagnostics?: Diagnostic[];
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
  ["BoundUser", "$$BoundUser"],
  ["Slot", "$$Slot"],
  ["useComponent", "$$useComponent"],
  ["Fragment", "$$Fragment"],
  ["GlobalScope", "$$GlobalScope"],
  ["useContextScope", "$$useContextScope"],
  ["scriptGlobals", "$$g"],
  ["scriptRuntime", "$$r"],
  ["deferredValue", "$$deferred"],
  ["optionItems", "$$optionItems"],
  ["OptionContent", "$$OptionContent"],
  ["usePerChildScope", "$$usePerChildScope"],
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
const HELPER_TAGS = new Set(["event", "variable", "global", "property", "method"]);

/** Names every component body sees (runtime useComponent); readable, not writable. */
const COMPONENT_NAMES = ["$props", "$self", "emitEvent", "hasEventHandler"];

/** A user component known to this compilation; `inline`: defined in this file. */
type UserComponent = UserComponentInfo & { inline: boolean };

/** A parsed code-behind file (top-level declarations only). */
interface CodeBehind {
  variables: { name: string; init: Expression | null; start: number; end: number }[];
  functions: FunctionDeclaration[];
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
  /** `global.x` / `<global>` (step 21B): declared in the app's global container. */
  global: boolean;
}

type ValuedAttribute = AttributeNode & { value: NonNullable<AttributeNode["value"]> };

/** What an element gives one of its behaviors: constant props, bindings and handlers. */
interface BehaviorValues {
  constants: [string, string][];
  bindings: [string, string][];
  handlers: [string, string][];
}

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
  /**
   * Step 28: the header key of each TabItem/Step element (`childrenAsHeaders`), set
   * when its Tabs/Stepper compiles its headers, read when the item compiles in place.
   */
  private readonly headerKeys = new Map<ElementNode, { key: string; inItems: boolean }>();
  /** The component IDs of the file (collected before compiling: their order doesn't matter). */
  /** The file's (or the component body's) IDs, each with its component's name. */
  private readonly ids = new Map<string, string>();
  /**
   * IDs of the enclosing templates, innermost last. Each template instance has
   * its own ID scope: its IDs are visible inside it, not outside.
   */
  private readonly templateIds: Map<string, string>[] = [];
  private counter = 0;
  private usesEmpty = false;
  /** User components: other files' (options) and this file's own. */
  private readonly userComponents = new Map<string, UserComponent>();
  /** External user components used, for the "esm" imports. */
  private readonly usedExternal = new Set<string>();
  /** True while compiling a `<Component>` body (`<Slot>` is allowed). */
  private inComponent = false;
  /** The parsed code-behind, and the element it belongs to (the app root or the `<Component>`). */
  private codeBehind: CodeBehind | undefined;
  private codeBehindTarget: ElementNode | undefined;
  private readonly codeBehindDiagnostics: Diagnostic[] = [];
  /** Where code-behind problems go: the file's code-behind, or `Globals.xs` while it compiles. */
  private codeBehindSink: Diagnostic[] = this.codeBehindDiagnostics;
  /** `Globals.xs`, parsed (an app file with `globalsCode`), and its diagnostics. */
  private globalsCode: CodeBehind | undefined;
  private readonly globalsDiagnostics: Diagnostic[] = [];
  /** The globals every `<Component>` body sees (step 21B): the options' and this app file's own. */
  private readonly componentGlobals = new Set<string>();
  /** True while compiling a direct region child of App (AppHeader, NavPanel, Footer): E028 elsewhere. */
  private regionAllowed = false;
  /** The App's shell settings, once compiled; NavPanelCollapseButton elements, checked against them. */
  private shell: ShellConfig | undefined;
  private readonly collapseButtons: Span[] = [];
  /** Elements whose context scope (`childContextVars`) is being compiled: the inner pass compiles the element itself. */
  private readonly contextScoped = new Set<ElementNode>();
  /** The root element of the component being compiled: it applies the layout props given to the component's tag. */
  private layoutRoot: ElementNode | undefined;

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

  /** A contract violation: an error, or a warning when `strictContracts` is false. */
  private reportContract<C extends ModuleDiagnosticCode>(span: { start: number; end: number }, code: C, ...args: Parameters<(typeof ModuleDiagnostics)[C]>): void {
    this.report(span, code, ...args);
    if (this.options.strictContracts === false) this.diagnostics[this.diagnostics.length - 1]!.severity = "warning";
  }

  /** A deprecation: always a warning. */
  private reportDeprecated(span: { start: number; end: number }, what: string, message: string): void {
    this.report(span, "E024", what, message);
    this.diagnostics[this.diagnostics.length - 1]!.severity = "warning";
  }

  /** What the emitter needs for C015: the component and API members behind an ID. */
  private readonly memberLookup = (name: string) => {
    const component = this.idComponent(name);
    if (component === undefined) return undefined;
    const metadata = this.metadataOf(component);
    return { component, members: Object.keys(metadata?.api ?? {}), ...(metadata?.removedApi ? { removed: metadata.removedApi } : {}) };
  };

  /** Options every expression compile gets: contracts. */
  private contractOptions() {
    return { members: this.memberLookup, contractSeverity: this.options.strictContracts === false ? ("warning" as const) : ("error" as const) };
  }

  /** Every name visible at this point: app globals, the file's IDs, and the variables in scope. */
  private visibleNames(): Set<string> {
    const names = new Set<string>([...APP_GLOBALS, ...this.ids.keys()]);
    if (this.inComponent) for (const name of this.componentGlobals) names.add(name);
    for (const frame of this.templateIds) for (const id of frame.keys()) names.add(id);
    for (const frame of this.frames) for (const name of frame) names.add(name);
    for (const frame of this.contextFrames) for (const name of frame) names.add(name);
    return names;
  }

  /** The names a handler may write: the variables in scope. */
  private visibleVariables(): Set<string> {
    const names = new Set<string>();
    for (const frame of this.frames) for (const name of frame) names.add(name);
    // A global in a component body (rank 3b) is writable unless a name of the component shadows it.
    if (this.inComponent) {
      const shadowing = new Set<string>([...COMPONENT_NAMES, ...this.ids.keys()]);
      for (const frame of this.templateIds) for (const id of frame.keys()) shadowing.add(id);
      for (const frame of this.contextFrames) for (const name of frame) shadowing.add(name);
      for (const name of this.componentGlobals) if (!shadowing.has(name) || names.has(name)) names.add(name);
    }
    return names;
  }

  compile(markup: string): CompileModuleResult {
    const parsed = parseMarkup(markup);
    this.diagnostics.push(...parsed.diagnostics);
    const { definitions, app } = this.topLevel(parsed.document.children, parsed.document);
    this.registerComponents(definitions, analyzeDocument(parsed.document).components);
    this.checkParents(parsed.document.children, undefined);
    if (this.options.codeBehind !== undefined) {
      this.codeBehind = this.parseCodeBehind(this.options.codeBehind);
      this.codeBehindTarget = app ?? (definitions.length === 1 ? definitions[0] : undefined);
    }
    // Globals (step 21B): the entry's (options), and an app file's own root and Globals.xs.
    for (const name of this.options.globals ?? []) this.componentGlobals.add(name);
    if (app) {
      for (const name of rootGlobalNames(app)) this.componentGlobals.add(name);
      if (this.options.globalsCode !== undefined) {
        this.codeBehindSink = this.globalsDiagnostics;
        this.globalsCode = this.parseCodeBehind(this.options.globalsCode);
        this.codeBehindSink = this.codeBehindDiagnostics;
        for (const variable of this.globalsCode.variables) this.componentGlobals.add(variable.name);
        for (const fn of this.globalsCode.functions) this.componentGlobals.add(fn.id.name);
      }
    }
    // Component definitions first (hoisted functions); then the app.
    const defined: string[] = [];
    for (const definition of definitions) {
      const name = this.definitionName(definition);
      if (name !== undefined) defined.push(this.componentDefinition(definition, name));
    }
    let exported = "Main";
    let main = "";
    if (app) {
      this.collectIds(app);
      const fileScope = this.ids.size > 0 ? "$$f" : "$$scope";
      const body = this.node(app, fileScope, true);
      const prologue = this.ids.size > 0 ? `  const $$f = $$useFileScope($$scope, ${JSON.stringify([...this.ids.keys()])});\n` : "";
      main = `function Main() {\n${prologue}  return ${body};\n}`;
      // A collapse button needs a collapsible side nav (only checkable in the App's own file).
      if (!(this.shell?.nav?.placement === "side" && this.shell.nav.collapsible)) {
        for (const span of this.collapseButtons) {
          this.report(span, "E028", 'NavPanelCollapseButton needs a collapsible side nav: <NavPanel placement="side" collapsible="true">');
        }
      }
    } else if (definitions.length === 1 && defined.length === 1) {
      exported = defined[0]!;
      this.checkFileName(definitions[0]!);
    } else {
      main = "function Main() {\n  return null;\n}";
    }
    const marked = [
      this.header(),
      "const $$scope = $$createAppScope();",
      ...(this.usesEmpty ? ["const $$empty = Object.freeze({});"] : []),
      ...this.hoisted,
      ...(main ? [main] : []),
      this.options.format === "function" ? `return ${exported};` : `export default ${exported};`,
      "",
    ].join("\n");
    const { code, pairs } = extractMarkers(marked);
    const fileName = this.options.fileName ?? "Main.gui";
    const map = this.options.sourceMap === false ? undefined : buildSourceMap(code, markup, pairs, { source: fileName, file: `${fileName}.js` });
    this.diagnostics.sort((a, b) => a.start - b.start);
    // `await`/`async` in a binding: the parser's S030 already says it; drop the code generator's C009.
    const unsupported = new Set(this.diagnostics.filter((d) => d.code === "S030").map((d) => d.start));
    const diagnostics = this.diagnostics.filter((d) => !(d.code === "C009" && unsupported.has(d.start)));
    return {
      code,
      ...(map ? { map } : {}),
      diagnostics,
      ...(this.options.codeBehind !== undefined ? { codeBehindDiagnostics: this.codeBehindDiagnostics.sort((a, b) => a.start - b.start) } : {}),
      ...(this.options.globalsCode !== undefined ? { globalsDiagnostics: this.globalsDiagnostics.sort((a, b) => a.start - b.start) } : {}),
    };
  }

  /**
   * The top level: `<Component>` definitions, and at most one app element.
   * A file with no app element must be exactly one `<Component>` (a component file).
   */
  /**
   * Components that belong inside others (`parents`, step 27: a MenuItem in a menu): the
   * nearest enclosing component decides. `Items` and `<property>` templates in between
   * are transparent; a `<Component>` root or a user component (its slot content) can't be
   * checked here, so it passes.
   */
  private checkParents(nodes: readonly ContentNode[], enclosing: string | undefined): void {
    for (const node of nodes) {
      if (node.kind !== "element") continue;
      const name = node.name.full;
      const metadata = node.name.prefix === undefined ? this.components[name] : undefined;
      const parents = metadata?.parents;
      if (parents && enclosing !== undefined && !parents.includes(enclosing)) {
        const list = parents.map((p) => `<${p}>`);
        this.report(node.name, "E037", name, list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0]!);
      }
      // What the children see as their enclosing component.
      let next = enclosing;
      if (name === "Component" || this.userComponents.has(name)) next = undefined;
      else if (metadata && name !== "Items") next = name;
      this.checkParents(node.children, next);
    }
  }

  private topLevel(nodes: ContentNode[], document: { start: number; end: number }): { definitions: ElementNode[]; app?: ElementNode } {
    const definitions: ElementNode[] = [];
    let app: ElementNode | undefined;
    for (const node of nodes) {
      if (node.kind === "comment") continue;
      if (node.kind === "text" && node.value.trim() === "") continue;
      if (node.kind === "element" && node.name.full === "Component") {
        definitions.push(node);
        continue;
      }
      if (node.kind === "element" && !app) {
        app = node;
        continue;
      }
      this.report(node, "E003", node.kind === "element" ? "a second root element" : "content outside the root element");
    }
    if (!app && definitions.length === 0) this.report(document, "E003", "the document has none");
    if (!app && definitions.length > 1) {
      this.report(definitions[1]!.name, "E003", "a file without app markup must define exactly one <Component>");
    }
    return { definitions, ...(app ? { app } : {}) };
  }

  /** Registers other files' components (options) and this file's definitions, reporting conflicts (E016). */
  private registerComponents(definitions: ElementNode[], analyzed: UserComponentInfo[]): void {
    for (const [name, info] of Object.entries(this.options.userComponents ?? {})) {
      this.userComponents.set(name, { ...info, name, inline: false });
    }
    const own = new Set<string>();
    for (const definition of definitions) {
      const nameAttribute = definition.attributes.find((a) => a.name.full === "name");
      const name = nameAttribute?.value?.value;
      const span = nameAttribute?.value ?? definition.name;
      if (name === undefined || !COMPONENT_NAME.test(name)) {
        this.report(span, "E016", "<Component> needs a constant 'name': an uppercase letter, then letters, digits, '_' or '$'");
        continue;
      }
      if (own.has(name)) {
        this.report(span, "E016", `The component '${name}' is defined twice in this file`);
        continue;
      }
      own.add(name);
      if (Object.hasOwn(this.components, name)) {
        this.report(span, "E016", `'${name}' is a built-in component; choose another name`);
        continue;
      }
      if (this.userComponents.has(name)) {
        this.report(span, "E016", `The component '${name}' is also defined in components/${name}.gui`);
        continue;
      }
      const info = analyzed.find((c) => c.name === name)!;
      this.userComponents.set(name, { ...info, inline: true });
    }
  }

  /** The name of a definition registered by registerComponents (undefined if it was rejected). */
  private definitionName(definition: ElementNode): string | undefined {
    const name = definition.attributes.find((a) => a.name.full === "name")?.value?.value;
    const known = name === undefined ? undefined : this.userComponents.get(name);
    return known?.inline ? name : undefined;
  }

  /** A component file's name must match its component (`components/X.gui` holds `X`). */
  private checkFileName(definition: ElementNode): void {
    const fileName = this.options.fileName;
    if (fileName === undefined) return;
    const base = fileName.split(/[\\/]/).pop()!.replace(/\.gui$/, "");
    const name = definition.attributes.find((a) => a.name.full === "name")!.value!;
    if (base !== name.value) {
      this.report(name, "E016", `The file '${fileName}' must define '${base}', not '${name.value}'`);
    }
  }

  // --- User-defined components ----------------------------------------------------------

  /**
   * Compiles `<Component name="X">` to a hoisted function component `$$U_X`
   * (see the runtime's useComponent). Its body has its own IDs and variables
   * and sees nothing of the file it is used from (isolation).
   */
  private componentDefinition(definition: ElementNode, name: string): string {
    const saved = {
      ids: new Map(this.ids),
      templateIds: [...this.templateIds],
      frames: [...this.frames],
      contextFrames: [...this.contextFrames],
      inComponent: this.inComponent,
    };
    this.ids.clear();
    this.templateIds.length = 0;
    this.frames.length = 0;
    this.contextFrames.length = 0;
    this.inComponent = true;

    for (const attribute of definition.attributes) {
      const full = attribute.name.full;
      if (full === "name" || full.startsWith("var.") || full.startsWith("global.") || full.startsWith("method.")) continue;
      this.report(attribute.name, "E016", `<Component> does not take '${full}': use var.*, method.* or <variable>/<method> children`);
    }
    const body: ElementNode[] = [];
    const content: ContentNode[] = [];
    for (const child of definition.children) {
      if (child.kind === "element" && ["variable", "global", "method"].includes(child.name.full)) continue;
      if (child.kind === "element") body.push(child);
      content.push(child);
    }
    for (const element of body) this.collectIds(element);
    const declarations = this.declarations(definition, false);
    const codeBehind = definition === this.codeBehindTarget ? this.codeBehind : undefined;
    // Pushes one frame each onto `frames` and `contextFrames`; restored below.
    const definitions = this.scopeEntries(declarations, codeBehind, COMPONENT_NAMES);

    const methods: [string, string][] = [];
    for (const attribute of definition.attributes) {
      if (!attribute.name.full.startsWith("method.")) continue;
      const method = attribute.name.full.slice("method.".length);
      if (!VARIABLE_NAME.test(method)) {
        this.report(attribute.name, "E016", `'${method}' is not a valid method name`);
        continue;
      }
      const decoded = attribute.value ? decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start) : { value: "", offsets: [attribute.end] };
      methods.push([method, this.handler(decoded.value, { offsets: decoded.offsets })]);
    }
    for (const child of definition.children) {
      if (child.kind !== "element" || child.name.full !== "method") continue;
      const method = this.methodTag(child);
      if (method) methods.push(method);
    }
    const methodsName = methods.length > 0 ? this.hoist("$$m", methods) : this.empty();

    // The layout props of the component's tag go to its root element (steps 19D–19E).
    const savedLayoutRoot = this.layoutRoot;
    this.layoutRoot = body.length === 1 ? body[0] : undefined;
    const parts: string[] = [];
    for (const child of content) {
      const compiled = this.child(child, "$$c");
      if (compiled !== undefined) parts.push(compiled);
    }
    this.layoutRoot = savedLayoutRoot;
    const rendered = parts.length === 0 ? "null" : parts.length === 1 ? parts[0]! : `$$h($$Fragment, null, ${parts.join(", ")})`;
    const ids = JSON.stringify([...this.ids.keys()]);

    this.frames.length = 0;
    this.frames.push(...saved.frames);
    this.contextFrames.length = 0;
    this.contextFrames.push(...saved.contextFrames);
    this.ids.clear();
    for (const [id, component] of saved.ids) this.ids.set(id, component);
    this.templateIds.length = 0;
    this.templateIds.push(...saved.templateIds);
    this.inComponent = saved.inComponent;

    const fn = `$$U_${name}`;
    this.hoisted.push(
      `function ${fn}({ input: $$in }) {\n  const $$c = $$useComponent($$in, $$scope, ${definitions}, ${methodsName}, ${ids});\n  return ${rendered};\n}\n${fn}.displayName = ${JSON.stringify(name)};`,
    );
    return fn;
  }

  /**
   * The names of a container or component: its markup variables, and its
   * code-behind variables and functions. Pushes a writable frame (variables)
   * and a read-only frame (functions, `readonlyNames`): the caller pops both.
   * Returns the hoisted definitions object (runtime VariableDefinition).
   */
  private scopeEntries(declarations: Declaration[], codeBehind: CodeBehind | undefined, readonlyNames: readonly string[] = []): string {
    const own = new Set(declarations.map((d) => d.name));
    const codeVariables: CodeBehind["variables"] = [];
    const functions: FunctionDeclaration[] = [];
    const functionNames = new Set<string>();
    const clash = (name: string) => own.has(name) || functionNames.has(name) || this.isId(name);
    for (const variable of codeBehind?.variables ?? []) {
      if (clash(variable.name)) {
        this.reportCodeBehind(variable, `'${variable.name}' is declared twice (in the markup or the code-behind), or is a component id`);
        continue;
      }
      own.add(variable.name);
      codeVariables.push(variable);
    }
    for (const fn of codeBehind?.functions ?? []) {
      if (clash(fn.id.name)) {
        this.reportCodeBehind(fn.id, `'${fn.id.name}' is declared twice (in the markup or the code-behind), or is a component id`);
        continue;
      }
      functionNames.add(fn.id.name);
      functions.push(fn);
    }
    this.frames.push(own);
    this.contextFrames.push(new Set([...readonlyNames, ...functionNames]));

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
    for (const variable of codeVariables) {
      if (!variable.init) {
        entries.push([variable.name, "{ value: undefined }"]);
        continue;
      }
      const result = compileExpression(variable.init, { scope: this.visibleNames(), markers: false, ...this.contractOptions() });
      this.codeBehindSink.push(...result.diagnostics);
      entries.push([variable.name, `{ init: ${result.code} }`]);
      graph.set(variable.name, result.dependencies.filter((d) => own.has(d)));
    }
    for (const fn of functions) {
      const result = compileFunction(fn, { scope: this.visibleNames(), variables: this.visibleVariables(), markers: false, ...this.contractOptions() });
      this.codeBehindSink.push(...result.diagnostics);
      entries.push([fn.id.name, `{ fn: ${result.code} }`]);
    }
    this.reportCycles(graph, (name, cycle) => {
      const declaration = declarations.find((d) => d.name === name);
      if (declaration) this.report(declaration.span, "E005", cycle);
      else this.reportCodeBehind(codeVariables.find((v) => v.name === name)!, ModuleDiagnostics.E005(cycle), "E005");
    });
    return entries.length > 0 ? this.hoist("$$v", entries) : this.empty();
  }

  /** A code-behind diagnostic (positions in the code-behind source). */
  private reportCodeBehind(span: { start: number; end: number }, message: string, code: ModuleDiagnosticCode = "E019"): void {
    this.codeBehindSink.push({ code, severity: "error", message, start: span.start, end: span.end });
  }

  /** Parses code-behind: top-level `var` and `function` declarations only (E019). */
  private parseCodeBehind(source: string): CodeBehind {
    const parsed = parseStatements(source, { offset: 0 });
    this.codeBehindSink.push(...parsed.diagnostics);
    const result: CodeBehind = { variables: [], functions: [] };
    for (const statement of parsed.program.body) {
      if (statement.type === "FunctionDeclaration") {
        result.functions.push(statement);
      } else if (statement.type === "VariableDeclaration" && statement.kind === "var") {
        for (const declarator of statement.declarations) {
          if (declarator.id.type !== "Identifier") {
            this.reportCodeBehind(declarator.id, "A code-behind 'var' declares one name: destructuring is not supported");
            continue;
          }
          result.variables.push({ name: declarator.id.name, init: declarator.init, start: declarator.id.start, end: declarator.id.end });
        }
      } else {
        this.reportCodeBehind(statement, "Only 'var' and 'function' declarations are allowed at the top level of a code-behind file");
      }
    }
    return result;
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
    const lines = [`import { ${runtime} } from ${JSON.stringify(this.options.runtimeModule ?? "@gluefuil/runtime")};`];
    // Grouped by module: the built-ins, and each app module of `componentModules`.
    const byModule = new Map<string, string[]>();
    for (const c of components) {
      const module = this.options.componentModules?.[c] ?? this.options.componentsModule ?? "@gluefuil/components";
      byModule.set(module, [...(byModule.get(module) ?? []), c]);
    }
    for (const [module, names] of byModule) {
      lines.push(`import { ${names.map((c) => `${c} as $$C_${c}`).join(", ")} } from ${JSON.stringify(module)};`);
    }
    for (const name of [...this.usedExternal].sort()) {
      lines.push(`import $$U_${name} from ${JSON.stringify(this.userComponents.get(name)!.module)};`);
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
    // IDs in this template (not in nested ones): one ID scope per instance.
    const ids = new Map<string, string>();
    this.templateIds.push(ids);
    for (const child of content) if (child.kind === "element") this.collectIds(child, ids);
    // The ID scope is created by a hook: a template function runs as part of
    // its TemplateInstance's render, always the same function, so it is safe.
    const scopeVar = ids.size > 0 ? "$$i" : "$$c";
    const parts: string[] = [];
    for (const child of content) {
      const compiled = this.child(child, scopeVar);
      if (compiled !== undefined) parts.push(compiled);
    }
    this.templateIds.pop();
    this.contextFrames.pop();
    const body = parts.length === 0 ? "null" : parts.length === 1 ? parts[0]! : `$$h($$Fragment, null, ${parts.join(", ")})`;
    const name = `$$T${this.counter++}`;
    const prologue = ids.size > 0 ? `  const $$i = $$useFileScope($$c, ${JSON.stringify([...ids.keys()])});\n` : "";
    this.hoisted.push(`function ${name}($$c) {\n${prologue}  return ${body};\n}`);
    return name;
  }

  /** Whether a name is a component ID visible here: the template's, an enclosing template's, or the file's. */
  private isId(name: string): boolean {
    return this.idComponent(name) !== undefined;
  }

  /** The component behind a visible ID (innermost scope first). */
  private idComponent(name: string): string | undefined {
    for (let i = this.templateIds.length - 1; i >= 0; i--) {
      const component = this.templateIds[i]!.get(name);
      if (component !== undefined) return component;
    }
    return this.ids.get(name);
  }

  /** `<property name="itemTemplate">markup</property>`: a template prop (E013 otherwise). */
  private propertyTag(tag: ElementNode, metadata: ComponentMetadata, component: string): [string, string] | undefined {
    const nameAttribute = tag.attributes.find((a) => a.name.full === "name");
    const property = nameAttribute?.value?.value;
    if (property === undefined || property.includes("{")) {
      this.report(tag.name, "E008", "<property> needs a constant 'name'");
      return undefined;
    }
    const template = property.startsWith("$") ? undefined : metadata.templates?.[property];
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
    const result = compileInterpolation(segments, { scope: this.visibleNames(), markers: this.markers, ...this.contractOptions() });
    this.diagnostics.push(...result.diagnostics);
    return result.constant
      ? { constant: jsString(result.value!) }
      : { binding: result.code, dependencies: result.dependencies };
  }

  /**
   * Collects the IDs of one ID scope (the file, a component body, or a
   * template) into `into`: E010 duplicate (also of an ID visible from an
   * enclosing scope), E011 invalid. Template content is its own scope, collected
   * when the template is compiled.
   */
  private collectIds(node: ElementNode, into: Map<string, string> = this.ids): void {
    const attribute = node.attributes.find((a) => a.name.full === "id");
    if (attribute) {
      const value = attribute.value?.value;
      // Step 32: an anchor id (Bookmark) may be any name (`getting-started`); one that isn't an identifier has no API.
      const anchorOnly = value !== undefined && value !== "" && !VARIABLE_NAME.test(value) && this.metadataOf(node.name.full)?.receivesId === true;
      if (anchorOnly) {
        // Not a component ID: nothing to collect.
      } else if (value === undefined || !VARIABLE_NAME.test(value)) {
        this.report(attribute.value ?? attribute.name, "E011", value ?? "");
      } else if (into.has(value) || (into !== this.ids && this.isId(value))) {
        this.report(attribute.value!, "E010", value);
      } else {
        into.set(value, node.name.full);
      }
    }
    const childrenAreTemplate = Boolean(this.metadataOf(node.name.full)?.childrenTemplate);
    for (const child of node.children) {
      if (child.kind !== "element") continue;
      const isProperty = child.name.full === "property";
      const isHelper = HELPER_TAGS.has(child.name.full);
      if (isProperty || (childrenAreTemplate && !isHelper)) continue;
      this.collectIds(child, into);
    }
  }

  // --- Elements -------------------------------------------------------------------------

  /** An element rendered in the runtime scope held by the JavaScript variable `scopeVar`. */
  private node(node: ElementNode, scopeVar: string, isRoot: boolean): string {
    const name = node.name.full;
    const regionAllowed = this.regionAllowed;
    this.regionAllowed = false;
    if (node.name.prefix === undefined && /^[a-z]/.test(name)) {
      this.report(node.name, "E002", `The helper tag <${name}>`);
      return "null";
    }
    if (name === "Component") {
      this.report(node.name, "E016", "<Component> is allowed only at the top level of a file");
      return "null";
    }
    if (name === "Slot") {
      if (!this.inComponent) {
        this.report(node.name, "E017", "<Slot> is allowed only inside a <Component>");
        return "null";
      }
      return this.slot(node, scopeVar);
    }
    if (node.name.prefix !== undefined || !this.metadataOf(name)) {
      this.report(node.name, "E001", name, didYouMean(name, [...Object.keys(this.components), ...this.userComponents.keys()]));
      return "null";
    }
    // A component that no longer exists (FlowLayout): what to use instead.
    const removed = this.metadataOf(name)?.removed;
    if (removed !== undefined) {
      this.reportContract(node.name, "E032", name, removed);
      return "null";
    }
    // Step 32: a deprecated component (ToneChangerButton) is a warning.
    const deprecated = this.metadataOf(name)?.deprecationMessage;
    if (deprecated !== undefined) this.reportDeprecated(node.name, `'${name}'`, deprecated);
    // Shell regions belong to App (step 19A).
    if (this.metadataOf(name)?.isRegion && !regionAllowed) {
      this.report(node.name, "E028", `<${name}> must be a direct child of <App>`);
      return "null";
    }
    if (name === "NavPanelCollapseButton") this.collapseButtons.push(node.name);
    // A route (Page) must stay a direct element for Pages to read its url (E027).
    if (this.metadataOf(name)?.isRoute) {
      const wrapping = node.attributes.find((a) => a.name.full === "when" || a.name.full.startsWith("when-") || a.name.full.startsWith("var."));
      const variable = node.children.find((c) => c.kind === "element" && c.name.full === "variable");
      if (wrapping) this.report(wrapping.name, "E027", wrapping.name.full.startsWith("var.") ? "variables" : "when");
      else if (variable && variable.kind === "element") this.report(variable.name, "E027", "variables");
    }
    // `when` / `when-*` are evaluated in the enclosing scope, before the element exists.
    const visibility = this.metadataOf(name)?.whenIsProp ? this.whenAsProp(node) : this.visibility(node);
    if (visibility === "never") return "null";
    const declarations = this.declarations(node, isRoot);
    const locals = declarations.filter((d) => !d.global);
    const hasCodeBehind = node === this.codeBehindTarget && this.codeBehind !== undefined;
    const inner = (scope: string) => (locals.length === 0 && !hasCodeBehind ? this.element(node, scope) : this.container(node, locals, scope));
    const globals = declarations.filter((d) => d.global);
    // A source marker at the element's start: render errors map to the tag.
    const element = this.mark(
      node.start,
      isRoot && (globals.length > 0 || this.globalsCode !== undefined) ? this.globalContainer(globals, locals, scopeVar, inner) : inner(scopeVar),
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
      if (this.isId(name)) {
        this.report(span, "E012", name);
        return;
      }
      seen.add(name);
      found.push({ name, span, value, keyOnly, global });
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

  /**
   * The app's globals (step 21B): `global.*` / `<global>` of the root and
   * `Globals.xs`, in a container around the root's own variables. Its scope
   * holds only the globals; it provides that scope (`GlobalScope`) to the user
   * components below, whose scopes inherit from it.
   */
  private globalContainer(globals: Declaration[], locals: Declaration[], scopeVar: string, inner: (scope: string) => string): string {
    // A Globals.xs name the root also declares as its own (var.*, Main.gui.xs) would be hidden in Main.
    if (this.globalsCode) {
      const rootNames = new Set([...locals.map((d) => d.name), ...(this.codeBehind?.variables.map((v) => v.name) ?? []), ...(this.codeBehind?.functions.map((f) => f.id.name) ?? [])]);
      this.codeBehindSink = this.globalsDiagnostics;
      for (const item of [...this.globalsCode.variables, ...this.globalsCode.functions.map((f) => ({ name: f.id.name, start: f.id.start, end: f.id.end }))]) {
        if (rootNames.has(item.name)) this.reportCodeBehind(item, `'${item.name}' is also declared on the app's root element or in its code-behind`, "E007");
      }
      this.codeBehindSink = this.codeBehindDiagnostics;
    }
    this.codeBehindSink = this.globalsDiagnostics;
    const definitions = this.scopeEntries(globals, this.globalsCode);
    this.codeBehindSink = this.codeBehindDiagnostics;
    const body = inner("$$c");
    this.frames.pop();
    this.contextFrames.pop();
    const component = `$$K${this.counter++}`;
    this.hoisted.push(`function ${component}({ $$p }) {\n  const $$c = $$useScope($$p, ${definitions});\n  return $$h($$GlobalScope, { scope: $$c }, ${body});\n}`);
    return `$$h(${component}, { $$p: ${scopeVar} })`;
  }

  /** An element declaring variables: its own component, which creates them once per instance. */
  private container(node: ElementNode, declarations: Declaration[], scopeVar: string): string {
    const codeBehind = node === this.codeBehindTarget ? this.codeBehind : undefined;
    const definitions = this.scopeEntries(declarations, codeBehind);
    const body = this.mark(node.start, this.element(node, "$$c"));
    this.frames.pop();
    this.contextFrames.pop();
    const component = `$$K${this.counter++}`;
    this.hoisted.push(`function ${component}({ $$p }) {\n  const $$c = $$useScope($$p, ${definitions});\n  return ${body};\n}`);
    return `$$h(${component}, { $$p: ${scopeVar} })`;
  }

  /** Reports each cycle among one scope's variables once (E005): `report(name, "a → b → a")`. */
  private reportCycles(graph: Map<string, string[]>, report: (name: string, cycle: string) => void): void {
    const state = new Map<string, "visiting" | "done">();
    const stack: string[] = [];
    const visit = (name: string) => {
      state.set(name, "visiting");
      stack.push(name);
      for (const next of graph.get(name) ?? []) {
        if (state.get(next) === "visiting") {
          report(next, [...stack.slice(stack.indexOf(next)), next].join(" → "));
        } else if (!state.has(next)) {
          visit(next);
        }
      }
      stack.pop();
      state.set(name, "done");
    };
    for (const name of graph.keys()) if (!state.has(name)) visit(name);
  }

  /**
   * A component's metadata: built-in, or derived from a user component's
   * interface (any prop and event; its slots as templates; the default slot
   * as the children template).
   */
  private metadataOf(name: string): ComponentMetadata | undefined {
    if (Object.hasOwn(this.components, name)) return this.components[name];
    const user = this.userComponents.get(name);
    if (!user) return undefined;
    const templates: NonNullable<ComponentMetadata["templates"]> = {};
    for (const [slot, contextVars] of Object.entries(user.slots)) {
      templates[slot] = { description: `The '${slot}' slot`, contextVars };
    }
    // Derived by analyzeModule: the `$props` members it reads, the events it
    // emits, its methods. An absent list means "any".
    const described = (names: readonly string[], what: string) =>
      Object.fromEntries(names.map((n) => [n, { description: `${what} of '${name}'`, valueType: "any" as const }]));
    return {
      description: `The user-defined component '${name}'`,
      props: described(user.props ?? [], "A prop"),
      events: described(user.events ?? [], "An event"),
      api: described(user.methods, "A method"),
      templates,
      ...(Object.hasOwn(user.slots, DEFAULT_SLOT) ? { childrenTemplate: DEFAULT_SLOT } : {}),
      ...(user.props === undefined ? { allowArbitraryProps: true } : {}),
      ...(user.events === undefined ? { allowArbitraryEvents: true } : {}),
    };
  }

  /** How compiled code refers to a user component. */
  private userComponentRef(name: string, span: Span): string {
    const user = this.userComponents.get(name)!;
    if (user.inline) return `$$U_${name}`;
    // "function" format: looked up at render time, so components can refer to each other in cycles.
    if (this.options.format === "function") return `$$imports.components[${jsString(name)}]`;
    if (user.module === undefined) {
      this.report(span, "E016", `The component '${name}' has no module to import it from (userComponents.${name}.module)`);
      return "null";
    }
    this.usedExternal.add(name);
    return `$$U_${name}`;
  }

  /** The element itself: props, bindings, handlers and children. */
  private element(node: ElementNode, scopeVar: string): string {
    const name = node.name.full;
    const isUser = !Object.hasOwn(this.components, name);
    const metadata = this.metadataOf(name)!;
    // An alias (HStack) renders another component (Stack) with fixed props, unless set.
    const alias = isUser ? undefined : metadata.alias;
    const rendered = alias?.component ?? name;
    if (!isUser) this.usedComponents.add(rendered);
    const isLayoutRoot = node === this.layoutRoot;
    // Context variables for the attributes and children (Form's $data, step 22): a container
    // creates the scope, the component fills it; the element compiles inside it.
    const contextVars = isUser ? undefined : metadata.childContextVars;
    if (contextVars && contextVars.length > 0 && !this.contextScoped.has(node)) {
      this.contextScoped.add(node);
      this.contextFrames.push(new Set(contextVars));
      const body = this.element(node, "$$c");
      this.contextFrames.pop();
      const container = `$$K${this.counter++}`;
      this.hoisted.push(`function ${container}({ $$p }) {\n  const $$c = $$useContextScope($$p, ${JSON.stringify(contextVars)});\n  return ${body};\n}`);
      return `$$h(${container}, { $$p: ${scopeVar} })`;
    }

    const constants: [string, string][] = [];
    if (contextVars && contextVars.length > 0) constants.push(["contextScope", scopeVar]);
    // Mounted by its `when` (step 27: a ModalDialog): open as it mounts.
    if (!isUser && metadata.openedByWhen && node.attributes.some((a) => a.name.full === "when" || a.name.full.startsWith("when-"))) {
      constants.push(["$$whenOpen", "true"]);
    }
    for (const [prop, value] of Object.entries(alias?.props ?? {})) {
      if (!node.attributes.some((a) => a.name.full === prop)) constants.push([prop, jsString(value)]);
    }
    // Step 32: the literal id as a prop (Bookmark: its anchor's DOM id).
    if (!isUser && metadata.receivesId) {
      const literalId = node.attributes.find((a) => a.name.full === "id")?.value?.value;
      if (literalId !== undefined && literalId !== "") constants.push(["$$id", jsString(literalId)]);
    }
    const bindings: [string, string][] = [];
    const handlers: [string, string][] = [];
    // Step 28: a TabItem/Step's key, the same as in its parent's compiled headers.
    const headerKey = isUser ? undefined : this.headerKeys.get(node);
    if (headerKey && !headerKey.inItems) constants.push(["$$key", jsString(headerKey.key)]);
    else if (headerKey) bindings.push(["$$key", this.itemKey(headerKey.key)]);
    // Behaviors (step 18): decided from the attributes the element sets; their
    // props go to them, not to the component.
    const behaviors = attachedBehaviors(metadata, new Set(node.attributes.map((a) => a.name.full)));
    const behaviorValues = new Map<BehaviorMetadata, BehaviorValues>(behaviors.map((b) => [b, { constants: [], bindings: [], handlers: [] }]));
    // `handlerPolicy` / `handlerTimeoutMs`, for all handlers ("*") or one (`:onClick`).
    const policies = new Map<string, string>();
    const timeouts = new Map<string, number>();
    for (const attribute of node.attributes) {
      const attributeName = attribute.name.full;
      if (attributeName.startsWith("var.") || attributeName.startsWith("global.")) continue;
      if (attributeName === "id") continue; // collected by collectIds; passed to Bound below
      if (attributeName === "when" && metadata.whenIsProp) {
        // A loader's `when`: a prop (it stays mounted and doesn't fetch), see whenAsProp().
      } else if (attributeName === "when" || attributeName.startsWith("when-")) continue; // see visibility()
      const concurrency = attribute.name.prefix ?? attribute.name.local;
      if (concurrency === "handlerPolicy" || concurrency === "handlerTimeoutMs") {
        this.concurrencyAttribute(attribute, metadata, name, concurrency === "handlerPolicy" ? policies : timeouts);
        continue;
      }
      if (/^on[A-Z]/.test(attributeName)) {
        const event = attributeName[2]!.toLowerCase() + attributeName.slice(3);
        // An event of an attached behavior (onValidate, step 22): the behavior's handler.
        const owner = Object.hasOwn(metadata.events ?? {}, event) ? undefined : behaviors.find((b) => Object.hasOwn(b.events ?? {}, event));
        if (owner) {
          if (!attribute.value) continue;
          const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
          behaviorValues.get(owner)!.handlers.push([attributeName, this.handler(decoded.value, { offsets: decoded.offsets }, owner.events?.[event])]);
          continue;
        }
        if (!this.checkEvent(metadata, name, event, attribute.name) || !attribute.value) continue;
        const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
        handlers.push([attributeName, this.handler(decoded.value, { offsets: decoded.offsets }, metadata.events?.[event])]);
        continue;
      }
      const unsupported = unsupportedAttribute(attributeName);
      if (unsupported) {
        this.report(attribute.name, "E002", unsupported);
        continue;
      }
      const removed = metadata.removedProps?.[attributeName];
      if (removed) {
        const text = attribute.value && !attribute.value.value.includes("{") ? attribute.value.value.trim() : undefined;
        const instead = (text !== undefined ? removed.byValue?.[text] : undefined) ?? removed.message;
        this.reportContract(attribute.name, "E030", attributeName, name, instead);
        continue;
      }
      // A prop the component keeps to itself (`exclusive`, step 26) never goes to a behavior.
      const exclusive = Object.hasOwn(metadata.props, attributeName) && metadata.props[attributeName]!.exclusive === true;
      const behavior = exclusive ? undefined : behaviors.find((b) => Object.hasOwn(b.props, attributeName));
      // A prop the component declares too goes to both (step 24: NumberBox minValue is the input's
      // limit and the validation's range rule). The behavior checks its literal; the component's copy isn't checked again.
      const shared = behavior !== undefined && Object.hasOwn(metadata.props, attributeName);
      if (behavior) {
        this.behaviorAttribute(attribute, behavior.props[attributeName]!, behaviorValues.get(behavior)!);
        if (!shared) continue;
      }
      const prop = shared ? undefined : Object.hasOwn(metadata.props, attributeName) ? metadata.props[attributeName]! : layoutProp(metadata, attributeName);
      if (shared) {
        if (!attribute.value) constants.push([attributeName, '"true"']);
        else {
          const value = this.propValue(attribute as ValuedAttribute, metadata.props[attributeName]);
          if ("constant" in value) constants.push([attributeName, value.constant]);
          else bindings.push([attributeName, value.binding]);
        }
        continue;
      }
      if (!prop && metadata.themeVarAttributes) {
        // `<Theme backgroundColor-Button="…">`: a theme variable (step 17).
        const known = this.themeVariables();
        if (!isKnownThemeVariable(attributeName, known)) this.reportContract(attribute.name, "E025", attributeName, didYouMean(attributeName, known));
      } else if (!prop && !metadata.allowArbitraryProps) {
        this.reportContract(attribute.name, "E020", attributeName, name, didYouMean(attributeName, Object.keys(metadata.props)));
      }
      if (prop?.deprecationMessage !== undefined) {
        this.reportDeprecated(attribute.name, `The prop '${attributeName}' of '${name}'`, prop.deprecationMessage);
      }
      if (prop?.variableName) {
        // Step 29 (List syncWithVar): the value and a setter of a variable named by a literal.
        const named = this.variableNameProp(attribute, attributeName, name);
        if (named) {
          bindings.push([attributeName, named.binding]);
          handlers.push([`$$set${attributeName[0]!.toUpperCase()}${attributeName.slice(1)}`, named.setter]);
        }
        continue;
      }
      if (!attribute.value) {
        // A key-only attribute means "true" (XMLUI transform.ts desugarKeyOnlyAttrs).
        if (prop) this.checkPropLiteral(prop, attributeName, "true", attribute.name);
        constants.push([attributeName, '"true"']);
        continue;
      }
      const value = this.propValue(attribute as ValuedAttribute, prop);
      if ("constant" in value) {
        if (prop) this.checkPropLiteral(prop, attributeName, JSON.parse(value.constant) as string, attribute.value);
        if (prop?.cssKind) this.checkCssLiteral(prop, attributeName, JSON.parse(value.constant) as string, attribute.value);
        constants.push([attributeName, value.constant]);
      } else if (prop?.deferred) {
        // Evaluated when the component asks, with its context variables ($param): a function, not a binding.
        constants.push([attributeName, `$$deferred(${scopeVar}, ${this.hoistRaw("$$d", value.binding)})`]);
      } else {
        if (prop?.isLiteral) this.reportContract(attribute.value, "E026", attributeName, name);
        bindings.push([attributeName, value.binding]);
      }
    }
    // Required props: set as an attribute (any form) or as a template property.
    for (const [propName, prop] of Object.entries(metadata.props)) {
      if (prop.isRequired && !node.attributes.some((a) => a.name.full === propName)) {
        this.reportContract(node.name, "E021", propName, name);
      }
    }

    const children: string[] = [];
    const templates: [string, string][] = [];
    const content: ContentNode[] = [];
    const regionNodes: ElementNode[] = [];
    for (const child of node.children) {
      if (metadata.regions && child.kind === "element" && Object.hasOwn(metadata.regions, child.name.full)) {
        regionNodes.push(child);
        continue;
      }
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
    if (!isUser && metadata.childrenAsHeaders) {
      // Step 28: the headers are data; the children still compile in place (below).
      bindings.push(["$$headers", this.hoistRaw("$$o", `($$s) => [${this.headerParts(content, "$$s", name, metadata.childrenAsHeaders.item).join(", ")}]`)]);
    }
    if (!isUser && metadata.childrenAsColumns) {
      // Step 30: Column children are data (props, cell template, handlers); nothing compiles in place.
      if (meaningful.length > 0) bindings.push(["$$columns", this.hoistRaw("$$o", `($$s) => [${this.columnParts(content, "$$s", name, metadata.childrenAsColumns).join(", ")}]`)]);
    } else if (!isUser && metadata.childrenAsOptions) {
      // Step 25: the children are data, one reactive options array.
      const data = node.attributes.find((a) => a.name.full === "data");
      if (meaningful.length > 0 && data) this.report(data.name, "E036", name);
      else if (meaningful.length > 0) bindings.push(["$$options", this.hoistRaw("$$o", `($$s) => [${this.optionParts(content, "$$s", name).join(", ")}]`)]);
    } else if (isUser && !childrenTemplate && meaningful.length > 0) {
      this.report(meaningful[0]!, "E018", name);
    } else if (childrenTemplate && meaningful.length > 0) {
      if (templates.some(([template]) => template === childrenTemplate)) {
        this.report(meaningful[0]!, "E013", `Content besides <property name="${childrenTemplate}">`);
      } else {
        templates.push([childrenTemplate, this.template(content, metadata.templates![childrenTemplate]!.contextVars)]);
      }
    } else if (metadata.rawText) {
      const interpolate = node.attributes.find((a) => a.name.full === "interpolateBindings")?.value?.value !== "false";
      this.rawText(name, content, bindings, children, interpolate);
    } else if (!isUser && metadata.perChildContextVars) {
      // Step 28: each element child in a context scope of its own (ResponsiveBar's $overflow).
      const vars = metadata.perChildContextVars;
      for (const child of content) {
        if (child.kind !== "element") {
          const compiled = this.child(child, scopeVar);
          if (compiled !== undefined) children.push(compiled);
          continue;
        }
        this.contextFrames.push(new Set(vars));
        const body = this.child(child, "$$c");
        this.contextFrames.pop();
        if (body === undefined) continue;
        const container = `$$K${this.counter++}`;
        this.hoisted.push(`function ${container}({ $$p }) {\n  const $$c = $$usePerChildScope($$p, ${JSON.stringify(vars)});\n  return ${body};\n}`);
        children.push(`$$h(${container}, { $$p: ${scopeVar} })`);
      }
    } else if (!isUser) {
      for (const child of content) {
        const compiled = this.child(child, scopeVar);
        if (compiled !== undefined) children.push(compiled);
      }
    }
    // A component's root: the layout props of the component's tag, read from $props.
    if (isLayoutRoot && acceptsLayoutProps(this.metadataOf(rendered) ?? metadata)) bindings.push(["$$layoutFrom", this.layoutFromProps()]);
    // The App shell's regions: props of their own, plus the settings (step 19A).
    if (metadata.regions) this.regions(node, regionNodes, metadata.regions, scopeVar, constants);
    // onMount / onUnmount (any element): not component props.
    const lifecycle: [string, string][] = [];
    for (let i = handlers.length - 1; i >= 0; i--) {
      const kind = LIFECYCLE[handlers[i]![0]];
      if (kind) {
        lifecycle.unshift([kind, handlers[i]![1]]);
        handlers.splice(i, 1);
      }
    }

    const component = isUser ? this.userComponentRef(name, node.name) : `$$C_${rendered}`;
    const props = constants.length > 0 ? `{ ${constants.map(([k, v]) => `${jsString(k)}: ${v}`).join(", ")} }` : "null";
    const args = children.length > 0 ? `, ${children.join(", ")}` : "";
    const idValue = node.attributes.find((a) => a.name.full === "id")?.value?.value;
    const id = idValue !== undefined && this.isId(idValue) ? idValue : undefined;
    if (!isUser && bindings.length === 0 && handlers.length === 0 && id === undefined && templates.length === 0 && lifecycle.length === 0) {
      return this.withBehaviors(`$$h(${component}, ${props}${args})`, behaviors, behaviorValues, name, scopeVar);
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
    const bound = isUser ? "$$BoundUser" : "$$Bound";
    // Handlers that return their result to the component (APICall's beforeRequest, success).
    if (!isUser && metadata.eventResults && handlers.length > 0) handlersPart += ", results: true";
    return this.withBehaviors(
      `$$h(${bound}, { type: ${component}, props: ${props}, bindings: ${bindingsName}${handlersPart}${idPart}${templatesPart}${lifecyclePart}, scope: ${scopeVar} }${args})`,
      behaviors,
      behaviorValues,
      name,
      scopeVar,
    );
  }

  /**
   * Compiles App's region children (`AppHeader` …) into the props `metadata.regions`
   * names, and adds `$$shell`: their settings, decided here (see ./shell.ts).
   */
  private regions(app: ElementNode, nodes: ElementNode[], props: Record<string, string>, scopeVar: string, into: [string, string][]): void {
    const found = new Map<string, ElementNode>();
    for (const region of nodes) {
      const prop = props[region.name.full]!;
      if (found.has(prop)) {
        this.report(region.name, "E028", `<App> can have only one <${region.name.full}>`);
        continue;
      }
      found.set(prop, region);
      this.regionAllowed = true;
      into.push([prop, this.node(region, scopeVar, false)]);
    }
    this.shell = shellConfig(app, found, (span, kind, message) => {
      if (kind === "error") this.report(span, "E028", message);
      else {
        this.report(span, "E029", message);
        this.diagnostics[this.diagnostics.length - 1]!.severity = "warning";
      }
    });
    // Without regions App needs only its own `scroll` prop.
    if (found.size > 0) into.push(["$$shell", this.hoistRaw("$$q", JSON.stringify(this.shell))]);
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

  private knownThemeVariables: Set<string> | undefined;

  /** Every theme variable name of the components this compilation knows (E025). */
  private themeVariables(): Set<string> {
    return (this.knownThemeVariables ??= new Set(themeVariableNames(this.components)));
  }

  /** A behavior's attribute: a literal (type-checked) or a binding, for the behavior's wrapper. */
  private behaviorAttribute(attribute: AttributeNode, prop: PropMetadata, into: BehaviorValues): void {
    const name = attribute.name.full;
    if (!attribute.value) {
      this.checkPropLiteral(prop, name, "true", attribute.name);
      into.constants.push([name, '"true"']);
      return;
    }
    const value = this.value(this.segments(attribute as ValuedAttribute));
    if ("constant" in value) {
      this.checkPropLiteral(prop, name, JSON.parse(value.constant) as string, attribute.value);
      into.constants.push([name, value.constant]);
    } else {
      into.bindings.push([name, value.binding]);
    }
  }

  /**
   * Wraps a compiled element in its behaviors, the first innermost: each is a
   * `Bound` of the behavior's component, evaluating its props in the element's
   * scope (`variant` also gets the component's name).
   */
  private withBehaviors(
    element: string,
    behaviors: readonly BehaviorMetadata[],
    values: Map<BehaviorMetadata, BehaviorValues>,
    component: string,
    scopeVar: string,
  ): string {
    let result = element;
    for (const behavior of behaviors) {
      this.usedComponents.add(behavior.component);
      const { constants, bindings, handlers } = values.get(behavior)!;
      const props = behavior.requiresThemeVars ? [...constants, ["component", JSON.stringify(component)] as [string, string]] : constants;
      const propsCode = props.length > 0 ? `{ ${props.map(([k, v]) => `${jsString(k)}: ${v}`).join(", ")} }` : "null";
      const bindingsCode = bindings.length > 0 ? this.hoist("$$b", bindings) : this.empty();
      const handlersCode = handlers.length > 0 ? `, handlers: ${this.hoist("$$e", handlers)}${behavior.eventResults ? ", results: true" : ""}` : "";
      result = `$$h($$Bound, { type: $$C_${behavior.component}, props: ${propsCode}, bindings: ${bindingsCode}${handlersCode}, scope: ${scopeVar} }, ${result})`;
    }
    return result;
  }

  /**
   * A prop's value, by its metadata (step 20): `code` compiles a literal as an
   * expression; `deferred` adds its context variables to the scope;
   * `nullishUnresolved` makes an interpolation with a nullish part undefined.
   */
  private propValue(attribute: ValuedAttribute, prop: PropMetadata | undefined): { constant: string } | { binding: string; dependencies: string[] } {
    let segments: InterpolationSegment[];
    if (prop?.code && !attribute.value.value.includes("{")) {
      const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
      const offsets = [attribute.value.inner.start, ...decoded.offsets, attribute.value.inner.end];
      const parsed = parseInterpolation(`{${decoded.value}}`, { offsets });
      this.diagnostics.push(...parsed.diagnostics);
      segments = parsed.segments;
    } else segments = this.segments(attribute);
    if (prop?.deferred) this.contextFrames.push(new Set(prop.deferred));
    try {
      const result = compileInterpolation(segments, {
        scope: this.visibleNames(),
        markers: this.markers,
        ...this.contractOptions(),
        ...(prop?.nullishUnresolved ? { nullishUnresolved: true } : {}),
      });
      this.diagnostics.push(...result.diagnostics);
      return result.constant ? { constant: jsString(result.value!) } : { binding: result.code, dependencies: result.dependencies };
    } finally {
      if (prop?.deferred) this.contextFrames.pop();
    }
  }

  /**
   * A prop that names a variable (`variableName`, step 29: List `syncWithVar="sel"`):
   * the literal must be a variable visible here (E039). Returns the binding of its
   * value and the handler that assigns `$param` to it.
   */
  private variableNameProp(attribute: AttributeNode, propName: string, component: string): { binding: string; setter: string } | undefined {
    const text = attribute.value?.value.trim() ?? "";
    const variables = this.visibleVariables();
    if (!VARIABLE_NAME.test(text) || !variables.has(text)) {
      this.report(attribute.value?.inner ?? attribute.name, "E039", propName, component, text, didYouMean(text, variables));
      return undefined;
    }
    const value = compileInterpolation(parseInterpolation(`{${text}}`).segments, { scope: this.visibleNames(), markers: false });
    this.diagnostics.push(...value.diagnostics);
    const setter = this.handler(`${text} = $param`, { offset: attribute.value!.inner.start });
    return { binding: value.code, setter };
  }

  /** A loader's `when` (`whenIsProp`): only `when` itself, as a prop; responsive variants are not supported. */
  private whenAsProp(node: ElementNode): undefined {
    for (const attribute of node.attributes) {
      if (attribute.name.full.startsWith("when-")) this.report(attribute.name, "E002", `'${attribute.name.full}' on <${node.name.full}>`);
    }
    return undefined;
  }

  /** A CSS literal (a layout prop, a stack's gap): its form and its `$name` references (E031). */
  private checkCssLiteral(prop: PropMetadata, propName: string, text: string, span: Span): void {
    const known = this.themeVariables();
    const problem = checkLayoutValue({ cssKind: prop.cssKind!, star: prop.star }, text, (ref) => isKnownThemeVariable(ref, known));
    if (problem !== undefined) this.reportContract(span, "E031", propName, text, problem);
  }

  /** The binding `{ width: $props.width, … }`: a component's root applies what its tag was given. */
  private layoutFromProps(): string {
    const source = `{({ ${LAYOUT_PROP_NAMES.map((n) => `${n}: $props.${n}`).join(", ")} })}`;
    const parsed = parseInterpolation(source);
    const result = compileInterpolation(parsed.segments, { scope: this.visibleNames(), markers: false });
    return result.code;
  }

  /** A literal value against the prop's type and enum (E022, E023). */
  private checkPropLiteral(prop: PropMetadata, propName: string, text: string, span: Span): void {
    const failure = checkLiteral(prop, text);
    if (failure) this.reportContract(span, failure.code, propName, text, failure.problem);
    else if (prop.knownValues && !prop.knownValues.includes(text)) {
      this.report(span, "E033", propName, text, didYouMean(text, prop.knownValues));
      this.diagnostics[this.diagnostics.length - 1]!.severity = "warning";
    }
  }

  private checkEvent(metadata: ComponentMetadata, component: string, event: string, span: Span): boolean {
    if (`on${event[0]!.toUpperCase()}${event.slice(1)}` in LIFECYCLE) return true;
    if (metadata.events && Object.hasOwn(metadata.events, event)) {
      const deprecation = metadata.events[event]!.deprecationMessage;
      if (deprecation !== undefined) this.reportDeprecated(span, `The event '${event}' of '${component}'`, deprecation);
      return true;
    }
    if (metadata.allowArbitraryEvents) return true;
    this.reportContract(span, "E004", event, component, didYouMean(event, Object.keys(metadata.events ?? {})));
    return false;
  }

  /** Compiles handler source (statements); returns the handler factory code. */
  private handler(source: string, position: { offsets?: number[]; offset?: number }, event?: EventMetadata): string {
    const parsed = parseStatements(source, position);
    this.diagnostics.push(...parsed.diagnostics);
    // An event without arguments for statements (step 27): no `$param`, so an enclosing one stays visible.
    const params = event?.args === undefined;
    const result = compileHandler(parsed.program, { scope: this.visibleNames(), variables: this.visibleVariables(), markers: this.markers, params, ...this.contractOptions() });
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
    const handler = this.tagHandler(tag, metadata.events?.[event]);
    return handler === undefined ? undefined : [`on${event[0]!.toUpperCase()}${event.slice(1)}`, handler];
  }

  /** `<method name="open">statements</method>` in a `<Component>`; returns `[name, factory]`. */
  private methodTag(tag: ElementNode): [string, string] | undefined {
    const nameAttribute = tag.attributes.find((a) => a.name.full === "name");
    const name = nameAttribute?.value?.value;
    if (name === undefined || !VARIABLE_NAME.test(name)) {
      this.report(nameAttribute?.value ?? tag.name, "E016", "<method> needs a constant 'name' (a valid identifier)");
      return undefined;
    }
    const handler = this.tagHandler(tag);
    return handler === undefined ? undefined : [name, handler];
  }

  /** The handler in a code tag's content (`<event>`, `<method>`): text or CDATA, not whitespace-collapsed. */
  private tagHandler(tag: ElementNode, event?: EventMetadata): string | undefined {
    const content = tag.children.filter((c) => c.kind !== "comment" && !(c.kind === "text" && c.value.trim() === ""));
    if (content.length > 1 || content.some((c) => c.kind === "element" || c.kind === "script")) {
      this.report(tag.name, "E002", `Components inside <${tag.name.full}>`);
      return undefined;
    }
    const text = content[0];
    if (!text) return this.handler("", { offset: tag.end }, event);
    if (text.kind === "cdata") return this.handler(text.value, { offset: text.start + "<![CDATA[".length }, event);
    if (text.kind !== "text") return undefined;
    // Handler code is not whitespace-collapsed (XMLUI exempts <event>).
    const decoded = decodeEntitiesWithOffsets(text.raw, text.start);
    return this.handler(decoded.value, { offsets: decoded.offsets }, event);
  }

  /**
   * `<Slot name="rowTemplate" item="{$item}">fallback</Slot>` in a component
   * body: renders the caller's content for the slot, which receives each other
   * attribute as a context variable (`$item`); else the fallback, in this scope.
   */
  private slot(node: ElementNode, scopeVar: string): string {
    let name = DEFAULT_SLOT;
    const entries: [string, string][] = [];
    for (const attribute of node.attributes) {
      const full = attribute.name.full;
      if (full === "name") {
        const value = attribute.value?.value;
        if (value === undefined || value.includes("{") || !/^[a-z][A-Za-z0-9]*Template$/.test(value)) {
          this.report(attribute.value ?? attribute.name, "E017", "A named slot needs a constant name ending in 'Template' (rowTemplate)");
          continue;
        }
        name = value;
        continue;
      }
      if (!VARIABLE_NAME.test(full)) {
        this.report(attribute.name, "E017", `'${full}' is not a valid slot property name`);
        continue;
      }
      if (!attribute.value) {
        entries.push([`$${full}`, '() => "true"']);
        continue;
      }
      const value = this.value(this.segments(attribute as ValuedAttribute));
      entries.push([`$${full}`, "constant" in value ? `() => ${value.constant}` : value.binding]);
    }
    const children: string[] = [];
    for (const child of node.children) {
      const compiled = this.child(child, scopeVar);
      if (compiled !== undefined) children.push(compiled);
    }
    const bindings = entries.length > 0 ? this.hoist("$$b", entries) : this.empty();
    const args = children.length > 0 ? `, ${children.join(", ")}` : "";
    return this.mark(node.start, `$$h($$Slot, { name: ${JSON.stringify(name)}, bindings: ${bindings}, scope: ${scopeVar} }${args})`);
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

  /**
   * The content of a `rawText` component (Markdown), as written: text (entities
   * decoded) and CDATA joined, `@{…}` compiled. Without bindings it is one string
   * child; with them, `$$parts` is a binding to an array of strings and values.
   */
  private rawText(component: string, content: ContentNode[], bindings: [string, string][], children: string[], interpolate: boolean): void {
    let text = "";
    const offsets: number[] = [];
    for (const child of content) {
      if (child.kind === "element") {
        this.report(child.name, "E034", component, child.name.full);
        continue;
      }
      if (child.kind === "text") {
        const decoded = decodeEntitiesWithOffsets(child.raw, child.start);
        text += decoded.value;
        offsets.push(...decoded.offsets.slice(0, decoded.value.length));
      } else if (child.kind === "cdata") {
        const start = child.start + "<![CDATA[".length;
        text += child.value;
        for (let i = 0; i < child.value.length; i++) offsets.push(start + i);
      }
    }
    if (text.trim() === "") return;
    if (!interpolate) {
      children.push(jsString(text));
      return;
    }
    offsets.push(offsets.length > 0 ? offsets[offsets.length - 1]! + 1 : 0);
    const parsed = parseMarkdownBindings(text, { offsets });
    this.diagnostics.push(...parsed.diagnostics);
    if (parsed.parts.every((part) => part.kind === "literal")) {
      children.push(jsString(parsed.parts.map((part) => (part as { value: string }).value).join("")));
      return;
    }
    const first = parsed.parts[0]!;
    const last = parsed.parts[parsed.parts.length - 1]!;
    const elements: Expression[] = parsed.parts.map((part) =>
      part.kind === "literal"
        ? ({ type: "Literal", value: part.value, raw: JSON.stringify(part.value), start: part.start, end: part.end } satisfies Literal)
        : (part.expression ?? ({ type: "Identifier", name: "undefined", start: part.start, end: part.end } as Expression)),
    );
    const array: ArrayExpression = { type: "ArrayExpression", elements, start: first.start, end: last.end };
    const value = this.value([{ kind: "expression", expression: array, start: first.start, end: last.end }]);
    bindings.push(["$$parts", "constant" in value ? `() => ${value.constant}` : value.binding]);
  }

  /**
   * Step 25: the children of a Select or AutoComplete as array elements: an
   * `Option` is an object (its attributes, any name, as fields), an `Items` spreads
   * its template's options for each item (in an item scope, `$$optionItems`).
   * `sv` is the scope variable of the enclosing function.
   */
  private optionParts(content: ContentNode[], sv: string, component: string): string[] {
    const parts: string[] = [];
    for (const child of content) {
      if (child.kind === "comment") continue;
      if (child.kind === "text" && child.value.trim() === "") continue;
      if (child.kind !== "element") {
        this.report(child.kind === "script" ? { start: child.start, end: child.contentSpan.start } : child, "E035", component, "text");
        continue;
      }
      const name = child.name.full;
      if (name === "Option") {
        const entry = this.optionEntry(child, sv, component);
        parts.push(this.optionWhen(child, sv, component, `[${entry}]`, entry));
      } else if (name === "Items") parts.push(this.optionWhen(child, sv, component, this.optionItems(child, sv, component)));
      else this.report(child.name, "E035", component, `<${name}>`);
    }
    return parts.filter((part) => part !== "");
  }

  /** An option or Items with `when`: kept only while it holds (a spread of the array, or of nothing). `single`: the element itself, without `when`. */
  private optionWhen(node: ElementNode, sv: string, component: string, array: string, single?: string): string {
    let test: string | undefined;
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name.startsWith("when-")) this.report(attribute.name, "E002", `'${name}' on <${node.name.full}> inside <${component}>`);
      if (name !== "when" || !attribute.value) continue;
      const value = this.value(this.segments(attribute as ValuedAttribute));
      if ("constant" in value) {
        const text = (JSON.parse(value.constant) as string).trim();
        if (text === "false" || text === "") return "";
      } else test = `(${value.binding})(${sv})`;
    }
    if (test === undefined) return single ?? `...${array}`;
    return `...(${test} ? ${array} : [])`;
  }

  /** `<Option>` inside a Select: `{ value, label, …any attribute }`; text is the label, elements its content. */
  private optionEntry(node: ElementNode, sv: string, component: string): string {
    const metadata = this.metadataOf("Option")!;
    const fields: [string, string][] = [];
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name === "when" || name.startsWith("when-")) continue;
      if (name === "id" || name.startsWith("var.") || name.startsWith("global.") || /^on[A-Z]/.test(name) || attribute.name.prefix !== undefined) {
        this.report(attribute.name, "E002", `'${name}' on <Option> inside <${component}>`);
        continue;
      }
      const prop = Object.hasOwn(metadata.props, name) ? metadata.props[name] : undefined;
      if (!attribute.value) {
        fields.push([name, '"true"']);
        continue;
      }
      const value = this.propValue(attribute as ValuedAttribute, prop);
      if ("constant" in value) {
        if (prop) this.checkPropLiteral(prop, name, JSON.parse(value.constant) as string, attribute.value);
        fields.push([name, value.constant]);
      } else fields.push([name, `(${value.binding})(${sv})`]);
    }
    const content = node.children.filter((c) => c.kind !== "comment" && !(c.kind === "text" && c.value.trim() === ""));
    if (content.length > 0 && content.every((c) => c.kind === "text" || c.kind === "cdata")) {
      // A text child is the label (XMLUI Option.tsx 63–66), unless `label` is set.
      if (!fields.some(([name]) => name === "label")) fields.push(["label", this.optionText(content, sv)]);
    } else if (content.length > 0) {
      fields.push(["$$content", `$$h($$OptionContent, { render: ${this.template(node.children, [])}, scope: ${sv} })`]);
    }
    return `{ ${fields.map(([key, code]) => `${jsString(key)}: ${code}`).join(", ")} }`;
  }

  /** An Option's text as its label: interpolated, whitespace collapsed and trimmed. */
  private optionText(content: ContentNode[], sv: string): string {
    const pieces: string[] = [];
    for (const child of content) {
      if (child.kind === "cdata") {
        pieces.push(jsString(child.value));
        continue;
      }
      if (child.kind !== "text") continue;
      const decoded = decodeEntitiesWithOffsets(child.raw, child.start);
      const parsed = parseInterpolation(decoded.value, { offsets: decoded.offsets });
      this.diagnostics.push(...parsed.diagnostics);
      const value = this.value(parsed.segments.map((s) => (s.kind === "literal" ? { ...s, value: s.value.replace(WHITESPACE_RUN, " ") } : s)));
      pieces.push("constant" in value ? value.constant : `(${value.binding})(${sv})`);
    }
    return `String(${pieces.join(" + ")}).trim()`;
  }

  /**
   * Step 28: the headers of a Tabs/Stepper (`childrenAsHeaders`): each `item`
   * element is `{ $$key, …its props, id }`, an `Items` spreads its items' headers
   * (in an item scope, `$$optionItems`). The keys are the child's position (and
   * `$itemIndex` inside an Items); the items record them for their in-place compile.
   * Binding diagnostics are left to that compile (they would be reported twice).
   */
  private headerParts(content: ContentNode[], sv: string, component: string, item: string): string[] {
    const before = this.diagnostics.length;
    const parts: string[] = [];
    let position = 0;
    for (const child of content) {
      if (child.kind === "comment" || (child.kind === "text" && child.value.trim() === "")) continue;
      if (child.kind !== "element") {
        this.report(child.kind === "script" ? { start: child.start, end: child.contentSpan.start } : child, "E038", component, item, "text");
        continue;
      }
      const name = child.name.full;
      const key = String(position++);
      if (name === item) {
        this.headerKeys.set(child, { key, inItems: false });
        const entry = this.headerEntry(child, sv, item, jsString(key));
        parts.push(this.optionWhen(child, sv, component, `[${entry}]`, entry));
      } else if (name === "Items") {
        parts.push(this.optionWhen(child, sv, component, this.headerItems(child, sv, component, item, key)));
      } else this.report(child.name, "E038", component, item, `<${name}>`);
    }
    // Keep the structural problems (E002, E038); the item's own compile reports the rest.
    const added = this.diagnostics.splice(before);
    this.diagnostics.push(...added.filter((d) => d.code === "E002" || d.code === "E038"));
    return parts.filter((part) => part !== "");
  }

  /** `<Items data>` of TabItems/Steps: their headers for each item, keyed `position:$itemIndex`. */
  private headerItems(node: ElementNode, sv: string, component: string, item: string, key: string): string {
    let data = "undefined";
    for (const attribute of node.attributes) {
      if (attribute.name.full !== "data" || !attribute.value) continue;
      const value = this.value(this.segments(attribute as ValuedAttribute));
      data = "constant" in value ? value.constant : `(${value.binding})(${sv})`;
    }
    const inner = `$$s${this.counter++}`;
    this.contextFrames.push(new Set(this.metadataOf("Items")!.templates!.itemTemplate!.contextVars));
    const parts: string[] = [];
    for (const child of node.children) {
      if (child.kind === "comment" || (child.kind === "text" && child.value.trim() === "")) continue;
      if (child.kind === "element" && child.name.full === "property") continue;
      if (child.kind !== "element" || child.name.full !== item) {
        this.report(child.kind === "element" ? child.name : child, "E038", component, item, child.kind === "element" ? `<${child.name.full}>` : "text");
        continue;
      }
      this.headerKeys.set(child, { key, inItems: true });
      const entry = this.headerEntry(child, inner, item, `(${this.itemKey(key)})(${inner})`);
      parts.push(this.optionWhen(child, inner, component, `[${entry}]`, entry));
    }
    this.contextFrames.pop();
    return `$$optionItems(${sv}, ${data}, (${inner}) => [${parts.filter((p) => p !== "").join(", ")}])`;
  }

  /** The binding of an item's key inside an Items: `"position:" + $itemIndex`. */
  private itemKey(key: string): string {
    const parsed = parseInterpolation(`{${JSON.stringify(`${key}:`)} + $itemIndex}`);
    const value = this.value(parsed.segments);
    return "constant" in value ? `() => ${value.constant}` : value.binding;
  }

  /** One header: `$$key`, the item's props and `id`; its headerTemplate with the scope to render it in. */
  private headerEntry(node: ElementNode, sv: string, item: string, key: string): string {
    const metadata = this.metadataOf(item)!;
    const fields: [string, string][] = [["$$key", key]];
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name !== "id" && !Object.hasOwn(metadata.props, name)) continue;
      if (!attribute.value) {
        fields.push([name, '"true"']);
        continue;
      }
      const value = this.propValue(attribute as ValuedAttribute, metadata.props[name]);
      fields.push([name, "constant" in value ? value.constant : `(${value.binding})(${sv})`]);
    }
    const template = node.children.find((c): c is ElementNode => c.kind === "element" && c.name.full === "property" && c.attributes.some((a) => a.name.full === "name" && a.value?.value === "headerTemplate"));
    if (template && metadata.templates?.headerTemplate) {
      fields.push(["$$headerTemplate", this.template(template.children, metadata.templates.headerTemplate.contextVars)], ["$$scope", sv]);
    }
    return `{ ${fields.map(([k, code]) => `${jsString(k)}: ${code}`).join(", ")} }`;
  }

  /**
   * Step 30: the children of a Table (`childrenAsColumns`): each Column is
   * `{ $$key, …its props, $$cell, $$scope, $$handlers }` (its children are the
   * cell template; `onWillChange`/`onDidChange` are handler factories the Table
   * wires), an `Items` spreads its Columns for each item. Other children: E040.
   */
  private columnParts(content: ContentNode[], sv: string, component: string, item: string, keyPrefix?: { key: string; inner: string }): string[] {
    const parts: string[] = [];
    let position = 0;
    for (const child of content) {
      if (child.kind === "comment" || (child.kind === "text" && child.value.trim() === "")) continue;
      if (child.kind !== "element") {
        this.report(child.kind === "script" ? { start: child.start, end: child.contentSpan.start } : child, "E040", component, item, "text");
        continue;
      }
      const name = child.name.full;
      const key = keyPrefix ? keyPrefix.key : String(position++);
      if (name === item) {
        const keyCode = keyPrefix ? `(${this.itemKey(key)})(${keyPrefix.inner})` : jsString(key);
        const entry = this.columnEntry(child, sv, component, item, keyCode);
        parts.push(this.optionWhen(child, sv, component, `[${entry}]`, entry));
      } else if (name === "Items" && !keyPrefix) {
        parts.push(this.optionWhen(child, sv, component, this.columnItems(child, sv, component, item, key)));
      } else this.report(child.name, "E040", component, item, `<${name}>`);
    }
    return parts.filter((part) => part !== "");
  }

  /** `<Items data>` of Columns: their entries for each item, keyed `position:$itemIndex`. */
  private columnItems(node: ElementNode, sv: string, component: string, item: string, key: string): string {
    let data = "undefined";
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name === "when" || name.startsWith("when-")) continue;
      if (name !== "data") {
        this.report(attribute.name, "E002", `'${name}' on <Items> inside <${component}>`);
        continue;
      }
      if (!attribute.value) continue;
      const value = this.value(this.segments(attribute as ValuedAttribute));
      data = "constant" in value ? value.constant : `(${value.binding})(${sv})`;
    }
    const inner = `$$s${this.counter++}`;
    this.contextFrames.push(new Set(this.metadataOf("Items")!.templates!.itemTemplate!.contextVars));
    const content = node.children.filter((c) => !(c.kind === "element" && c.name.full === "property"));
    const parts = this.columnParts(content, inner, component, item, { key, inner });
    this.contextFrames.pop();
    return `$$optionItems(${sv}, ${data}, (${inner}) => [${parts.join(", ")}])`;
  }

  /** One Column: `$$key`, its props, its children as the cell template (`$$cell` with `$$scope`), its handlers. */
  private columnEntry(node: ElementNode, sv: string, component: string, item: string, key: string): string {
    const metadata = this.metadataOf(item)!;
    const fields: [string, string][] = [["$$key", key]];
    const handlers: [string, string][] = [];
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name === "when" || name.startsWith("when-")) continue;
      if (/^on[A-Z]/.test(name) && attribute.name.prefix === undefined) {
        const event = `${name[2]!.toLowerCase()}${name.slice(3)}`;
        if (!this.checkEvent(metadata, item, event, attribute.name) || !attribute.value) continue;
        const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
        handlers.push([name, this.handler(decoded.value, { offsets: decoded.offsets }, metadata.events?.[event])]);
        continue;
      }
      if (name === "id" || name.startsWith("var.") || name.startsWith("global.") || attribute.name.prefix !== undefined) {
        this.report(attribute.name, "E002", `'${name}' on <${item}> inside <${component}>`);
        continue;
      }
      if (!Object.hasOwn(metadata.props, name)) {
        this.reportContract(attribute.name, "E020", name, item, didYouMean(name, Object.keys(metadata.props)));
        continue;
      }
      const prop = metadata.props[name]!;
      if (!attribute.value) {
        fields.push([name, '"true"']);
        continue;
      }
      const value = this.propValue(attribute as ValuedAttribute, prop);
      if ("constant" in value) {
        this.checkPropLiteral(prop, name, JSON.parse(value.constant) as string, attribute.value);
        fields.push([name, value.constant]);
      } else fields.push([name, `(${value.binding})(${sv})`]);
    }
    const content: ContentNode[] = [];
    for (const child of node.children) {
      if (child.kind === "element" && child.name.full === "event") {
        const handler = this.eventTag(child, metadata, item);
        if (handler) handlers.push(handler);
      } else if (!(child.kind === "element" && child.name.full === "property")) content.push(child);
    }
    const meaningful = content.filter((c) => c.kind !== "comment" && !(c.kind === "text" && c.value.trim() === ""));
    if (meaningful.length > 0) fields.push(["$$cell", this.template(content, metadata.templates!.cellTemplate!.contextVars)]);
    if (meaningful.length > 0 || handlers.length > 0) fields.push(["$$scope", sv]);
    if (handlers.length > 0) fields.push(["$$handlers", `{ ${handlers.map(([k, code]) => `${jsString(k)}: ${code}`).join(", ")} }`]);
    return `{ ${fields.map(([k, code]) => `${jsString(k)}: ${code}`).join(", ")} }`;
  }

  /** `<Items data>` inside a Select: its Options for each item, in an item scope. */
  private optionItems(node: ElementNode, sv: string, component: string): string {
    let data = "undefined";
    for (const attribute of node.attributes) {
      const name = attribute.name.full;
      if (name === "when" || name.startsWith("when-")) continue;
      if (name !== "data") {
        this.report(attribute.name, "E002", `'${name}' on <Items> inside <${component}>`);
        continue;
      }
      if (!attribute.value) continue;
      const value = this.value(this.segments(attribute as ValuedAttribute));
      data = "constant" in value ? value.constant : `(${value.binding})(${sv})`;
    }
    const inner = `$$s${this.counter++}`;
    this.contextFrames.push(new Set(this.metadataOf("Items")!.templates!.itemTemplate!.contextVars));
    const content = node.children.filter((c) => !(c.kind === "element" && c.name.full === "property"));
    const parts = this.optionParts(content, inner, component);
    this.contextFrames.pop();
    return `$$optionItems(${sv}, ${data}, (${inner}) => [${parts.join(", ")}])`;
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
