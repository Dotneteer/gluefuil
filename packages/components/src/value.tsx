import { useLocaleProfile } from "@gluefuil/runtime";
// Value (step 30, decision 4): a read-only typed value, and the rendering the
// Table's typed cells share. XMLUI: xmlui/src/components/Value/ValueReact.tsx.
// The types and formatting are React-free in value-types.ts.
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Glyph } from "./icons";
import { useLayout, type LayoutProps } from "./layout";
import { clampLines, formatValue, inlineMarkdown, normalizeValueType, type NormalizedValueType } from "./value-types";

/** A value rendered for its type (the read-only rendering; the Table makes checkbox, switch and color interactive). */
export function renderValue(value: unknown, type: NormalizedValueType, extra?: { className?: string; style?: CSSProperties; attributes?: Record<string, string>; locale?: string }): ReactNode {
  const model = formatValue(value, type, extra?.locale === undefined ? {} : { locale: extra.locale });
  const className = extra?.className ? `gfui-Value ${extra.className}` : "gfui-Value";
  const common = { "data-value-kind": model.kind, ...extra?.attributes, style: extra?.style };
  const lines = clampLines(type);
  const clamp: CSSProperties | undefined = lines ? ({ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" } as CSSProperties) : undefined;
  const title = clamp && type.options?.tooltip !== false ? model.text : undefined;
  switch (model.kind) {
    case "empty":
      return null;
    case "link":
      return (
        <a {...common} className={className} href={model.href} title={model.href}>
          {model.text}
        </a>
      );
    case "number":
      return (
        <span {...common} className={className}>
          <span data-number-part="integer">{model.integerPart}</span>
          {model.decimalSeparator ? <span data-number-part="decimal">{model.decimalSeparator}</span> : null}
          {model.fractionPart ? <span data-number-part="fraction">{model.fractionPart}</span> : null}
          {model.suffixPart ? <span data-number-part="suffix">{model.suffixPart}</span> : null}
        </span>
      );
    case "checkbox":
      return (
        <span {...common} className={className} role="checkbox" aria-checked={model.text !== ""} aria-readonly="true">
          {model.text}
        </span>
      );
    case "markdown":
      return (
        <span {...common} className={className} style={{ ...extra?.style, ...clamp }} title={title}>
          {inlineMarkdown(model.text).map((part, i) => (part.style === "strong" ? <strong key={i}>{part.text}</strong> : part.style === "em" ? <em key={i}>{part.text}</em> : part.text))}
        </span>
      );
    case "color":
      return (
        <span {...common} className={className}>
          <span className="gfui-Value-swatch" style={{ backgroundColor: model.color }} aria-hidden="true" />
          <span>{model.text}</span>
        </span>
      );
    case "image":
    case "avatar":
      return <img {...common} className={className} src={model.src} alt={model.alt} />;
    case "icon":
      return (
        <span {...common} className={className}>
          <Glyph name={model.iconName} className="gfui-Value-icon" />
          <span className="gfui-Value-iconLabel">{model.text}</span>
        </span>
      );
    default: {
      const long = model.kind === "long-text" || model.kind === "address";
      return (
        <span {...common} className={className} style={long ? { ...extra?.style, ...clamp } : extra?.style} title={long ? title : undefined}>
          {model.text}
        </span>
      );
    }
  }
}

export type ValueProps = LayoutProps & { value?: unknown; type?: unknown; typeOptions?: unknown };

/** A read-only value with type-aware formatting (XMLUI Value). */
export function Value(props: ValueProps) {
  const layout = useLayout(props);
  const { locale } = useLocaleProfile();
  const type = useMemo(() => normalizeValueType(props.type ?? "text", props.typeOptions).type, [props.type, props.typeOptions]);
  return renderValue(props.value, type, { style: layout.style, attributes: layout.attributes, locale });
}
