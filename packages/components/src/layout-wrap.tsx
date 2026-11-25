// withLayout: the layout props of a wrapped (Mantine) component (step 16).
import { createElement, type ComponentType } from "react";
import { useLayout, withoutLayoutProps, type LayoutProps } from "./layout";

/**
 * The layout props (width, padding, …) for a wrapped component: applied to the
 * Mantine component's root as `style`; the rest of the props go through the
 * wrapper unchanged.
 */
export function withLayout(Wrapped: ComponentType<Record<string, unknown>>): ComponentType<LayoutProps> {
  function Layout(props: LayoutProps) {
    // Only the style: Mantine puts it on the root, but other attributes on the input (TextInput).
    const { style } = useLayout(props);
    return createElement(Wrapped, { ...withoutLayoutProps(props), ...(style ? { style } : {}) });
  }
  Layout.displayName = Wrapped.displayName;
  return Layout;
}

