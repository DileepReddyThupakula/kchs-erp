import { Percent } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { getFeeHeads, getStudentLookup } from "@/features/fees/queries";
import { ConcessionsTable, type ConcessionRow } from "./table";

export const metadata = { title: "Concessions" };

export default async function ConcessionsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  await requirePage("/fees/concessions");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Fees" }, { label: "Concessions" }]}
      icon={<Percent />}
      title="Concessions"
      description="Fixed or percentage discounts for a student, for all fee heads or one. Applied to unpaid dues; always with a reason."
      actions={<YearPicker years={years} value={year?.id} />}
    />
  );
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Create an academic year first.</EmptyState></>);

  const [rows, lookup, { all }] = await Promise.all([
    fetchAll((f, t) => supabase.from("fee_concessions").select("*").eq("academic_year_id", year.id).order("created_at", { ascending: false }).range(f, t)),
    getStudentLookup(supabase, year.id),
    getFeeHeads(supabase),
  ]);
  const st = new Map(lookup.map((s) => [s.id, s]));
  const head = new Map(all.map((h) => [h.id, h.name]));
  const data: ConcessionRow[] = rows.map((c) => ({
    id: c.id,
    studentId: c.student_id,
    studentName: st.get(c.student_id)?.name ?? "—",
    adm: st.get(c.student_id)?.adm ?? "",
    classLabel: st.get(c.student_id)?.classLabel ?? "",
    headId: c.fee_head_id,
    headName: c.fee_head_id ? (head.get(c.fee_head_id) ?? "—") : "All fee heads",
    kind: c.kind,
    amount: c.amount_paise === null ? null : Number(c.amount_paise),
    percentBp: c.percent_bp,
    reason: c.reason,
    createdAt: c.created_at,
  }));
  return (
    <>
      {header}
      <ConcessionsTable
        rows={data}
        yearId={year.id}
        yearName={year.name}
        heads={all.filter((h) => h.is_active).map((h) => ({ id: h.id, name: h.name }))}
        students={lookup.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name, adm: s.adm, classLabel: s.classLabel, phones: s.phones }))}
      />
    </>
  );
}
