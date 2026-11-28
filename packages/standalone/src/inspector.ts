// Step 35: the Inspector in standalone mode. The page that loads gfui.js, opened
// with `?gfui-inspector`, shows the Inspector instead of the app: its markup is
// bundled and compiled here, like any app's, with its TraceFeed component.
import { compileModule } from "@gluefuil/compiler";
import * as builtIns from "@gluefuil/components";
import { componentMetadata } from "@gluefuil/components/metadata";
import { TraceFeed } from "@gluefuil/inspector";
import { inspectorComponents } from "@gluefuil/inspector/metadata";
import inspectorMarkup from "@gluefuil/inspector/Inspector.gui?raw";
import { loadModule, mountApp } from "@gluefuil/runtime";
import { createElement, type ComponentType } from "react";

/** The URL parameter that shows the Inspector. */
export const INSPECTOR_PARAM = "gfui-inspector";

/** Whether this page was opened as the Inspector. */
export function isInspectorPage(search = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).has(INSPECTOR_PARAM);
}

/** This page as the Inspector (the same page, with ?gfui-inspector). */
export function inspectorUrl(href: string): string {
  const url = new URL(href);
  url.search = `?${INSPECTOR_PARAM}`;
  url.hash = "";
  return url.href;
}

/** Compiles and mounts the Inspector into `container`. It never traces itself. */
export function startInspector(container: Element): void {
  const { code, diagnostics } = compileModule(inspectorMarkup, {
    format: "function",
    fileName: "Inspector.gui",
    sourceMap: false,
    components: { ...componentMetadata, ...inspectorComponents },
  });
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new Error(`The Inspector's markup has errors: ${errors.map((e) => e.message).join("; ")}`);
  const Inspector = loadModule(code, { components: { ...builtIns, TraceFeed } }) as ComponentType;
  mountApp(container, createElement(Inspector), { trace: false });
}
