import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getReceiptDetail } from "@/features/fees/queries";
import { PrintSheet } from "./sheet";

export const metadata = { title: "Fee receipt" };

/**
 * Printable receipt (A4 / A5). Lives outside the app shell so only the receipt
 * prints. Permission is checked before any data is read; "Duplicate copy" is
 * printed on every reprint and the reprint is audit-logged.
 */
export default async function PrintReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ copy?: string; size?: string; layout?: string }> }) {
  const { id } = await params;
  const { copy, size, layout } = await searchParams;
  await requireCapability("fees.view");
  const supabase = await createClient();
  const d = await getReceiptDetail(supabase, id);
  if (!d) redirect("/not-allowed");
  const school = await getReceiptSchool();
  const duplicate = copy !== "original";
  if (duplicate) {
    await supabase.rpc("log_event", { p_action: "fee.receipt_reprinted", p_table: "fee_receipts", p_record_id: id, p_details: { receipt_no: d.receipt.receiptNo } });
  }
  return (
    <PrintSheet
      data={d}
      duplicate={duplicate}
      initialLayout={layout === "a4" || layout === "a5" || layout === "two" ? layout : size === "a5" ? "a5" : "two"}
      school={school}
    />
  );
}
