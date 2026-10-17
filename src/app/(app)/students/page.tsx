import Link from "next/link";
import { GraduationCap, Plus, Upload } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { getSectionOptions, getStudentConfig, getStudentsPageClamped, studentsParamsFromUrl } from "@/features/students/queries";
import { StudentsTable } from "./students-table";

export const metadata = { title: "Students" };

/** Admin and teachers with the student_records duty (site-map /students). */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const me = await requirePage("/students");
  const year = await resolveYear();
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Students" }]}
      icon={<GraduationCap />}
      title="Students"
      description={year ? `All students. Class and roll number shown for ${year.name}.` : undefined}
      actions={
        <>
          <Link href="/students/import" className={buttonClasses("secondary")}>
            <Upload className="size-4" aria-hidden /> Import
          </Link>
          <Link href="/students/new" className={buttonClasses("primary")}>
            <Plus className="size-4" aria-hidden /> Add student
          </Link>
        </>
      }
    />
  );
  if (!year) {
    return (
      <>
        {header}
        <EmptyState title="No academic year yet">The Admin needs to set up the current academic year first.</EmptyState>
      </>
    );
  }
  const supabase = await createClient();
  const [{ rows, total }, sections, { definitions }] = await Promise.all([
    getStudentsPageClamped(year.id, studentsParamsFromUrl(sp, "all"), "all"),
    getSectionOptions(supabase, year.id),
    getStudentConfig(supabase),
  ]);
  return (
    <>
      {header}
      <StudentsTable rows={rows} total={total} mode="manage" sections={sections} definitions={definitions} yearName={year.name} canEdit={can(me, "students.edit")} canChangeStatus={can(me, "students.status")} />
    </>
  );
}
