// Icons (step 23; design: .ai/plan/poc-23-display.md). A registry of names to
// Lucide drawings: XMLUI's 132 icon names (xmlui/src/components/icons-abstractions.ts),
// plus the names the App shell used before (step 19B). Only the registered
// icons are bundled; an app adds its own with registerIcon.
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpNarrowWide,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Box,
  Braces,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CirclePlus,
  CircleX,
  Code,
  Contact,
  Copy,
  CopyPlus,
  Columns2,
  Database,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileCog,
  FileQuestionMark,
  FileText,
  Folder,
  FolderOpen,
  FolderX,
  Funnel,
  Globe,
  HardDrive,
  Hash,
  House,
  Image,
  Info,
  Kanban,
  LayoutDashboard,
  LayoutGrid,
  Link,
  Link2,
  List,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MessagesSquare,
  Moon,
  MoonStar,
  Move,
  MoveRight,
  Package,
  Paintbrush,
  Palette,
  PanelLeftClose,
  Paperclip,
  Pause,
  Pencil,
  PenLine,
  Phone,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Reply,
  RotateCcw,
  Rows2,
  Rows3,
  ScanSearch,
  Search,
  SearchX,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Square,
  SquareArrowOutUpRight,
  SquareCheck,
  SquareCode,
  SquareMinus,
  SquarePlus,
  Star,
  StickyNote,
  Sun,
  SunMoon,
  TableColumnsSplit,
  TableRowsSplit,
  TextCursorInput,
  ThumbsUp,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Unlink,
  Upload,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Webhook,
  X,
  type LucideIcon,
} from "lucide-react";
import { createElement, type ComponentType, type CSSProperties, type KeyboardEvent, type SVGProps } from "react";
import { layoutCss } from "./layout-metadata";
import { useLayout, type LayoutProps } from "./layout";

/** What an icon component receives: an SVG's props (Lucide's components take these). */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

/** XMLUI's icon names, and the App shell's (step 19B), with their Lucide drawings. */
const BUILT_IN: Readonly<Record<string, IconComponent>> = {
  // XMLUI (icons-abstractions.ts), in its order.
  assign: UserCheck,
  arrowup: ArrowUp,
  arrowleft: ArrowLeft,
  arrowright: ArrowRight,
  arrowdown: ArrowDown,
  pause: Pause,
  play: Play,
  date: Calendar,
  hamburger: Menu,
  send: Send,
  users: Users,
  refresh: RefreshCw,
  "sidebar-collapse": PanelLeftClose,
  chevrondown: ChevronDown,
  chevronup: ChevronUp,
  chevronright: ChevronRight,
  chevronleft: ChevronLeft,
  chevronsright: ChevronsRight,
  chevronsleft: ChevronsLeft,
  doublechevrondown: ChevronsDown,
  doublechevronup: ChevronsUp,
  doublechevronright: ChevronsRight,
  doublechevronleft: ChevronsLeft,
  dotmenu: EllipsisVertical,
  dotmenuhorizontal: Ellipsis,
  noresult: SearchX,
  crm: Contact,
  chat: MessagesSquare,
  pencil: Pencil,
  cube: Box,
  apps: LayoutGrid,
  permissions: ShieldCheck,
  close: X,
  star: Star,
  help: CircleHelp,
  compactlist: List,
  copy: Copy,
  move: Move,
  rename: TextCursorInput,
  hyperlink: ExternalLink,
  globe: Globe,
  link: Link,
  looselist: Rows3,
  options: SlidersHorizontal,
  search: Search,
  filter: Funnel,
  trash: Trash2,
  pen: PenLine,
  email: Mail,
  phone: Phone,
  home: House,
  user: User,
  exit: LogOut,
  adduser: UserPlus,
  userminus: UserMinus,
  plus: Plus,
  inspect: ScanSearch,
  "plus-circle": CirclePlus,
  filledplus: SquarePlus,
  darktolight: SunMoon,
  lighttodark: MoonStar,
  checkmark: Check,
  valid: CircleCheck,
  info: Info,
  error: CircleX,
  warning: TriangleAlert,
  board: Kanban,
  list: List,
  folder: Folder,
  "folder-outline": FolderOpen,
  emptyfolder: FolderX,
  pdf: FileText,
  txt: FileText,
  doc: FileText,
  docx: FileText,
  "doc-outline": File,
  conf: FileCog,
  code: Code,
  codesandbox: SquareCode,
  box: Package,
  unknownfile: FileQuestionMark,
  photo: Image,
  previous: SkipBack,
  next: SkipForward,
  like: ThumbsUp,
  reply: Reply,
  attach: Paperclip,
  attach2: Paperclip,
  emoji: Smile,
  message: MessageSquare,
  upload: Upload,
  "split-vertical": Columns2,
  "split-horizontal": Rows2,
  swap: ArrowLeftRight,
  download: Download,
  note: StickyNote,
  binding: Link2,
  database: Database,
  unlink: Unlink,
  api: Webhook,
  expression: Braces,
  hash: Hash,
  drive: HardDrive,
  lock: Lock,
  start: Play,
  stop: Square,
  restart: RotateCcw,
  duplicate: CopyPlus,
  connect: Plug,
  cog: Settings,
  sun: Sun,
  moon: Moon,
  stars: Sparkles,
  share: Share2,
  "new-window": SquareArrowOutUpRight,
  paint: Paintbrush,
  palette: Palette,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "trending-level": MoveRight,
  sortasc: ArrowUpNarrowWide,
  sortdesc: ArrowDownWideNarrow,
  nosort: ArrowUpDown,
  square: Square,
  squarehalf: SquareMinus,
  squarefill: SquareCheck,
  "table-insert-row": BetweenHorizontalEnd,
  "table-delete-row": TableRowsSplit,
  "table-insert-column": BetweenVerticalEnd,
  "table-delete-column": TableColumnsSplit,
  eye: Eye,
  "eye-off": EyeOff,
  // The App shell's names before step 23 (NavLink icon="settings").
  settings: Settings,
  chart: ChartColumn,
  mail: Mail,
  layout: LayoutDashboard,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronDown: ChevronDown,
};

