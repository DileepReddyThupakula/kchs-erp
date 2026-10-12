import { BookOpen } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { YearPicker } from "@/components/ui/year-picker";
import { ClassSubjectsTable, SubjectsTable, type ClassLinkRow, type SubjectRow } from "./tables";

export const metadata = { title: "Subjects" };

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ year?: string; tab?: string }> }) {
  const { year: yearParam, tab = "subjects" } = await searchParams;
  const me = await requireCapability("setup.view"); // Admin only: teachers use "My classes"
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  const [{ data: subjects }, { data: classes }, { data: links }] = await Promise.all([
    supabase.from("subjects").select("*").order("sort_order"),
    supabase.from("classes").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    year ? supabase.from("class_subjects").select("*").eq("academic_year_id", year.id) : Promise.resolve({ data: [] }),
  ]);

  const subjectRows: SubjectRow[] = (subjects ?? []).map((s) => ({
    ...s,
    classCount: (links ?? []).filter((l) => l.subject_id === s.id).length,
  }));
  const byId = new Map((subjects ?? []).map((s) => [s.id, s]));
  const classRows: ClassLinkRow[] = (classes ?? []).map((c) => {
    const own = (links ?? []).filter((l) => l.class_id === c.id);
    return {
      id: c.id,
      name: c.name,
      order: c.sort_order,
      links: own.map((l) => ({ subject_id: l.subject_id, is_optional: l.is_optional })),
      scholastic: own.filter((l) => byId.get(l.subject_id)?.type === "scholastic").map((l) => byId.get(l.subject_id)!.name),
      coScholastic: own.filter((l) => byId.get(l.subject_id)?.type === "co_scholastic").map((l) => byId.get(l.subject_id)!.name),
    };
  });
  const q = (t: string) => `/setup/subjects?tab=${t}${year ? `&year=${year.id}` : ""}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "School setup" }, { label: "Subjects" }]}
        icon={<BookOpen />}
        title="Subjects"
        description="Subjects and co-scholastic areas, and which classes study them."
        actions={<YearPicker years={years} value={year?.id} />}
      />
      <LinkTabs
        current={tab}
        tabs={[
          { id: "subjects", label: "All subjects", href: q("subjects"), count: subjectRows.length },
          { id: "classes", label: `By class${year ? ` (${year.name})` : ""}`, href: q("classes") },
        ]}
      />
      {tab === "classes" ? (
        year ? (
          <ClassSubjectsTable rows={classRows} editable={editable} yearId={year.id} subjects={(subjects ?? []).filter((s) => s.is_active)} />
        ) : (
          <EmptyState title="No academic year yet">Create an academic year first, then link subjects to classes.</EmptyState>
        )
      ) : (
        <SubjectsTable rows={subjectRows} editable={editable} />
      )}
    </>
  );
}
