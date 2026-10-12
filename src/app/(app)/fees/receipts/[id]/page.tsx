import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, StatusChip } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { amountInWords, formatPaise } from "@/lib/money";
import { getReceiptDetail } from "@/features/fees/queries";
import { MODE_LABEL } from "@/features/fees/shared";
import { ReceiptActions } from "./actions";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePage("/fees/receipts");
  const supabase = await createClient();
  const d = await getReceiptDetail(supabase, id);
  if (!d) redirect("/not-allowed");
  const r = d.receipt;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Fees" }, { label: "Receipts", href: "/fees/receipts" }, { label: r.receiptNo }]}
        icon={<Receipt />}
        title={`Receipt ${r.receiptNo}`}
        description={`${formatDate(r.date)} · ${r.studentName}`}
        actions={
          <>
            {r.status === "cancelled" ? <StatusChip status="left" label="Cancelled" /> : <StatusChip status="active" label="Valid" />}
            {r.kind === "misc" && <Badge tone="gold">Miscellaneous</Badge>}
            <ReceiptActions id={r.id} receiptNo={r.receiptNo} total={r.total} canCancel={can(me, "fees.cancelReceipt")} cancelled={r.status === "cancelled"} />
          </>
        }
      />
      {r.status === "cancelled" && (
        <p role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Cancelled{r.cancelledAt ? ` on ${formatDate(r.cancelledAt.slice(0, 10))}` : ""}: {r.cancelReason}. The amount is no longer counted as paid.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2">Fee</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i, n) => (
                <tr key={n} className="border-t border-border">
                  <td className="px-4 py-2">
                    {i.description} {i.isSpecial && <Badge tone="gold" className="ml-1">Special</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPaise(i.amount, { fixed: true })}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-cream-50 font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPaise(r.total, { fixed: true })}</td>
              </tr>
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted">{amountInWords(r.total)}</p>
        </Card>
        <Card>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Student / payer</dt>
              <dd className="font-medium text-navy-900">{r.studentName}</dd>
              {d.student && (
                <dd className="text-muted">
                  <span className="font-mono text-xs">{d.student.adm}</span> · {d.student.className ?? "—"} {d.student.section ? `– ${d.student.section}` : ""}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-muted">Payment</dt>
              <dd>
                {MODE_LABEL[r.mode]}
                {r.reference ? <span className="ml-1 font-mono text-xs">· {r.reference}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Collected by</dt>
              <dd>{r.collectedBy}</dd>
            </div>
            {r.notes && (
              <div>
                <dt className="text-xs text-muted">Note</dt>
                <dd>{r.notes}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}
