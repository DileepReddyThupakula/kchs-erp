import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge, PageHeader, StatusChip } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Receipt as ReceiptPaper } from "@/components/fees/receipt";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getReceiptDetail } from "@/features/fees/queries";
import { ReceiptActions } from "./actions";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePage("/fees/receipts");
  const supabase = await createClient();
  const d = await getReceiptDetail(supabase, id);
  if (!d) redirect("/not-allowed");
  const r = d.receipt;
  const school = await getReceiptSchool();

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
      <div className="overflow-x-auto rounded-xl bg-neutral-200/70 p-4 sm:p-8">
        <div className="mx-auto w-fit shadow-[0_8px_30px_rgba(1,26,55,0.18)]">
          <ReceiptPaper data={d} school={school} duplicate />
        </div>
      </div>
    </>
  );
}
