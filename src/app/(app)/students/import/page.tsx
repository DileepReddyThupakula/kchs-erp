import { FileSpreadsheet } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSectionOptions, getStudentConfig } from "@/features/students/queries";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  await requirePage("/students/import");
  const year = await resolveYear();
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Import" }]}
      icon={<FileSpreadsheet />}
      title="Import students from Excel"
      description="Nothing is saved until you have checked the preview. Re-importing the same file skips students already imported."
    />
  );
  if (!year) {
    return (
      <>
        {header}
        <EmptyState title="No academic year yet">Set up the current academic year first.</EmptyState>
      </>
    );
  }
  const supabase = await createClient();
  const [sections, { definitions }] = await Promise.all([getSectionOptions(supabase, year.id), getStudentConfig(supabase)]);
  return (
    <>
      {header}
      <ImportWizard yearName={year.name} sections={sections.map((s) => ({ className: s.className, section: s.section }))} definitions={definitions} />
    </>
  );
}
