import { Receipt } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import type { ReceiptRow } from "@/features/fees/queries";
import { todayIst } from "@/features/fees/shared";
import { RangeForm } from "@/components/fees/range-form";
import { ReceiptsTable } from "./table";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/fees/receipts");
  const year = await resolveYear();
  const supabase = await createClient();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : (year?.start_date ?? todayIst());
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : todayIst();
  // ONE database call: the receipts of the range with their fee heads, the student's class and who collected, and the class list
  const { data } = year ? await supabase.rpc("fees_receipts_page", { p_year: year.id, p_from: from, p_to: to }) : { data: null };
  const page = (data as unknown as { rows: ReceiptRow[]; classes: { id: string; name: string }[] } | null) ?? { rows: [], classes: [] };
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Fees" }, { label: "Receipts" }]}
        icon={<Receipt />}
        title="Receipts"
        description="Every receipt, including cancelled ones (their numbers stay visible). Reprints are marked “Duplicate copy”."
        filters={<RangeForm from={from} to={to} />}
      />
      <ReceiptsTable rows={page.rows} canCancel={can(me, "fees.cancelReceipt")} classes={page.classes} rangeLabel={`${from}_to_${to}`} />
    </>
  );
}
