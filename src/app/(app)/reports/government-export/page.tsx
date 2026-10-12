import { ShieldCheck } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSectionOptions, listStudents } from "@/features/students/queries";
import { GovernmentExport } from "./client";

export const metadata = { title: "Government data export" };

/** Admin only (site-map). Full IDs only when Admin explicitly chooses; always logged. */
export default async function GovernmentExportPage() {
  const me = await requirePage("/reports/government-export");
  const year = await resolveYear();
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Reports" }, { label: "Government data export" }]}
      icon={<ShieldCheck />}
      title="Government data export"
      description="Student data in the UDISE+ / AP Child Info field order. ⚠ Check the column order against the current official format (DECISIONS.md V2)."
    />
  );
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Set up the current academic year first.</EmptyState></>);
  const supabase = await createClient();
  const [rows, sections] = await Promise.all([listStudents(me, year.id, "all"), getSectionOptions(supabase, year.id)]);
  return (
    <>
      {header}
      <GovernmentExport
        yearName={year.name}
        sections={sections}
        students={rows.map((r) => ({ id: r.id, sectionId: r.sectionId, classId: r.classId, status: r.status, missingGov: r.missingGov?.length ?? 0 }))}
      />
    </>
  );
}
