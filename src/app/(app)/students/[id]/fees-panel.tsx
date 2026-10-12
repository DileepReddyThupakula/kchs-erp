import Link from "next/link";
import { Printer, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, StatusChip } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { getFeeHeads, getReceipts, toDueRow } from "@/features/fees/queries";
import { MODE_LABEL, todayIst } from "@/features/fees/shared";

/** Fees tab of the student profile. The caller has already checked fees.view; RLS checks again. */
export async function StudentFeesPanel({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const [{ all, special }, { data: dueData }, receipts, { data: years }] = await Promise.all([
    getFeeHeads(supabase),
    supabase.from("student_fee_dues").select("*").eq("student_id", studentId).is("voided_at", null).order("due_date").order("installment_seq"),
    getReceipts(supabase, { studentId }),
    supabase.from("academic_years").select("id, name, start_date"),
  ]);
  const heads = new Map(all.map((h) => [h.id, h]));
  const yearName = new Map((years ?? []).map((y) => [y.id, y.name]));
  const dues = (dueData ?? []).map((d) => toDueRow(d, heads, special));
  const today = todayIst();
  const outstanding = dues.reduce((a, d) => a + Math.max(0, d.balance), 0);
  const overdue = dues.filter((d) => d.balance > 0 && d.dueDate < today).reduce((a, d) => a + d.balance, 0);
  const paid = dues.reduce((a, d) => a + d.paid, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-muted">Outstanding</p>
          <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(outstanding)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Overdue</p>
          <p className={`text-2xl font-semibold tabular-nums ${overdue ? "text-red-700" : "text-navy-900"}`}>{formatPaise(overdue)}</p>
        </Card>
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Paid so far</p>
            <p className="text-2xl font-semibold tabular-nums text-peacock-700">{formatPaise(paid)}</p>
          </div>
          <Link href={`/fees/collect?student=${studentId}`} className={buttonClasses("primary")}>
            <Wallet className="size-4" aria-hidden /> Collect
          </Link>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <h3 className="border-b border-border px-4 py-3 font-semibold text-navy-900">Dues</h3>
        {dues.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted">No dues yet. They appear when the student is enrolled and class fees are set.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">Fee</th>
                  <th className="px-3 py-2">Due date</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Concession</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted">{yearName.get(d.yearId)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="font-medium text-navy-900">{d.headName}</span> <span className="text-xs text-muted">{d.label}</span>
                      {d.isSpecial && <Badge tone="gold" className="ml-1.5">Special</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {formatDate(d.dueDate)} {d.balance > 0 && d.dueDate < today && <Badge tone="danger" className="ml-1">Overdue</Badge>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatPaise(d.amount)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.concession ? formatPaise(d.concession) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.paid ? formatPaise(d.paid) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{d.balance > 0 ? formatPaise(d.balance) : <span className="text-peacock-700">Paid</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <h3 className="border-b border-border px-4 py-3 font-semibold text-navy-900">Receipts</h3>
        {receipts.length === 0 ? (
          <div className="p-4">
            <EmptyState>No payments recorded yet.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {receipts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Link href={`/fees/receipts/${r.id}`} className={`font-mono text-xs font-medium hover:underline ${r.status === "cancelled" ? "text-red-700 line-through" : "text-navy-800"}`}>
                  {r.receiptNo}
                </Link>
                <span className="text-muted">{formatDate(r.date)}</span>
                <span className="font-semibold tabular-nums">{formatPaise(r.total)}</span>
                <span className="text-xs text-muted">
                  {MODE_LABEL[r.mode]}
                  {r.reference ? ` · ${r.reference}` : ""}
                </span>
                {r.kind === "misc" && <Badge tone="gold">Miscellaneous</Badge>}
                {r.status === "cancelled" && <StatusChip status="left" label="Cancelled" />}
                <span className="ml-auto flex items-center gap-3 text-xs text-muted">
                  by {r.collectedBy}
                  <Link href={`/print/receipt/${r.id}?copy=duplicate`} target="_blank" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
                    <Printer className="size-3.5" aria-hidden /> Print
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
