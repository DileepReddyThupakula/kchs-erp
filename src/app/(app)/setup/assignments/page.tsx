import { ClipboardList } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { AssignmentsTable, type AssignmentRow } from "./assignments-table";

export const metadata = { title: "Teacher assignments" };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const me = await requireCapability("setup.view"); // Admin only: teachers use "My classes"
  const editable = can(me, "assignments.edit");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "School setup" }, { label: "Teacher assignments" }]}
      icon={<ClipboardList />}
      title={me.role === "teacher" ? "My classes & subjects" : "Teacher assignments"}
      description={me.role === "teacher" ? "The sections and subjects you teach." : "Which teacher teaches which subject in each section."}
      actions={<YearPicker years={years} value={year?.id} />}
    />
  );
  if (!year) {
    return (
      <>
        {header}
        <EmptyState title="No academic year yet">Create an academic year and its sections first.</EmptyState>
      </>
    );
  }

  const [{ data: classes }, { data: sections }, { data: subjects }, { data: links }, { data: staff }] = await Promise.all([
    supabase.from("classes").select("id, name, sort_order").order("sort_order"),
    supabase.from("sections").select("id, name, class_id, class_teacher_id").eq("academic_year_id", year.id),
    supabase.from("subjects").select("id, name, sort_order").order("sort_order"),
    supabase.from("class_subjects").select("class_id, subject_id").eq("academic_year_id", year.id),
    supabase.rpc("staff_directory"),
  ]);
  const sectionIds = (sections ?? []).map((s) => s.id);
  // RLS already limits teachers to the sections they teach (scope rule).
  const { data: assignments } = sectionIds.length
    ? await supabase.from("teacher_assignments").select("*").in("section_id", sectionIds)
    : { data: [] };

  const classById = new Map((classes ?? []).map((c) => [c.id, c]));
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s]));
  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s]));
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  const rows: AssignmentRow[] = (assignments ?? []).map((a) => {
    const sec = sectionById.get(a.section_id)!;
    const cls = classById.get(sec.class_id);
    return {
      id: a.id,
      sectionId: a.section_id,
      classId: sec.class_id,
      className: cls?.name ?? "—",
      classOrder: cls?.sort_order ?? 0,
      section: sec.name,
      subjectId: a.subject_id,
      subject: subjectById.get(a.subject_id)?.name ?? "—",
      subjectOrder: subjectById.get(a.subject_id)?.sort_order ?? 0,
      staffId: a.staff_id,
      teacher: staffName.get(a.staff_id) ?? "—",
      isClassTeacher: sec.class_teacher_id === a.staff_id,
      periods: a.periods_per_week,
      mine: a.staff_id === me.staffId,
    };
  });
  const orderedSections = [...(sections ?? [])].sort(
    (a, b) => (classById.get(a.class_id)?.sort_order ?? 0) - (classById.get(b.class_id)?.sort_order ?? 0) || a.name.localeCompare(b.name),
  );

  return (
    <>
      {header}
      <AssignmentsTable
        rows={rows}
        editable={editable}
        yearName={year.name}
        sections={orderedSections.map((s) => ({ id: s.id, label: `${classById.get(s.class_id)?.name} – ${s.name}`, classId: s.class_id }))}
        classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
        subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.name }))}
        classSubjects={links ?? []}
        teachers={(staff ?? []).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.full_name, designation: s.designation }))}
      />
    </>
  );
}
