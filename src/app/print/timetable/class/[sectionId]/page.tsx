import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import type { GridCell } from "@/components/timetable/grid";
import { TimetablePrintSheet } from "@/components/timetable/print-sheet";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getBellData, getEntries, getSectionsInfo, getSubjectNames, getTeachers, getWorkingDays } from "@/features/timetable/queries";
import { slotsFor } from "@/features/timetable/shared";

export const metadata = { title: "Class timetable" };

/** Printable class timetable (A4 landscape). Editors only; permission is checked before data loads. */
export default async function PrintClassTimetable({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  await requireCapability("timetable.edit");
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year) redirect("/not-allowed");
  const [school, bell, sections, entries, teachers, subjects, working] = await Promise.all([
    getReceiptSchool(),
    getBellData(supabase),
    getSectionsInfo(supabase, year.id),
    getEntries(supabase, year.id),
    getTeachers(supabase),
    getSubjectNames(supabase),
    getWorkingDays(supabase),
  ]);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) redirect("/not-allowed");
  const names = Object.fromEntries(teachers.map((t) => [t.id, t.name]));
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => working.includes(d));
  const cells: Record<string, GridCell> = {};
  for (const e of entries.filter((x) => x.sectionId === sectionId)) {
    cells[`${e.weekday}|${e.periodNo}`] = e.subjectId
      ? { primary: subjects[e.subjectId] ?? "", secondary: names[e.teacherId ?? ""] ?? "" }
      : { primary: e.activity ?? "" };
  }
  return (
    <TimetablePrintSheet
      school={school}
      title="CLASS TIMETABLE"
      subtitle={`${section.label} · Academic year ${year.name}${section.classTeacherId ? ` · Class teacher: ${names[section.classTeacherId] ?? ""}` : ""}`}
      refSlots={slotsFor(bell, section.classId, days[0])}
      days={days}
      cells={cells}
    />
  );
}
