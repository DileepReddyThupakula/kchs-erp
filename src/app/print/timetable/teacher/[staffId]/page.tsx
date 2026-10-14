import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import type { GridCell } from "@/components/timetable/grid";
import { TimetablePrintSheet } from "@/components/timetable/print-sheet";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getBellData, getEntries, getSectionsInfo, getSubjectNames, getTeachers, getWorkingDays } from "@/features/timetable/queries";
import { slotsFor } from "@/features/timetable/shared";

export const metadata = { title: "Teacher timetable" };

/**
 * Printable weekly timetable of one teacher (A4 landscape). Editors may print
 * anyone's; every other teacher only their own (checked before any data loads).
 */
export default async function PrintTeacherTimetable({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<{ year?: string }> }) {
  const { staffId } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  if (!(can(me, "timetable.edit") || me.staffId === staffId)) redirect("/not-allowed");
  const supabase = await createClient();
  void (await getAcademicYears());
  const year = await resolveYear(sp.year);
  if (!year) redirect("/not-allowed");
  const [school, bell, sections, entries, subjects, working] = await Promise.all([
    getReceiptSchool(),
    getBellData(supabase),
    getSectionsInfo(supabase, year.id),
    getEntries(supabase, year.id),
    getSubjectNames(supabase),
    getWorkingDays(supabase),
  ]);
  let name = me.fullName;
  if (staffId !== me.staffId) {
    const t = (await getTeachers(supabase)).find((x) => x.id === staffId);
    if (!t) redirect("/not-allowed");
    name = t.name;
  }
  const label = Object.fromEntries(sections.map((s) => [s.id, s.label]));
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => working.includes(d));
  const cells: Record<string, GridCell> = {};
  for (const e of entries.filter((x) => x.teacherId === staffId)) {
    cells[`${e.weekday}|${e.periodNo}`] = { primary: label[e.sectionId] ?? "", secondary: e.subjectId ? (subjects[e.subjectId] ?? "") : (e.activity ?? "") };
  }
  return (
    <TimetablePrintSheet
      school={school}
      title="TEACHER TIMETABLE"
      subtitle={`${name} · Academic year ${year.name}`}
      refSlots={slotsFor(bell, null, days[0])}
      days={days}
      cells={cells}
      footer="Regular weekly pattern. Substitutions for particular dates are not shown."
    />
  );
}
