import { School } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, getSchoolSettings, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { YearPicker } from "@/components/ui/year-picker";
import { ClassesTable, SectionsTable, type ClassRow, type SectionRow } from "./tables";

export const metadata = { title: "Classes & sections" };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ year?: string; tab?: string }> }) {
  const { year: yearParam, tab = "sections" } = await searchParams;
  const me = await requireCapability("setup.view"); // Admin only: teachers use "My classes"
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const [years, year, settings] = await Promise.all([getAcademicYears(), resolveYear(yearParam), getSchoolSettings()]);

  const [{ data: classes }, { data: sections }, { data: staff }] = await Promise.all([
    supabase.from("classes").select("*").order("sort_order"),
    year ? supabase.from("sections").select("*").eq("academic_year_id", year.id) : Promise.resolve({ data: [] }),
    supabase.rpc("staff_directory"),
  ]);
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const classById = new Map((classes ?? []).map((c) => [c.id, c]));

  const sectionRows: SectionRow[] = (sections ?? []).map((s) => ({
    ...s,
    className: classById.get(s.class_id)?.name ?? "—",
    classOrder: classById.get(s.class_id)?.sort_order ?? 0,
    classTeacher: s.class_teacher_id ? (staffName.get(s.class_teacher_id) ?? null) : null,
    students: null, // filled in by the Students module
  }));
  const classRows: ClassRow[] = (classes ?? []).map((c) => ({
    ...c,
    sectionCount: (sections ?? []).filter((s) => s.class_id === c.id).length,
  }));
  const q = (t: string) => `/setup/classes?tab=${t}${year ? `&year=${year.id}` : ""}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "School setup" }, { label: "Classes & sections" }]}
        icon={<School />}
        title="Classes & sections"
        description="Classes stay the same every year; sections belong to one academic year."
        actions={<YearPicker years={years} value={year?.id} />}
      />
      <LinkTabs
        current={tab}
        tabs={[
          { id: "sections", label: `Sections${year ? ` ${year.name}` : ""}`, href: q("sections"), count: sectionRows.length },
          { id: "classes", label: "Classes", href: q("classes"), count: classRows.length },
        ]}
      />
      {tab === "classes" ? (
        <ClassesTable rows={classRows} editable={editable} />
      ) : !year ? (
        <EmptyState title="No academic year yet">Create an academic year first (School setup → Academic years), then add sections.</EmptyState>
      ) : (
        <SectionsTable
          rows={sectionRows}
          editable={editable}
          yearId={year.id}
          yearName={year.name}
          classes={(classes ?? []).filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))}
          mediums={settings?.mediums ?? []}
          teachers={(staff ?? []).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.full_name }))}
        />
      )}
    </>
  );
}
