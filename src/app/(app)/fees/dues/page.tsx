import { BadgeIndianRupee } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { getFeeHeads, getStudentLookup, toDueRow } from "@/features/fees/queries";
import { todayIst } from "@/features/fees/shared";
import { getSectionOptions } from "@/features/students/queries";
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

  const [{ all, special }, lookup, sections, dueRows] = await Promise.all([
    getFeeHeads(supabase),
    getStudentLookup(supabase, year.id),
    getSectionOptions(supabase, year.id),
    fetchAll((f, t) => supabase.from("student_fee_dues").select("*").eq("academic_year_id", year.id).is("voided_at", null).order("due_date").range(f, t)),
  ]);
  const heads = new Map(all.map((h) => [h.id, h]));
  const st = new Map(lookup.map((s) => [s.id, s]));
  const today = todayIst();
  const byStudent = new Map<string, StudentDues>();
  for (const d of dueRows.map((r) => toDueRow(r, heads, special))) {
    if (d.balance <= 0) continue;
    const s = st.get(d.studentId);
    if (!s) continue;
    const cur =
      byStudent.get(d.studentId) ??
      ({
        studentId: d.studentId,
        name: s.name,
        adm: s.adm,
        classId: s.classId,
        sectionId: s.sectionId,
        classLabel: s.classLabel,
        classOrder: sections.find((x) => x.id === s.sectionId)?.classOrder ?? 999,
        phone: s.phones[0] ?? null,
        outstanding: 0,
        overdue: 0,
        nextDue: null,
        dues: [],
      } satisfies StudentDues);
    cur.outstanding += d.balance;
    if (d.dueDate < today) cur.overdue += d.balance;
    if (!cur.nextDue || d.dueDate < cur.nextDue) cur.nextDue = d.dueDate;
    cur.dues.push({ id: d.id, headId: d.headId, headName: d.headName, isSpecial: d.isSpecial, label: d.label, dueDate: d.dueDate, balance: d.balance });
    byStudent.set(d.studentId, cur);
  }
  const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.className }])).values()];
  return (
    <>
      {header}
      <DuesTable
        rows={[...byStudent.values()]}
        today={today}
        yearName={year.name}
        classes={classes}
        sections={sections.map((s) => ({ id: s.id, label: s.label }))}
        heads={all.filter((h) => dueRows.some((d) => d.fee_head_id === h.id)).map((h) => ({ id: h.id, name: h.name, special: special.has(h.id) }))}
      />
    </>
  );
}
