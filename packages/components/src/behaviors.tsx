// The behaviors' components (step 18). The compiler wraps an element in them
// (attachedBehaviors in ./metadata), innermost first: label, tooltip, variant.
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { componentMetadata } from "./metadata";
import { resolveRefs, THEME_VAR_PREFIX } from "./theming/engine";

/** `label`: a <label> around the component, so an input inside gets it as its accessible name. */
export function LabelBehavior({ label, labelPosition, children }: { label?: unknown; labelPosition?: unknown; children?: ReactNode }) {
  return (
    <label className="gfui-Label" data-position={labelPosition === "start" ? "start" : "top"}>
      <span className="gfui-Label-text">{label === undefined || label === null ? "" : String(label)}</span>
      {children}
    </label>
  );
}

/** `tooltip`: shown while the pointer is over the component or the focus is inside it. */
export function TooltipBehavior({ tooltip, children }: { tooltip?: unknown; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = tooltip === undefined || tooltip === null ? "" : String(tooltip);
  return (
    <span
      className="gfui-TooltipAnchor"
      aria-describedby={open && text ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && text ? (
        <span role="tooltip" id={id} className="gfui-Tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The variable a variant reads for a component variable:
 * `backgroundColor-Button` → `backgroundColor-Button-danger`,
 * `backgroundColor-Button--hover` → `backgroundColor-Button-danger--hover`.
 */
export function variantVariable(name: string, variant: string): string {
  const [main, ...states] = name.split("--");
  return [`${main}-${variant}`, ...states].join("--");
}

/**
 * `variant`: each of the component's theme variables takes its variant value
 * where one is defined, else the component's default (a CSS variable cannot
 * fall back to its own inherited value). No element of its own.
 */
export function VariantBehavior({ variant, component, children }: { variant?: unknown; component?: unknown; children?: ReactNode }) {
  const style: Record<string, string> = { display: "contents" };
  const themeVars = typeof component === "string" ? componentMetadata[component]?.themeVars : undefined;
  if (typeof variant === "string" && variant !== "" && themeVars) {
    for (const [name, fallback] of Object.entries(themeVars)) {
      style[`${THEME_VAR_PREFIX}${name}`] = `var(${THEME_VAR_PREFIX}${variantVariable(name, variant)}, ${resolveRefs(fallback)})`;
    }
  }
  return (
    <div className="gfui-Variant" data-variant={typeof variant === "string" ? variant : undefined} style={style as CSSProperties}>
      {children}
    </div>
  );
}
