import { Receipt } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { getReceipts, getStudentLookup } from "@/features/fees/queries";
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
  const lookup = year ? await getStudentLookup(supabase, year.id) : [];
  const rows = await getReceipts(supabase, { from, to, lookup: new Map(lookup.map((s) => [s.id, s])) });
  const { data: classes } = await supabase.from("classes").select("id, name, sort_order").order("sort_order");
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Fees" }, { label: "Receipts" }]}
        icon={<Receipt />}
        title="Receipts"
        description="Every receipt, including cancelled ones (their numbers stay visible). Reprints are marked “Duplicate copy”."
        filters={<RangeForm from={from} to={to} />}
      />
      <ReceiptsTable rows={rows} canCancel={can(me, "fees.cancelReceipt")} classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))} rangeLabel={`${from}_to_${to}`} />
    </>
  );
}
