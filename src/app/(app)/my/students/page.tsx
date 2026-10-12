import { GraduationCap } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getMyClasses } from "@/features/my/queries";
import { getSectionOptions, listStudents } from "@/features/students/queries";
import { StudentsTable } from "@/app/(app)/students/students-table";

export const metadata = { title: "My students" };

/** Every teacher: students of their own sections only (scope rule), basic fields. */
export default async function MyStudentsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
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
  const [rows, mine, allSections] = await Promise.all([listStudents(me, year.id, "mine"), getMyClasses(me, year.id), getSectionOptions(supabase, year.id)]);
  const myIds = new Set(mine.map((m) => m.sectionId));
  return (
    <>
      {header}
      <StudentsTable
        rows={rows}
        mode="mine"
        sections={allSections.filter((s) => myIds.has(s.id))}
        yearName={year.name}
        canEdit={can(me, "students.edit")}
        initialSection={section && myIds.has(section) ? section : undefined}
      />
    </>
  );
}
