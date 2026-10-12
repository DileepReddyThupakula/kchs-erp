"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  ListFilter,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { exportSheets, type ExportCell, type ExportFormat } from "@/lib/export";
import { logExport } from "@/features/audit/actions";
import { EmptyState } from "@/components/ui/card";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Used for sorting (and export, unless exportValue is given). Omit = not sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Value written to CSV/Excel. Omit (and no sortValue) = column not exported. */
  exportValue?: (row: T) => ExportCell;
  hideable?: boolean;
  defaultHidden?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
};

export type FilterDef<T> = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

/** Small click-away popover used by the toolbar menus. */
function Popover({ button, children, align = "left" }: { button: (toggle: () => void, open: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {button(() => setOpen((o) => !o), open)}
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-1.5 min-w-48 rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const toolBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm text-navy-800 shadow-sm transition-colors hover:border-navy-200 hover:bg-navy-50 aria-expanded:border-navy-300 aria-expanded:bg-navy-50";

function readHidden(key: string, fallback: string[]) {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as string[]) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reusable data table: search, filter chips, sorting, pagination, row
 * selection with a bulk-action bar, column show/hide, CSV/Excel export of
 * the current filtered rows (logged in the audit log), empty + loading states.
 */
export function DataTable<T>({
  id,
  rows,
  columns,
  getRowId,
  searchText,
  searchPlaceholder = "Search…",
  filters = [],
  initialFilters = {},
  pageSize: initialPageSize = 25,
  selectable = false,
  bulkActions,
  emptyTitle = "Nothing here yet",
  emptyMessage = "There are no records to show.",
  emptyAction,
  loading = false,
  exportName,
  exportDetails,
  toolbar,
  customExport,
}: {
  /** Stable id: remembers column visibility per table. */
  id: string;
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: FilterDef<T>[];
  initialFilters?: Record<string, string>;
  pageSize?: number;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  loading?: boolean;
  /** Set to enable the Export button (file name + audit log label). */
  exportName?: string;
  exportDetails?: Record<string, unknown>;
  toolbar?: React.ReactNode;
  /** Replace the built-in export menu (e.g. a field picker). Gets selected rows, or all filtered rows. */
  customExport?: (rows: T[], info: { selectedOnly: boolean; filters: Record<string, string>; search: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Record<string, string>>(initialFilters);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const storageKey = `dt-cols:${id}`;
  const defaultHidden = useMemo(() => columns.filter((c) => c.defaultHidden).map((c) => c.id), [columns]);
  const [hidden, setHidden] = useState<string[]>(defaultHidden);
  useEffect(() => setHidden(readHidden(storageKey, defaultHidden)), [storageKey, defaultHidden]);
  const toggleColumn = (cid: string) =>
    setHidden((h) => {
      const next = h.includes(cid) ? h.filter((x) => x !== cid) : [...h, cid];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep in memory only */
      }
      return next;
    });

  const visible = columns.filter((c) => !hidden.includes(c.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) =>
      Object.entries(active).every(([fid, v]) => {
        const f = filters.find((x) => x.id === fid);
        return !f || !v || f.match(r, v);
      }),
    );
    if (q && searchText) out = out.filter((r) => searchText(r).toLowerCase().includes(q));
    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.sortValue) {
        const sv = col.sortValue;
        out = [...out].sort((a, b) => {
          const x = sv(a);
          const y = sv(b);
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-IN", { numeric: true });
          return sort.dir === "asc" ? r : -r;
        });
      }
    }
    return out;
  }, [rows, active, filters, query, searchText, sort, columns]);

  // Reset paging / prune selection when the visible set changes.
  useEffect(() => setPage(0), [query, active, pageSize]);
  const ids = useMemo(() => new Set(filtered.map(getRowId)), [filtered, getRowId]);
  useEffect(() => setSelected((s) => new Set([...s].filter((x) => ids.has(x)))), [ids]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const selectedRows = filtered.filter((r) => selected.has(getRowId(r)));
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(getRowId(r)));

  const cycleSort = (cid: string) =>
    setSort((s) => (s?.id !== cid ? { id: cid, dir: "asc" } : s.dir === "asc" ? { id: cid, dir: "desc" } : null));

  async function doExport(format: ExportFormat) {
    if (!exportName) return;
    const cols = visible.filter((c) => c.exportValue || c.sortValue);
    const source = selectedRows.length ? selectedRows : filtered;
    setExporting(format);
    try {
      await exportSheets(exportName, format, [
        {
          name: exportName,
          headers: cols.map((c) => c.header),
          rows: source.map((r) => cols.map((c) => (c.exportValue ? c.exportValue(r) : (c.sortValue?.(r) ?? null)))),
        },
      ]);
      await logExport(exportName, source.length, format, { ...exportDetails, selectedOnly: selectedRows.length > 0, filters: active, search: query || undefined });
      toast.success(`Exported ${source.length} row${source.length === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  const activeChips = Object.entries(active).filter(([, v]) => v);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {searchText && (
          <label className="relative min-w-52 flex-1 sm:max-w-xs">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm shadow-sm outline-none placeholder:text-ink-muted/70 focus:border-navy-500 focus:ring-3 focus:ring-gold-300/40"
            />
          </label>
        )}
        {filters.map((f) => (
          <Popover
            key={f.id}
            button={(toggle, open) => (
              <button type="button" onClick={toggle} aria-expanded={open} className={cn(toolBtn, active[f.id] && "border-gold-300 bg-gold-50")}>
                <ListFilter className="size-4 text-navy-500" aria-hidden />
                {f.label}
                {active[f.id] && <span className="font-semibold">: {f.options.find((o) => o.value === active[f.id])?.label}</span>}
              </button>
            )}
          >
            {(close) => (
              <ul className="max-h-72 overflow-y-auto" role="listbox" aria-label={f.label}>
                {[{ value: "", label: "All" }, ...f.options].map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={(active[f.id] ?? "") === o.value}
                      onClick={() => {
                        setActive((a) => ({ ...a, [f.id]: o.value }));
                        close();
                      }}
                      className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-navy-50 aria-selected:bg-gold-50 aria-selected:font-semibold"
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <Popover
            align="right"
            button={(toggle, open) => (
              <button type="button" onClick={toggle} aria-expanded={open} className={toolBtn} title="Show or hide columns">
                <Columns3 className="size-4 text-navy-500" aria-hidden />
                <span className="max-sm:sr-only">Columns</span>
              </button>
            )}
          >
            {() => (
              <ul>
                {columns
                  .filter((c) => c.hideable !== false)
                  .map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-navy-50">
                        <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => toggleColumn(c.id)} className="accent-navy-700" />
                        {c.header}
                      </label>
                    </li>
                  ))}
              </ul>
            )}
          </Popover>
          {customExport && (
            <button
              type="button"
              className={toolBtn}
              onClick={() => customExport(selectedRows.length ? selectedRows : filtered, { selectedOnly: selectedRows.length > 0, filters: active, search: query })}
            >
              <Download className="size-4 text-navy-500" aria-hidden />
              <span className="max-sm:sr-only">Export</span>
            </button>
          )}
          {exportName && !customExport && (
            <Popover
              align="right"
              button={(toggle, open) => (
                <button type="button" onClick={toggle} aria-expanded={open} className={toolBtn} disabled={!!exporting}>
                  {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4 text-navy-500" aria-hidden />}
                  <span className="max-sm:sr-only">Export</span>
                </button>
              )}
            >
              {(close) => (
                <div className="w-56">
                  <p className="px-2.5 pb-1 pt-0.5 text-xs text-muted">
                    {selectedRows.length ? `${selectedRows.length} selected row(s)` : `${filtered.length} filtered row(s)`}, visible columns
                  </p>
                  {(
                    [
                      ["xlsx", "Excel (.xlsx)", FileSpreadsheet],
                      ["csv", "CSV (.csv)", FileText],
                    ] as const
                  ).map(([fmt, label, Icon]) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        close();
                        doExport(fmt);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-navy-50"
                    >
                      <Icon className="size-4 text-navy-500" aria-hidden /> {label}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map(([fid, v]) => {
            const f = filters.find((x) => x.id === fid);
            return (
              <span key={fid} className="inline-flex items-center gap-1 rounded-full bg-gold-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-gold-800 ring-1 ring-inset ring-gold-200">
                {f?.label}: {f?.options.find((o) => o.value === v)?.label ?? v}
                <button
                  type="button"
                  onClick={() => setActive((a) => ({ ...a, [fid]: "" }))}
                  className="grid size-5 place-items-center rounded-full hover:bg-gold-200"
                  aria-label={`Remove ${f?.label} filter`}
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
          <button type="button" onClick={() => setActive({})} className="text-xs font-medium text-navy-700 hover:underline">
            Clear all
          </button>
        </div>
      )}

      {/* Bulk-action bar */}
      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-navy-900 px-4 py-2 text-sm text-cream-50 shadow-[var(--shadow-lift)]" role="region" aria-label="Bulk actions">
          <span className="font-semibold text-gold-400">{selectedRows.length} selected</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(selectedRows, () => setSelected(new Set()))}</div>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-navy-200 hover:text-white">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton columns={visible.length} />
      ) : filtered.length === 0 ? (
        <EmptyState title={rows.length ? "No matches" : emptyTitle} action={rows.length ? undefined : emptyAction}>
          {rows.length ? "Nothing matches your search or filters. Try clearing them." : emptyMessage}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-cream-100 shadow-[0_1px_0_var(--color-line)]">
                <tr>
                  {selectable && (
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPage}
                        onChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            pageRows.forEach((r) => (allOnPage ? n.delete(getRowId(r)) : n.add(getRowId(r))));
                            return n;
                          })
                        }
                        className="size-4 accent-navy-700"
                      />
                    </th>
                  )}
                  {visible.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      aria-sort={sort?.id === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                      )}
                    >
                      {c.sortValue ? (
                        <button type="button" onClick={() => cycleSort(c.id)} className="inline-flex items-center gap-1 uppercase hover:text-navy-900">
                          {c.header}
                          {sort?.id === c.id ? (
                            sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const rid = getRowId(r);
                  const isSel = selected.has(rid);
                  return (
                    <tr key={rid} className={cn("border-t border-border transition-colors hover:bg-cream-50", isSel && "bg-gold-50/70 hover:bg-gold-50")}>
                      {selectable && (
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            aria-label="Select row"
                            checked={isSel}
                            onChange={() =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (n.has(rid)) n.delete(rid);
                                else n.add(rid);
                                return n;
                              })
                            }
                            className="size-4 accent-navy-700"
                          />
                        </td>
                      )}
                      {visible.map((c) => (
                        <td
                          key={c.id}
                          className={cn("px-3 py-1.5 align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                        >
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-cream-50 px-3 py-2 text-xs text-muted">
            <span>
              {filtered.length === rows.length ? `${rows.length} records` : `${filtered.length} of ${rows.length} records`}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-7 rounded-md border border-border bg-surface px-1 text-xs"
                >
                  {[25, 50, 100, 250].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="grid size-7 place-items-center rounded-md border border-border bg-surface disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="grid size-7 place-items-center rounded-md border border-border bg-surface disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Placeholder rows while data loads (also used by route loading.tsx files). */
export function TableSkeleton({ columns = 5, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]" aria-busy="true" aria-label="Loading">
      <div className="h-9 bg-cream-100" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-t border-border px-3 py-3">
          {Array.from({ length: columns }).map((__, j) => (
            <div key={j} className="skeleton h-3.5 flex-1 rounded" style={{ maxWidth: j === 0 ? 120 : undefined }} />
          ))}
        </div>
      ))}
    </div>
  );
}