/** The names with a drawing in the registry now (the built-ins, and what the app registered). */
export function registeredIconNames(): string[] {
  return [...registry.keys()];
}


const registry = new Map<string, IconComponent>(Object.entries(BUILT_IN));

/**
 * Adds an icon (or replaces one) for every `Icon name`, `NavLink icon` and the
 * like: a Lucide icon, or any component that renders an `<svg>` from SVG props.
 */
export function registerIcon(name: string, component: IconComponent): void {
  registry.set(name, component);
}

/** The icon registered under `name`, if any. */
export function lookupIcon(name: unknown): IconComponent | undefined {
  return typeof name === "string" ? registry.get(name) : undefined;
}

/** A registered icon by name, for the components' own use (the shell); nothing for an unknown name. */
export function Glyph({ name, className }: { name?: unknown; className?: string }) {
  const icon = lookupIcon(name);
  return icon ? createElement(icon, { className, width: 20, height: 20, "aria-hidden": true }) : null;
}

/** XMLUI's named sizes (IconReact.tsx mapSizeToIconPack). */
const SIZES: Readonly<Record<string, string>> = { xs: "12px", sm: "16px", md: "24px", lg: "32px" };

/** `size`: a named size, a CSS size or a `$token`; undefined: the theme's size-Icon. */
export function iconSize(size: unknown): string | undefined {
  if (typeof size === "string" && Object.hasOwn(SIZES, size)) return SIZES[size];
  return layoutCss(size);
}

type IconProps = LayoutProps & { name?: unknown; fallback?: unknown; size?: unknown; onClick?: () => unknown };

/**
 * `Icon`: a registered icon by `name`, else by `fallback`, else nothing.
 * Clickable (`onClick`): a button for the keyboard too (Enter, Space).
 */
export function Icon(props: IconProps) {
  const { name, fallback, size, onClick } = props;
  const layout = useLayout(props);
  const found = lookupIcon(name) ? name : lookupIcon(fallback) ? fallback : undefined;
  const icon = lookupIcon(found);
  if (!icon) return null;
  const sizeCss = iconSize(size);
  const style = sizeCss === undefined ? layout.style : ({ "--gfui-icon-size": sizeCss, ...layout.style } as CSSProperties);
  const clickable = typeof onClick === "function";
  return createElement(icon, {
    className: "gfui-Icon",
    "data-icon-name": String(found),
    "aria-hidden": clickable ? undefined : true,
    ...layout.attributes,
    style,
    ...(clickable
      ? {
          role: "button",
          tabIndex: 0,
          "data-clickable": "",
          // No DOM event reaches script (the sandbox invariant).
          onClick: () => void onClick(),
          onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            void onClick();
          },
        }
      : {}),
  } as SVGProps<SVGSVGElement>);
}
