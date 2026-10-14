import { CalendarClock } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { TimetableTabs } from "@/components/timetable/nav";
import { SubstitutionsPanel, type SubRow } from "@/components/timetable/substitutions-panel";
import { getBellData, getEntries, getSectionsInfo, getSubjectNames, getTeachers, getWorkingDays } from "@/features/timetable/queries";
import { fmtRange, slotsFor, teachingSlots, weekdayOf } from "@/features/timetable/shared";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Substitutions" };

export default async function SubstitutionsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  await requirePage("/timetable/substitutions");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIst();
  const supabase = await createClient();
  const year = await resolveYear();
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Academics" }, { label: "Timetable" }]}
      icon={<CalendarClock />}
      title="Substitutions"
      description="Cover the periods of an absent teacher. Only teachers who are free in that period are offered."
    />
  );
  if (!year) return <>{header}<EmptyState title="No academic year yet">Create an academic year first.</EmptyState></>;

  const weekday = weekdayOf(date);
  const [bell, sections, entries, teachers, subjects, working, { data: hol }, { data: subRows }] = await Promise.all([
    getBellData(supabase),
    getSectionsInfo(supabase, year.id),
    getEntries(supabase, year.id),
    getTeachers(supabase),
    getSubjectNames(supabase),
    getWorkingDays(supabase),
    supabase.from("holidays").select("name").eq("academic_year_id", year.id).eq("date", date).maybeSingle(),
    supabase.from("timetable_substitutions").select("id, period_no, section_id, original_teacher_id, substitute_teacher_id, reason, entered_by").eq("sub_date", date),
  ]);
  const day = Number(date.slice(8, 10));
  const secondSat = weekday === 6 && day >= 8 && day <= 14;
  const inYear = date >= year.start_date && date <= year.end_date;
  const isSchoolDay = working.includes(weekday) && !hol && !secondSat && inYear;
  const dayNote = hol ? hol.name : secondSat ? "2nd Saturday (holiday)" : !working.includes(weekday) ? "Not a working day" : !inYear ? "Outside the academic year" : null;

  const names = Object.fromEntries(teachers.map((t) => [t.id, t.name]));
  const labels = Object.fromEntries(sections.map((s) => [s.id, s.label]));
  const dayEntries = entries.filter((e) => e.weekday === weekday);
  const subs: SubRow[] = (subRows ?? [])
    .map((s) => {
      const e = dayEntries.find((x) => x.sectionId === s.section_id && x.periodNo === s.period_no);
      return {
        id: s.id,
        periodNo: s.period_no,
        sectionId: s.section_id,
        section: labels[s.section_id] ?? "—",
        subject: e?.subjectId ? (subjects[e.subjectId] ?? "") : (e?.activity ?? ""),
        original: names[s.original_teacher_id] ?? "—",
        substitute: names[s.substitute_teacher_id] ?? "—",
        reason: s.reason ?? "",
        enteredBy: s.entered_by ? (names[s.entered_by] ?? "—") : "—",
      };
    })
    .sort((a, b) => a.periodNo - b.periodNo || a.section.localeCompare(b.section));
  const times = Object.fromEntries(teachingSlots(slotsFor(bell, null, weekday)).map((s) => [s.periodNo!, fmtRange(s.start, s.end)]));

  return (
    <>
      {header}
      <TimetableTabs current="substitutions" />
      <SubstitutionsPanel
        date={date}
        weekday={weekday}
        isSchoolDay={isSchoolDay}
        dayNote={dayNote}
        entries={dayEntries}
        sectionLabels={labels}
        teacherNames={names}
        subjectNames={subjects}
        subs={subs}
        times={times}
      />
    </>
  );
}
