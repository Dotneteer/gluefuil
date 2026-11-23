// The App shell (steps 19A–19C): what the compiler knows about App's regions.
// App's direct AppHeader, NavPanel and Footer children are passed to App as
// props (`$$header`, `$$nav`, `$$footer`), and their literal settings as one
// constant, `$$shell`, so the runtime never inspects children or measures.
// Design: .ai/plan/poc-19a-app-shell.md

import type { AttributeNode, ElementNode, Span } from "../markup/ast";

/** What App receives as `$$shell`: the shell's settings, defaults applied. */
export interface ShellConfig {
  scroll: string;
  header?: { sticky: boolean };
  nav?: { placement: string; fullHeight: boolean; sticky: boolean; drawerBelow: string; collapsible: boolean };
  footer?: { sticky: boolean };
}

export type ShellReport = (span: Span, kind: "error" | "noEffect", message: string) => void;

function attribute(node: ElementNode, name: string): AttributeNode | undefined {
  return node.attributes.find((a) => a.name.full === name);
}

/** A literal attribute's text ("true" when key-only); undefined when absent or bound (E026 reports that). */
function literal(node: ElementNode, name: string): string | undefined {
  const found = attribute(node, name);
  if (!found) return undefined;
  if (!found.value) return "true";
  return found.value.value.includes("{") ? undefined : found.value.value.trim();
}

/**
 * The shell's settings from the App element and its regions (by prop name),
 * reporting combinations that cannot work.
 */
export function shellConfig(app: ElementNode, regions: ReadonlyMap<string, ElementNode>, report: ShellReport): ShellConfig {
  const config: ShellConfig = { scroll: literal(app, "scroll") ?? "page" };
  const header = regions.get("$$header");
  const nav = regions.get("$$nav");
  const footer = regions.get("$$footer");
  if (header) config.header = { sticky: literal(header, "sticky") !== "false" };
  if (footer) config.footer = { sticky: literal(footer, "sticky") !== "false" };
  if (nav) {
    const placement = literal(nav, "placement") ?? "header";
    config.nav = {
      placement,
      fullHeight: literal(nav, "fullHeight") === "true",
      sticky: literal(nav, "sticky") !== "false",
      drawerBelow: literal(nav, "drawerBelow") ?? "lg",
      collapsible: literal(nav, "collapsible") === "true",
    };
    for (const name of ["fullHeight", "collapsible"]) {
      const found = attribute(nav, name);
      if (found && placement !== "side" && literal(nav, name) === "true") {
        report(found.name, "error", `'${name}' needs a side nav: <NavPanel placement="side" ${name}="true">`);
      }
    }
  }
  // `sticky` matters only when the page scrolls.
  if (config.scroll !== "page") {
    for (const region of [header, nav, footer]) {
      const sticky = region && attribute(region, "sticky");
      if (sticky) report(sticky.name, "noEffect", `'sticky' has no effect: App scroll="${config.scroll}" keeps the regions in view (or never sticks, with "none")`);
    }
  }
  return config;
}
