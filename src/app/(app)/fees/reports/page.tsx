import { BarChart3 } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { RangeForm } from "@/components/fees/range-form";
import { getReceipts, getStudentLookup } from "@/features/fees/queries";
import { todayIst } from "@/features/fees/shared";
import { ReportView } from "./view";

export const metadata = { title: "Fee reports" };

export default async function FeeReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  await requirePage("/fees/reports");
  const supabase = await createClient();
  const year = await resolveYear();
  const today = todayIst();
  const ok = (v?: string) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");
  const from = ok(sp.from) ? sp.from! : today;
  const to = ok(sp.to) ? sp.to! : from;
  const lookup = year ? await getStudentLookup(supabase, year.id) : [];
  const rows = await getReceipts(supabase, { from, to, lookup: new Map(lookup.map((s) => [s.id, s])) });
  const { data: classes } = await supabase.from("classes").select("id, name, sort_order").order("sort_order");
  const single = from === to;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Fees" }, { label: "Fee reports" }]}
        icon={<BarChart3 />}
        title={single ? "Daily collection report" : "Collection report"}
        description="Totals by payment mode and by fee head (special fees included). Cancelled receipts are listed but not counted."
        filters={<RangeForm from={from} to={to} />}
      />
      <ReportView rows={rows} from={from} to={to} single={single} classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
