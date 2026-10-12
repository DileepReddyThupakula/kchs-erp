import { BookOpen } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { DeleteButton } from "@/components/ui/action-form";
import { deleteSubject } from "@/features/setup/actions";
import { ClassSubjectsForm, SubjectForm } from "./forms";

export const metadata = { title: "Subjects" };

const TYPE_LABEL = { scholastic: "Scholastic", co_scholastic: "Co-scholastic" } as const;

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const me = await requireStaff();
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  const [{ data: subjects }, { data: classes }, { data: links }] = await Promise.all([
    supabase.from("subjects").select("*").order("type").order("sort_order"),
    supabase.from("classes").select("*").eq("is_active", true).order("sort_order"),
    year
      ? supabase.from("class_subjects").select("*").eq("academic_year_id", year.id).order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);
  const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const activeSubjects = (subjects ?? []).filter((s) => s.is_active);

  return (
    <>
      <PageHeader icon={<BookOpen />} title="Subjects" description="Subjects and co-scholastic areas, and which classes study them." actions={<YearPicker years={years} value={year?.id} />} />

      <h2 className="mb-2 font-semibold text-navy-900">All subjects</h2>
      {subjects?.length ? (
        <Table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Code</th>
              <th>Type</th>
              <th>Order</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">
                  {s.name} {!s.is_active && <Badge tone="warning">Inactive</Badge>}
                </td>
                <td>{s.code ?? "—"}</td>
                <td>{TYPE_LABEL[s.type as keyof typeof TYPE_LABEL]}</td>
                <td>{s.sort_order}</td>
                <td className="text-right">
                  {editable && (
                    <details className="text-left">
                      <summary className="cursor-pointer select-none text-sm font-medium text-navy-700 hover:underline">Edit</summary>
                      <div className="mt-2 w-[min(80vw,640px)] space-y-2">
                        <SubjectForm subject={s} />
                        <DeleteButton action={deleteSubject} id={s.id} confirmText={`Delete ${s.name}?`} />
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No subjects yet">{editable ? "Add subjects below, then tick which classes study them." : "The Admin hasn't added subjects yet."}</EmptyState>
      )}
      {editable && (
        <Card className="mt-3">
          <h3 className="mb-3 font-semibold text-navy-900">Add subject</h3>
          <SubjectForm />
        </Card>
      )}

      <h2 className="mb-2 mt-8 font-semibold text-navy-900">Subjects by class {year ? `(${year.name})` : ""}</h2>
      {!year ? (
        <EmptyState title="No academic year yet">Create an academic year first, then link subjects to classes.</EmptyState>
      ) : (
        <div className="space-y-3">
          {(classes ?? []).map((c) => {
            const own = (links ?? []).filter((l) => l.class_id === c.id);
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mr-2 font-semibold text-navy-900">{c.name}</h3>
                  {own.length === 0 && <span className="text-sm text-muted">No subjects linked</span>}
                  {own.map((l) => (
                    <Badge key={l.id} tone={l.is_optional ? "neutral" : "info"}>
                      {subjectName.get(l.subject_id)}
                      {l.is_optional ? " (optional)" : ""}
                    </Badge>
                  ))}
                </div>
                {editable && (
                  <details className="mt-3">
                    <summary className="cursor-pointer select-none text-sm font-medium text-navy-700 hover:underline">Change subjects for {c.name}</summary>
                    <ClassSubjectsForm
                      yearId={year.id}
                      classId={c.id}
                      subjects={activeSubjects}
                      linked={own.map((l) => ({ subject_id: l.subject_id, is_optional: l.is_optional }))}
                    />
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
