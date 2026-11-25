// Templates: markup a component renders with context variables, such as an
// item template with `$item`. Design: .ai/plan/poc-10-conditionals-templates.md
//
// Compiled code hands a template to Bound as `($$c) => ReactNode` (its body
// renders in the scope `$$c`). Bound gives the component a function
// `(context, key?) => ReactNode`; each call renders a TemplateInstance, which
// creates its scope ONCE (a child of the element's scope, one signal per
// context variable) and updates the signals when the context changes. Scope
// objects stay stable, so state inside the template (variables, handlers)
// survives data changes.

import { createElement, useLayoutEffect, useState, type Key, type ReactNode } from "react";
import { createScope, type ScopeEntry } from "../reactivity/scope";
import { batch, signal, type Signal } from "../reactivity/signals";

/** A compiled template: renders its content in the given scope. */
export type TemplateFunction = (scope: object) => ReactNode;

/** What a component receives for a template prop. */
export type TemplateRenderer = (context: Record<string, unknown>, key?: Key) => ReactNode;

interface TemplateInstanceProps {
  parent: object;
  render: TemplateFunction;
  context: Record<string, unknown>;
}

/** One rendered instance of a template. */
export function TemplateInstance({ parent, render, context }: TemplateInstanceProps) {
  const [state] = useState(() => {
    const signals: Record<string, Signal<unknown>> = {};
    const entries: Record<string, ScopeEntry> = {};
    for (const [name, value] of Object.entries(context)) {
      signals[name] = signal(value);
      entries[name] = { signal: signals[name]! };
    }
    return { signals, scope: createScope(entries, parent) };
  });
  // New context values: update the signals after render, before paint. (Writing
  // signals during render would update other components while this one renders.)
  useLayoutEffect(() => {
    batch(() => {
      for (const [name, value] of Object.entries(context)) state.signals[name]?.set(value);
    });
  });
  return render(state.scope);
}

/** The prop value a component receives for a template. */
export function templateRenderer(parent: object, render: TemplateFunction): TemplateRenderer {
  return (context, key) => createElement(TemplateInstance, { key, parent, render, context });
}

/**
 * Step 25: `<Items>` inside a Select (the children compiled to an options array):
 * the template's options for each item, each in a scope with `$item`,
 * `$itemIndex`, `$isFirst`, `$isLast`. No hook: it runs inside a binding.
 * Arrays are the items; an object's values too (as XMLUI's Select `data`); else none.
 */
export function optionItems(parent: object, data: unknown, build: (scope: object) => unknown[]): unknown[] {
  const list: unknown[] = Array.isArray(data) ? data : data !== null && typeof data === "object" ? Object.values(data) : [];
  return list.flatMap((item, index) =>
    build(
      createScope(
        { $item: { value: item }, $itemIndex: { value: index }, $isFirst: { value: index === 0 }, $isLast: { value: index === list.length - 1 } },
        parent,
      ),
    ),
  );
}

/** An Option's own content (element children), rendered in the option's scope. */
export function OptionContent({ render, scope }: { render: TemplateFunction; scope: object }): ReactNode {
  return render(scope);
}
