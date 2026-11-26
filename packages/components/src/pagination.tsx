// Pagination (step 30, decision 6; moved from step 31): page buttons, a page
// size selector and page information, on its own or under a Table. XMLUI:
// xmlui/src/components/Pagination/PaginationReact.tsx (its props, events, API,
// labels and layout: three slots, start, center and end).
import { useComponentApi, type RegisterApi } from "@gluefuil/runtime";
import { ActionIcon, NativeSelect } from "@mantine/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Glyph } from "./icons";
import { useLayout, type LayoutProps } from "./layout";

type Handler = ((...args: unknown[]) => unknown) | undefined;
type Position = "start" | "center" | "end";

const isFalse = (v: unknown) => v === false || v === "false";
const integer = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};
const position = (v: unknown, fallback: Position): Position => (v === "start" || v === "center" || v === "end" ? v : fallback);

/** The page numbers shown around the current one (XMLUI getVisiblePages). */
export function visiblePages(current: number, total: number, max: number): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(total, start + max - 1);
  if (end === total) start = Math.max(1, end - max + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export interface PagerProps {
  /** 0-based. */
  pageIndex: number;
  pageSize: number;
  /** Undefined: only previous and next, enabled by hasPrevPage and hasNextPage. */
  itemCount?: number;
  hasPrevPage?: boolean;
  hasNextPage?: boolean;
  pageSizeOptions: number[];
  maxVisiblePages: number;
  enabled: boolean;
  showPageInfo: boolean;
  showPageSizeSelector: boolean;
  showCurrentPage: boolean;
  orientation: "horizontal" | "vertical";
  pageSizeSelectorPosition: Position;
  pageInfoPosition: Position;
  buttonRowPosition: Position;
  onPage: (pageIndex: number) => void;
  onPageSize: (pageSize: number) => void;
  className?: string;
  attributes?: Record<string, string>;
  style?: React.CSSProperties;
}

let pagerIds = 0;

/** The pager itself, controlled (the Table's, and Pagination's). */
export function Pager(props: PagerProps) {
  const [id] = useState(() => `gfui-pagination-${++pagerIds}`);
  const vertical = props.orientation === "vertical";
  const counted = typeof props.itemCount === "number" && props.itemCount >= 0;
  const total = counted ? Math.max(1, Math.ceil(props.itemCount! / Math.max(1, props.pageSize))) : 1;
  const current = counted ? Math.max(0, Math.min(props.pageIndex, total - 1)) : props.pageIndex;
  const go = (index: number) => {
    const next = counted ? Math.max(0, Math.min(index, total - 1)) : Math.max(0, index);
    if (next !== current) props.onPage(next);
  };
  const icon = (name: string, label: string, disabled: boolean, onClick: () => void) => (
    <li>
      <ActionIcon variant="subtle" size="md" aria-label={label} disabled={!props.enabled || disabled} onClick={onClick} className="gfui-Pagination-button">
        <Glyph name={name} />
      </ActionIcon>
    </li>
  );
  const dir = (h: string, v: string) => (vertical ? v : h);
  let buttons: ReactNode;
  if (!counted) {
    buttons = (
      <ul className="gfui-Pagination-buttons">
        {icon(dir("chevronleft", "chevronup"), "Previous page", !props.hasPrevPage, () => go(current - 1))}
        {icon(dir("chevronright", "chevrondown"), "Next page", !props.hasNextPage, () => go(current + 1))}
      </ul>
    );
  } else {
    const pages = visiblePages(current + 1, total, props.maxVisiblePages);
    buttons = (
      <ul className="gfui-Pagination-buttons">
        {icon(dir("doublechevronleft", "doublechevronup"), "First page", current === 0, () => go(0))}
        {pages.length <= 2 ? icon(dir("chevronleft", "chevronup"), "Previous page", current === 0, () => go(current - 1)) : null}
        {props.showCurrentPage && pages.length === 1 ? (
          <li>
            <span className="gfui-Pagination-current" aria-current="true">
              {pages[0]}
            </span>
          </li>
        ) : null}
        {pages.length > 1
          ? pages.map((page) => (
              <li key={page}>
                <ActionIcon
                  variant={page === current + 1 ? "filled" : "subtle"}
                  size="md"
                  disabled={!props.enabled}
                  aria-current={page === current + 1 ? "true" : undefined}
                  aria-label={`Page ${page}${page === current + 1 ? " (current)" : ""}`}
                  onClick={() => go(page - 1)}
                  className="gfui-Pagination-page"
                >
                  {page}
                </ActionIcon>
              </li>
            ))
          : null}
        {pages.length <= 2 ? icon(dir("chevronright", "chevrondown"), "Next page", current === total - 1, () => go(current + 1)) : null}
        {icon(dir("doublechevronright", "doublechevrondown"), "Last page", current === total - 1, () => go(total - 1))}
      </ul>
    );
  }
  const sizes =
    counted && props.showPageSizeSelector && props.pageSizeOptions.length > 1 ? (
      <label className="gfui-Pagination-size" htmlFor={`${id}-size`}>
        <span className="gfui-Pagination-sizeLabel">Items per page</span>
        <NativeSelect
          id={`${id}-size`}
          size="xs"
          value={String(props.pageSize)}
          disabled={!props.enabled}
          data={props.pageSizeOptions.map(String)}
          onChange={(event) => {
            const size = Number(event.currentTarget.value);
            if (size !== props.pageSize) props.onPageSize(size);
          }}
        />
      </label>
    ) : null;
  const info =
    counted && props.showPageInfo ? (
      <span className="gfui-Pagination-info">
        Page {current + 1} of {total} ({props.itemCount} items)
      </span>
    ) : null;
  const slot = (where: Position) => {
    const parts = [props.pageInfoPosition === where ? info : null, props.pageSizeSelectorPosition === where ? sizes : null, props.buttonRowPosition === where ? buttons : null].filter(Boolean);
    return parts.length > 0 ? (
      <div className="gfui-Pagination-slot" data-slot={where}>
        {parts.map((part, i) => (
          <span key={i} className="gfui-Pagination-part">
            {part}
          </span>
        ))}
      </div>
    ) : null;
  };
  return (
    <nav
      aria-label="Pagination"
      className={props.className ? `gfui-Pagination ${props.className}` : "gfui-Pagination"}
      data-orientation={props.orientation}
      {...props.attributes}
      style={props.style}
    >
      {slot("start")}
      {slot("center")}
      {slot("end")}
    </nav>
  );
}

/** Page size options: an array of positive numbers, else [the page size]. */
export function pageSizeOptions(value: unknown, pageSize: number): number[] {
  const list = Array.isArray(value) ? value.map((v) => integer(v)).filter((v): v is number => v !== undefined && v > 0) : [];
  return list.length > 0 ? list : [pageSize];
}

export type PaginationProps = LayoutProps & {
  enabled?: unknown;
  itemCount?: unknown;
  pageSize?: unknown;
  pageIndex?: unknown;
  maxVisiblePages?: unknown;
  showPageInfo?: unknown;
  showPageSizeSelector?: unknown;
  showCurrentPage?: unknown;
  pageSizeOptions?: unknown;
  hasPrevPage?: unknown;
  hasNextPage?: unknown;
  orientation?: unknown;
  pageSizeSelectorPosition?: unknown;
  pageInfoPosition?: unknown;
  buttonRowPosition?: unknown;
  onPageDidChange?: Handler;
  onPageSizeDidChange?: Handler;
  registerApi?: RegisterApi;
};

/**
 * Pagination (XMLUI): keeps the page and the page size it shows, from
 * `pageIndex` and `pageSize` and following their changes; reports changes with
 * `pageDidChange(pageIndex, pageSize, itemCount)` and `pageSizeDidChange(size)`.
 */
export function Pagination(props: PaginationProps) {
  const layout = useLayout(props);
  const initialSize = Math.max(1, integer(props.pageSize) ?? 10);
  const [pageSize, setPageSize] = useState(initialSize);
  const [pageIndex, setPageIndex] = useState(Math.max(0, integer(props.pageIndex) ?? 0));
  useEffect(() => setPageSize(initialSize), [initialSize]);
  const propIndex = Math.max(0, integer(props.pageIndex) ?? 0);
  useEffect(() => setPageIndex(propIndex), [propIndex]);
  const itemCount = integer(props.itemCount);
  const total = itemCount !== undefined && itemCount >= 0 ? Math.max(1, Math.ceil(itemCount / pageSize)) : undefined;
  const latest = useRef({ pageIndex, pageSize, itemCount, total, props });
  latest.current = { pageIndex, pageSize, itemCount, total, props };
  const changePage = (index: number) => {
    const l = latest.current;
    const next = l.total === undefined ? Math.max(0, index) : Math.max(0, Math.min(index, l.total - 1));
    if (next === l.pageIndex) return;
    // The API reads the new page at once (a handler that moves, then reads currentPage).
    l.pageIndex = next;
    setPageIndex(next);
    void l.props.onPageDidChange?.(next, l.pageSize, l.itemCount ?? 0);
  };
  const changeSize = (size: number) => {
    latest.current.pageSize = size;
    setPageSize(size);
    void latest.current.props.onPageSizeDidChange?.(size);
  };
  const api = useMemo(
    () => ({
      moveFirst: () => changePage(0),
      moveLast: () => changePage((latest.current.total ?? 1) - 1),
      movePrev: () => changePage(latest.current.pageIndex - 1),
      moveNext: () => changePage(latest.current.pageIndex + 1),
      get currentPage() {
        return latest.current.pageIndex + 1;
      },
      get currentPageSize() {
        return latest.current.pageSize;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useComponentApi(props.registerApi, api);
  const max = integer(props.maxVisiblePages);
  return (
    <Pager
      pageIndex={pageIndex}
      pageSize={pageSize}
      itemCount={itemCount}
      hasPrevPage={props.hasPrevPage === true || props.hasPrevPage === "true"}
      hasNextPage={props.hasNextPage === true || props.hasNextPage === "true"}
      pageSizeOptions={pageSizeOptions(props.pageSizeOptions, pageSize)}
      maxVisiblePages={max === 3 || max === 5 ? max : 1}
      enabled={!isFalse(props.enabled)}
      showPageInfo={!isFalse(props.showPageInfo)}
      showPageSizeSelector={!isFalse(props.showPageSizeSelector)}
      showCurrentPage={!isFalse(props.showCurrentPage)}
      orientation={props.orientation === "vertical" ? "vertical" : "horizontal"}
      pageSizeSelectorPosition={position(props.pageSizeSelectorPosition, "start")}
      pageInfoPosition={position(props.pageInfoPosition, "end")}
      buttonRowPosition={position(props.buttonRowPosition, "center")}
      onPage={changePage}
      onPageSize={changeSize}
      attributes={layout.attributes}
      style={layout.style}
    />
  );
}
