import { notFound } from "next/navigation";
import { CalendarDays, RefreshCw } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader, StatusChip } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/action-form";
import { regenerateSecondSaturdays } from "@/features/setup/actions";
import { HolidaysTable } from "../tables";

export default async function AcademicYearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireCapability("setup.view"); // Admin only: teachers use "My classes"
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const [{ data: year }, { data: holidays }] = await Promise.all([
    supabase.from("academic_years").select("*").eq("id", id).maybeSingle(),
    supabase.from("holidays").select("*").eq("academic_year_id", id).order("date"),
  ]);
  if (!year) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "School setup" }, { label: "Academic years", href: "/setup/academic-years" }, { label: year.name }]}
        icon={<CalendarDays />}
        title={`Holidays ${year.name}`}
        description={`${formatDate(year.start_date)} – ${formatDate(year.end_date)}`}
        actions={
          <>
            {year.is_current && <StatusChip status="current" label="Current year" />}
            {editable && (
              <ConfirmButton
                action={regenerateSecondSaturdays}
                id={year.id}
                label="Add missing 2nd Saturdays"
                danger={false}
                icon={<RefreshCw className="size-4" />}
                doneText="2nd Saturdays checked."
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-navy-800 shadow-sm hover:border-navy-200 hover:bg-navy-50"
              />
            )}
          </>
        }
      />
      <HolidaysTable rows={holidays ?? []} editable={editable} year={year} />
    </>
  );
}
