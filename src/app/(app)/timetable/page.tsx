import { CalendarClock } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { YearPicker } from "@/components/ui/year-picker";
import { TimetableTabs } from "@/components/timetable/nav";
import { ClassEditor } from "@/components/timetable/class-editor";
import { getAssignments, getBellData, getEntries, getSectionsInfo, getSubjectNames, getTeachers, getWorkingDays } from "@/features/timetable/queries";

export const metadata = { title: "Class timetable" };

export default async function ClassTimetablePage({ searchParams }: { searchParams: Promise<{ year?: string; section?: string }> }) {
  const sp = await searchParams;
  await requirePage("/timetable");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(sp.year)]);
  const header = (extra?: React.ReactNode) => (
    <PageHeader
      breadcrumbs={[{ label: "Academics" }, { label: "Timetable" }]}
      icon={<CalendarClock />}
      title="Class timetable"
      description="Set the weekly periods of a section. Only teachers assigned to a subject in that section can be chosen, and a teacher can't be in two places at once."
      actions={
        <>
          <YearPicker years={years} value={year?.id} />
          {extra}
        </>
      }
    />
  );
  if (!year) return <>{header()}<EmptyState title="No academic year yet">Create an academic year first.</EmptyState></>;

  const [bell, sections, entries, assignments, teachers, subjects, working] = await Promise.all([
    getBellData(supabase),
    getSectionsInfo(supabase, year.id),
    getEntries(supabase, year.id),
    getAssignments(supabase),
    getTeachers(supabase),
    getSubjectNames(supabase),
    getWorkingDays(supabase),
  ]);
  if (!sections.length) return <>{header()}<TimetableTabs current="class" /><EmptyState title="No sections yet">Add classes and sections under School setup.</EmptyState></>;
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const teacherNames = Object.fromEntries(teachers.map((t) => [t.id, t.name]));
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => working.includes(d));
  const editorAssignments = assignments
    .filter((a) => a.sectionId === section.id)
    .map((a) => ({ id: a.id, subjectId: a.subjectId, subjectName: subjects[a.subjectId] ?? "Subject", staffId: a.staffId, staffName: teacherNames[a.staffId] ?? "Teacher", target: a.target }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  return (
    <>
      {header(
        <ParamSelect
          param="section"
          label="Section"
          value={section.id}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
        />,
      )}
      <TimetableTabs current="class" suffix={`year=${year.id}`} />
      <ClassEditor
        section={{ id: section.id, classId: section.classId, label: section.label }}
        sectionLabels={Object.fromEntries(sections.map((s) => [s.id, s.label]))}
        bell={bell}
        days={days}
        entries={entries.filter((e) => e.sectionId === section.id)}
        otherEntries={entries.filter((e) => e.sectionId !== section.id)}
        assignments={editorAssignments}
        teacherNames={teacherNames}
        subjectNames={subjects}
      />
    </>
  );
}
