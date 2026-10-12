import { CalendarDays } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { YearsTable, type YearRow } from "./tables";

export const metadata = { title: "Academic years" };

export default async function AcademicYearsPage() {
  const me = await requireCapability("setup.view"); // Admin only: teachers use "My classes"
  const supabase = await createClient();
  const { data: years } = await supabase.from("academic_years").select("*, holidays(count)").order("start_date", { ascending: false });
  const rows: YearRow[] = (years ?? []).map(({ holidays, ...y }) => ({
    ...y,
    holidayCount: (holidays as unknown as { count: number }[])[0]?.count ?? 0,
  }));
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "School setup" }, { label: "Academic years" }]}
        icon={<CalendarDays />}
        title="Academic years & holidays"
        description="The current year is used by default across the ERP. Open a year to manage its holidays."
      />
      <YearsTable rows={rows} editable={can(me, "setup.edit")} />
    </>
  );
}
