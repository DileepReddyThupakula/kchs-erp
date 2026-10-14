import Link from "next/link";
import { CalendarClock, Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { YearPicker } from "@/components/ui/year-picker";
import { TimetableTabs } from "@/components/timetable/nav";
import { TeacherView } from "@/components/timetable/teacher-view";
import { getBellData, getEntries, getSectionsInfo, getSubjectNames, getTeachers, getWorkingDays } from "@/features/timetable/queries";

export const metadata = { title: "Teacher timetable" };

export default async function TeacherTimetablePage({ searchParams }: { searchParams: Promise<{ year?: string; teacher?: string }> }) {
  const sp = await searchParams;
  await requirePage("/timetable/teachers");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(sp.year)]);
  if (!year)
    return (
      <>
        <PageHeader breadcrumbs={[{ label: "Academics" }, { label: "Timetable" }]} icon={<CalendarClock />} title="Teacher timetable" />
        <EmptyState title="No academic year yet">Create an academic year first.</EmptyState>
      </>
    );
  const [bell, sections, entries, teachers, subjects, working] = await Promise.all([
    getBellData(supabase),
    getSectionsInfo(supabase, year.id),
    getEntries(supabase, year.id),
    getTeachers(supabase),
    getSubjectNames(supabase),
    getWorkingDays(supabase),
  ]);
  // teachers who have periods first, then the rest
  const withPeriods = new Set(entries.map((e) => e.teacherId).filter(Boolean) as string[]);
  const list = teachers.filter((t) => withPeriods.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));
  const teacher = list.find((t) => t.id === sp.teacher) ?? list[0];
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => working.includes(d));
  const sectionLabel = Object.fromEntries(sections.map((s) => [s.id, s.label]));
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Timetable" }]}
        icon={<CalendarClock />}
        title="Teacher timetable"
        description="A teacher's whole week across all classes (view only; change periods in the class timetable)."
        actions={
          <>
            <YearPicker years={years} value={year.id} />
            {teacher && <ParamSelect param="teacher" label="Teacher" value={teacher.id} options={list.map((t) => ({ value: t.id, label: t.name }))} />}
            {teacher && (
              <Link href={`/print/timetable/teacher/${teacher.id}?year=${year.id}`} target="_blank" className={buttonClasses("secondary")}>
                <Printer className="size-4" aria-hidden /> Print
              </Link>
            )}
          </>
        }
      />
      <TimetableTabs current="teachers" suffix={`year=${year.id}`} />
      {!teacher ? (
        <EmptyState title="No teacher has periods yet">Build a class timetable first.</EmptyState>
      ) : (
        <TeacherView
          teacherName={teacher.name}
          bell={bell}
          days={days}
          entries={entries.filter((e) => e.teacherId === teacher.id)}
          sectionLabel={sectionLabel}
          subjectNames={subjects}
        />
      )}
    </>
  );
}
