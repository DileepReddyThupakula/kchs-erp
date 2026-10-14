"use client";
import { useMemo } from "react";
import { Banknote, Receipt, Smartphone, XCircle } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge, Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { MODE_LABEL } from "@/features/fees/shared";
import type { ReceiptRow } from "@/features/fees/queries";
import { ReceiptsTable } from "../receipts/table";

type Line = { key: string; label: string; count: number; amount: number; special?: boolean };

function Summary({ id, title, rows, exportName, first }: { id: string; title: string; rows: Line[]; exportName: string; first: string }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const columns: Column<Line>[] = [
    {
      id: "label",
      header: first,
      hideable: false,
      pinned: "left",
      className: "whitespace-nowrap",
      cell: (r) => (
        <span className="font-medium text-navy-900">
          {r.label} {r.special && <Badge tone="gold" className="ml-1">Special</Badge>}
        </span>
      ),
      sortValue: (r) => r.label,
      exportValue: (r) => r.label,
    },
    { id: "count", header: "Receipts", align: "right", cell: (r) => r.count, sortValue: (r) => r.count },
    { id: "amount", header: "Amount", align: "right", className: "whitespace-nowrap", cell: (r) => <span className="font-semibold tabular-nums">{formatPaise(r.amount)}</span>, sortValue: (r) => r.amount, exportValue: (r) => r.amount / 100 },
    {
      id: "share",
      header: "Share",
      align: "right",
      cell: (r) => <span className="tabular-nums text-muted">{total ? Math.round((r.amount / total) * 100) : 0}%</span>,
      sortValue: (r) => r.amount,
      exportValue: (r) => (total ? Math.round((r.amount / total) * 1000) / 10 : 0),
    },
  ];
  return (
    <div>
      <h2 className="mb-2 flex items-baseline justify-between font-semibold text-navy-900">
        {title} <span className="text-sm font-normal tabular-nums text-muted">Total {formatPaise(total)}</span>
      </h2>
      <DataTable id={id} rows={rows} columns={columns} getRowId={(r) => r.key} exportName={exportName} emptyTitle="Nothing collected" emptyMessage="No payments in this period." pageSize={25} />
    </div>
  );
}

export function ReportView({ rows, from, to, single, classes }: { rows: ReceiptRow[]; from: string; to: string; single: boolean; classes: { id: string; name: string }[] }) {
  const valid = useMemo(() => rows.filter((r) => r.status === "valid"), [rows]);
  const cancelled = rows.length - valid.length;
  const total = valid.reduce((a, r) => a + r.total, 0);

  const byMode = useMemo(() => {
    const m = new Map<string, Line>();
    for (const r of valid) {
      const cur = m.get(r.mode) ?? { key: r.mode, label: MODE_LABEL[r.mode], count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.total;
      m.set(r.mode, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [valid]);

  const byHead = useMemo(() => {
    const m = new Map<string, Line>();
    for (const r of valid)
      for (const h of r.heads) {
        const cur = m.get(h.headId) ?? { key: h.headId, label: h.headName, count: 0, amount: 0, special: h.isSpecial };
        cur.count += 1;
        cur.amount += h.amount;
        m.set(h.headId, cur);
      }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [valid]);

  const byDay = useMemo(() => {
    const m = new Map<string, Line>();
    for (const r of valid) {
      const cur = m.get(r.date) ?? { key: r.date, label: formatDate(r.date), count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.total;
      m.set(r.date, cur);
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [valid]);

  // UPI is kept apart so the office can match it to the bank / UPI statement
  const upi = useMemo(() => {
    const list = valid.filter((r) => r.mode === "upi");
    return { count: list.length, amount: list.reduce((a, r) => a + r.total, 0), noRef: list.filter((r) => !r.reference).length };
  }, [valid]);
  const label = single ? from : `${from}_to_${to}`;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-peacock-100 text-peacock-700">
            <Banknote className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(total)}</p>
            <p className="text-xs text-muted">Total collected</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-navy-100 text-navy-700">
            <Receipt className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-navy-900">{valid.length}</p>
            <p className="text-xs text-muted">Valid receipts</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-red-100 text-red-700">
            <XCircle className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-navy-900">{cancelled}</p>
            <p className="text-xs text-muted">Cancelled (not counted)</p>
          </div>
        </Card>
        <Card>
          <p className="text-2xl font-semibold tabular-nums text-navy-900">{valid.filter((r) => r.kind === "misc").length}</p>
          <p className="text-xs text-muted">Miscellaneous receipts</p>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-4 border-gold-200 bg-gold-50/60">
        <span className="grid size-11 place-items-center rounded-xl bg-gold-100 text-gold-800">
          <Smartphone className="size-5" aria-hidden />
        </span>
        <div className="min-w-48">
          <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(upi.amount)}</p>
          <p className="text-xs text-muted">
            UPI collected · {upi.count} receipt{upi.count === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-xs text-muted sm:ml-auto sm:max-w-sm">
          Match this total with the bank / UPI statement.{upi.noRef > 0 ? ` ${upi.noRef} UPI receipt${upi.noRef === 1 ? " has" : "s have"} no transaction ID.` : ""} Filter the list below by Mode → UPI to see each one.
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Summary id="report-mode" title="By payment mode" rows={byMode} exportName={`collection-by-mode-${label}`} first="Payment mode" />
        <Summary id="report-head" title="By fee head" rows={byHead} exportName={`collection-by-head-${label}`} first="Fee head" />
      </div>
      {!single && <Summary id="report-day" title="By day" rows={byDay} exportName={`collection-by-day-${label}`} first="Date" />}

      <div>
        <h2 className="mb-2 font-semibold text-navy-900">Receipts</h2>
        <ReceiptsTable rows={rows} canCancel={false} classes={classes} rangeLabel={`report-${label}`} />
      </div>
    </div>
  );
}
