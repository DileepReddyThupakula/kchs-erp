import { CalendarDays } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { HolidaysTable } from "@/app/(app)/setup/academic-years/tables";

export const metadata = { title: "Holiday list" };

/** Read-only holiday list (everyone may view; only Admin edits under School setup). */
export default async function HolidayListPage() {
  await requireStaff();
  const year = await resolveYear();
  const supabase = await createClient();
  const { data: holidays } = year ? await supabase.from("holidays").select("*").eq("academic_year_id", year.id).order("date") : { data: [] };
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My work" }, { label: "Holiday list" }]}
        icon={<CalendarDays />}
        title="Holiday list"
        description={year ? `${year.name} · ${formatDate(year.start_date)} – ${formatDate(year.end_date)}` : undefined}
      />
      {year ? <HolidaysTable rows={holidays ?? []} editable={false} year={year} /> : <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>}
    </>
  );
}
