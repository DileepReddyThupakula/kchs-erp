"use client";
import { Printer } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { cellText, exportCell, totalsRow, type ReportData } from "@/features/reports/shared";

type Row = Record<string, string | number | null> & { _id: string };

/**
 * A report on screen: search, sort, Excel / CSV export (audit-logged) and a Print link (the print page is audit-logged too).
 * There is deliberately NO share / copy / WhatsApp button here: a report may hold student names.
 */
export function ReportView({ data, printHref, filters }: { data: ReportData; printHref: string; filters: Record<string, unknown> }) {
  const columns: Column<Row>[] = data.columns.map((c) => ({
    id: c.key,
    header: c.header,
    align: c.kind && c.kind !== "text" && c.kind !== "date" && c.kind !== "month" ? "right" : undefined,
    cell: (r) => <span className={c.kind === "money" || c.kind === "int" || c.kind === "pct" ? "tabular-nums" : undefined}>{cellText(c.kind, r[c.key])}</span>,
    sortValue: (r) => r[c.key],
    exportValue: (r) => exportCell(c.kind, r[c.key]),
  }));
  const rows: Row[] = data.rows.map((r, i) => ({ ...r, _id: String(i) }));
  const totals = totalsRow(data);
  return (
    <div className="space-y-3">
      <DataTable
        id={`report-${data.id}`}
        rows={rows}
        columns={columns}
        getRowId={(r) => r._id}
        searchText={(r) => data.columns.map((c) => String(r[c.key] ?? "")).join(" ")}
        exportName={data.id}
        exportDetails={{ title: data.title, subtitle: data.subtitle, ...filters }}
        pageSize={50}
        emptyTitle="Nothing to show"
        emptyMessage={data.note ?? "No rows for these filters."}
        toolbar={
          <a href={printHref} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm text-navy-800 shadow-sm transition-colors hover:border-navy-200 hover:bg-navy-50">
            <Printer className="size-4 text-navy-500" aria-hidden /> <span className="max-sm:sr-only">Print / PDF</span>
          </a>
        }
      />
      {totals && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border bg-cream-50 px-3 py-2 text-sm" aria-label="Totals">
          <b className="text-navy-900">Total</b>
          {data.columns
            .filter((c) => c.total)
            .map((c) => (
              <span key={c.key}>
                <span className="text-muted">{c.header}: </span>
                <b className="tabular-nums">{cellText(c.kind, totals[c.key])}</b>
              </span>
            ))}
        </div>
      )}
      {data.note && <p className="text-xs text-muted">{data.note}</p>}
    </div>
  );
}
