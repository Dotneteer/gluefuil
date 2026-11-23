// A small built-in icon set for navigation (NavLink, NavGroup icon="home"),
// until an icon library is chosen. Simple 24×24 outline drawings of our own,
// stroked with the current text color.

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

const ICONS: Readonly<Record<string, string>> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  list: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01",
  settings: `${circle(12, 12, 4)}M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1`,
  user: `${circle(12, 8, 4)}M4 21c0-4 4-6 8-6s8 2 8 6`,
  info: `${circle(12, 12, 9)}M12 11v6M12 7.5v.01`,
  star: "M12 3l2.8 6 6.2.5-4.8 4.2 1.5 6.3-5.7-3.4-5.7 3.4 1.5-6.3L3 9.5 9.2 9z",
  folder: "M3 6h6l2 2h10v11H3z",
  chart: "M4 20V10M10 20V4M16 20v-7M2 20h20",
  mail: `${rect(3, 5, 18, 14)}M3 6l9 7 9-7`,
  search: `${circle(11, 11, 7)}M16 16l5 5`,
  layout: `${rect(3, 3, 18, 18)}M3 9h18M9 9v12`,
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronDown: "M6 9l6 6 6-6",
};

/** The built-in icon names. */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

/** An icon by name; nothing for an unknown name. */
export function Icon({ name, className }: { name?: unknown; className?: string }) {
  const d = typeof name === "string" ? ICONS[name] : undefined;
  if (!d) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
