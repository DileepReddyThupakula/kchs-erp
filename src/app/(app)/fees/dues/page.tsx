import { BadgeIndianRupee } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { todayIst } from "@/features/fees/shared";
import { DuesTable, type StudentDues } from "./table";

export const metadata = { title: "Dues" };

export default async function DuesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  await requirePage("/fees/dues");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Fees" }, { label: "Dues" }]}
      icon={<BadgeIndianRupee />}
      title="Dues"
      description="Students with fees still to pay. Open a student to see the dues and collect."
      actions={<YearPicker years={years} value={year?.id} />}
    />
  );
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Create an academic year first.</EmptyState></>);

  // ONE database call: the students who owe, their unpaid lines, the classes, sections and fee heads (same rules as before: fee access only)
  const { data } = await supabase.rpc("fees_dues_page", { p_year: year.id, p_today: todayIst() });
  const page = (data as unknown as { students: StudentDues[]; classes: { id: string; name: string }[]; sections: { id: string; label: string }[]; heads: { id: string; name: string; special: boolean }[] } | null) ?? { students: [], classes: [], sections: [], heads: [] };
  const today = todayIst();
  return (
    <>
      {header}
      <DuesTable rows={page.students} today={today} yearName={year.name} classes={page.classes} sections={page.sections} heads={page.heads} />
    </>
  );
}
