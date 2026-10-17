import { CalendarClock } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { AlsoSee } from "@/components/reports/page-parts";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "My timetable and duties" };
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Load = { periods_per_week: number; by_weekday: Record<string, number>; sections: number; substitutions_this_month: number; leave: { type: string; days: number }[] };

/** The signed-in person's own load, nothing about anyone else (and no comparison with other teachers). */
export default async function MyLoad() {
  const me = await requirePage("/reports/my-load");
  const year = await resolveYear();
  const header = <PageHeader breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "My work" }]} icon={<CalendarClock />} title="My timetable and duties" description="Your own periods, sections, substitutions and leave. Only you see this page." />;
  if (!year) return <>{header}<EmptyState title="No academic year yet">The Admin has not set up the academic year.</EmptyState></>;
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_my_load", { p_year: year.id, p_today: todayIst() });
  const d = (data ?? { periods_per_week: 0, by_weekday: {}, sections: 0, substitutions_this_month: 0, leave: [] }) as unknown as Load;
  const tile = (label: string, value: number | string) => (
    <Card>
      <p className="text-2xl font-semibold tabular-nums text-navy-900">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </Card>
  );
  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile("Periods a week", d.periods_per_week)}
        {tile("Sections you teach", d.sections)}
        {tile("Substitutions this month", d.substitutions_this_month)}
        {tile("Your duties", me.duties.length)}
      </div>
      <Card className="mt-4">
        <h2 className="mb-2 font-semibold text-navy-900">Periods by day</h2>
        <ul className="flex flex-wrap gap-4 text-sm">
          {DAYS.slice(1, 7).map((n, i) => (
            <li key={n}>
              <span className="text-muted">{n}: </span>
              <b className="tabular-nums">{d.by_weekday[String(i + 1)] ?? 0}</b>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-4">
        <h2 className="mb-2 font-semibold text-navy-900">Leave taken this year</h2>
        {d.leave.length ? (
          <ul className="text-sm">
            {d.leave.map((l) => (
              <li key={l.type}>
                {l.type}: <b className="tabular-nums">{l.days}</b> day(s)
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No leave taken yet this year.</p>
        )}
      </Card>
      <AlsoSee links={[{ href: "/my/timetable", label: "My timetable" }, { href: "/my/leave", label: "My leave" }]} />
    </>
  );
}
