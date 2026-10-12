import { School } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, getSchoolSettings, resolveYear } from "@/lib/settings";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { YearPicker } from "@/components/ui/year-picker";
import { DeleteButton } from "@/components/ui/action-form";
import { deleteClass, deleteSection } from "@/features/setup/actions";
import { ClassForm, SectionForm } from "./forms";

export const metadata = { title: "Classes & sections" };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const me = await requireStaff();
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const [years, year, settings] = await Promise.all([getAcademicYears(), resolveYear(yearParam), getSchoolSettings()]);

  const [{ data: classes }, { data: sections }, { data: staff }] = await Promise.all([
    supabase.from("classes").select("*").order("sort_order"),
    year
      ? supabase.from("sections").select("*").eq("academic_year_id", year.id).order("name")
      : Promise.resolve({ data: [] }),
    supabase.rpc("staff_directory"),
  ]);
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const teachers = (staff ?? []).filter((s) => s.status === "active");
  const mediums = settings?.mediums ?? [];

  return (
    <>
      <PageHeader
        icon={<School />}
        title="Classes & sections"
        description="Classes stay the same every year; sections belong to one academic year."
        actions={<YearPicker years={years} value={year?.id} />}
      />
      {!year && <EmptyState title="No academic year yet">Create an academic year first (Setup → Academic years), then add sections here.</EmptyState>}

      <div className="space-y-3">
        {(classes ?? []).map((c) => {
          const own = (sections ?? []).filter((s) => s.class_id === c.id);
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-navy-900">{c.name}</h2>
                  {!c.is_active && <Badge tone="warning">Inactive</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {own.length === 0 && <span className="text-sm text-muted">No sections in {year?.name ?? "this year"}</span>}
                  {own.map((s) => (
                    <Badge key={s.id} tone="info">
                      {s.name}
                      {s.medium ? ` · ${s.medium}` : " · medium not set"}
                      {s.class_teacher_id ? ` · ${staffName.get(s.class_teacher_id) ?? ""}` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
              {editable && (
                <details className="mt-3">
                  <summary className="cursor-pointer select-none text-sm font-medium text-navy-700 hover:underline">Edit class & sections</summary>
                  <div className="mt-3 space-y-4">
                    <ClassForm cls={c} />
                    <DeleteButton action={deleteClass} id={c.id} label="Delete class" confirmText={`Delete ${c.name}?`} />
                    {own.map((s) => (
                      <div key={s.id} className="rounded-lg border border-border bg-cream-50/50 p-3">
                        <p className="mb-2 text-sm font-medium">Section {s.name}</p>
                        <SectionForm yearId={year!.id} classId={c.id} section={s} mediums={mediums} teachers={teachers} />
                        <div className="mt-2">
                          <DeleteButton action={deleteSection} id={s.id} label="Delete section" confirmText={`Delete section ${c.name} ${s.name}?`} />
                        </div>
                      </div>
                    ))}
                    {year && (
                      <div className="rounded-lg border border-dashed border-cream-400 p-3">
                        <p className="mb-2 text-sm font-medium">Add section to {c.name}</p>
                        <SectionForm yearId={year.id} classId={c.id} mediums={mediums} teachers={teachers} />
                      </div>
                    )}
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>

      {editable && (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-navy-900">Add class</h2>
          <ClassForm />
        </Card>
      )}
    </>
  );
}
