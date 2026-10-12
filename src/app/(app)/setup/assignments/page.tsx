import { ClipboardList } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { ConfirmButton } from "@/components/ui/action-form";
import { deleteAssignment } from "@/features/setup/actions";
import { AssignmentForm } from "./assignment-form";

export const metadata = { title: "Teacher assignments" };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const me = await requireStaff();
  const editable = can(me, "assignments.edit");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  if (!year) {
    return (
      <>
        <PageHeader icon={<ClipboardList />} title="Teacher assignments" />
        <EmptyState title="No academic year yet">Create an academic year and its sections first.</EmptyState>
      </>
    );
  }

  const [{ data: classes }, { data: sections }, { data: subjects }, { data: links }, { data: staff }] = await Promise.all([
    supabase.from("classes").select("id, name, sort_order").order("sort_order"),
    supabase.from("sections").select("id, name, class_id, class_teacher_id").eq("academic_year_id", year.id).order("name"),
    supabase.from("subjects").select("id, name, sort_order").order("sort_order"),
    supabase.from("class_subjects").select("class_id, subject_id").eq("academic_year_id", year.id),
    supabase.rpc("staff_directory"),
  ]);
  const sectionIds = (sections ?? []).map((s) => s.id);
  const { data: assignments } = sectionIds.length
    ? await supabase.from("teacher_assignments").select("*").in("section_id", sectionIds)
    : { data: [] };

  const className = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const classOrder = new Map((classes ?? []).map((c) => [c.id, c.sort_order]));
  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  const orderedSections = [...(sections ?? [])].sort(
    (a, b) => (classOrder.get(a.class_id) ?? 0) - (classOrder.get(b.class_id) ?? 0) || a.name.localeCompare(b.name),
  );
  // Teachers only see sections they teach (RLS returns only those assignments).
  const visibleSections =
    me.role === "teacher"
      ? orderedSections.filter((s) => s.class_teacher_id === me.staffId || assignments?.some((a) => a.section_id === s.id))
      : orderedSections;

  return (
    <>
      <PageHeader
        icon={<ClipboardList />}
        title="Teacher assignments"
        description={me.role === "teacher" ? "The sections and subjects you teach." : "Which teacher teaches which subject in each section."}
        actions={<YearPicker years={years} value={year.id} />}
      />
      {editable && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-navy-900">Assign a teacher</h2>
          <AssignmentForm
            sections={orderedSections.map((s) => ({ id: s.id, label: `${className.get(s.class_id)} – ${s.name}`, class_id: s.class_id }))}
            classSubjects={links ?? []}
            subjects={subjects ?? []}
            teachers={(staff ?? []).filter((s) => s.status === "active")}
          />
        </Card>
      )}
      {visibleSections.length === 0 && (
        <EmptyState title={`No sections for ${year.name}`}>
          {me.role === "teacher" ? "You haven't been assigned to any section yet. The Admin can assign you." : "Add sections in Setup → Classes & sections first."}
        </EmptyState>
      )}
      <div className="space-y-4">
        {visibleSections.map((s) => {
          const rows = (assignments ?? [])
            .filter((a) => a.section_id === s.id)
            .sort((a, b) => (subjectName.get(a.subject_id) ?? "").localeCompare(subjectName.get(b.subject_id) ?? ""));
          return (
            <div key={s.id}>
              <h2 className="mb-2 font-semibold text-navy-900">
                {className.get(s.class_id)} – {s.name}
                <span className="ml-2 text-sm font-normal text-muted">
                  Class teacher: {s.class_teacher_id ? staffName.get(s.class_teacher_id) : "not set"}
                </span>
              </h2>
              {rows.length ? (
                <Table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Teacher</th>
                      <th>Periods / week</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>{subjectName.get(a.subject_id)}</td>
                        <td>
                          {staffName.get(a.staff_id)} {a.staff_id === me.staffId && <Badge tone="gold">You</Badge>}
                        </td>
                        <td>{a.periods_per_week ?? "—"}</td>
                        <td className="text-right">
                          {editable && <ConfirmButton action={deleteAssignment} id={a.id} label="Remove" doneText="Assignment removed." confirmText="Remove this assignment?" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState>No subjects assigned yet.{editable ? " Use the form above to assign a teacher." : ""}</EmptyState>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
