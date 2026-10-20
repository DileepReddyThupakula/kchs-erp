import { GraduationCap } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getStudentsPageClamped, studentsParamsFromUrl } from "@/features/students/queries";
import { StudentsTable } from "@/app/(app)/students/students-table";

export const metadata = { title: "My students" };

/** Every teacher: students of their own sections only (scope rule), basic fields. */
export default async function MyStudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const me = await requirePage("/my/students");
  const year = await resolveYear();
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "My work" }, { label: "My students" }]}
      icon={<GraduationCap />}
      title="My students"
      description={year ? `Students of the sections you teach in ${year.name}.` : undefined}
    />
  );
  if (!year) {
    return (
      <>
        {header}
        <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>
      </>
    );
  }
  const supabase = await createClient();
  // two calls, in parallel: the student list page and the caller's own sections for the filter
  const [{ rows, total }, { data: mine, error }] = await Promise.all([
    getStudentsPageClamped(year.id, studentsParamsFromUrl(sp, "mine"), "mine"),
    supabase.rpc("my_section_options", { p_year: year.id }),
  ]);
  if (error) throw error;
  const sections = ((mine ?? []) as unknown as { id: string; classId: string; className: string; classOrder: number; name: string; label: string }[]).map((s) => ({
    id: s.id, classId: s.classId, className: s.className, classOrder: s.classOrder, section: s.name, label: s.label,
  }));
  return (
    <>
      {header}
      <StudentsTable
        rows={rows}
        total={total}
        mode="mine"
        sections={sections}
        yearName={year.name}
        canEdit={can(me, "students.edit")}
      />
    </>
  );
}
