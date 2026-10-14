import { CalendarClock } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { TimetableTabs } from "@/components/timetable/nav";
import { BellEditor } from "@/components/timetable/bell-editor";
import { getBellData, getWorkingDays } from "@/features/timetable/queries";

export const metadata = { title: "Bell schedule" };

export default async function BellSchedulePage({ searchParams }: { searchParams: Promise<{ schedule?: string }> }) {
  const sp = await searchParams;
  await requirePage("/timetable/bell-schedule");
  const supabase = await createClient();
  const [bell, working, { data: classes }] = await Promise.all([
    getBellData(supabase),
    getWorkingDays(supabase),
    supabase.from("classes").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
  ]);
  const selected = bell.schedules.find((s) => s.id === sp.schedule)?.id ?? bell.defaultId ?? bell.schedules[0]?.id ?? "";
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Timetable" }]}
        icon={<CalendarClock />}
        title="Bell schedule"
        description="Period times, breaks and lunch. These are starting values, so check them against the real school timings."
      />
      <TimetableTabs current="bell" />
      <BellEditor bell={bell} classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))} days={[1, 2, 3, 4, 5, 6, 7].filter((d) => working.includes(d))} selectedId={selected} />
    </>
  );
}
