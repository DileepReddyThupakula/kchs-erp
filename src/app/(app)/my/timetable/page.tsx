import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { TimetableGrid, type GridCell } from "@/components/timetable/grid";
import { getBellData, getWorkingDays } from "@/features/timetable/queries";
import { addDays, fmtRange, mondayOf, slotsFor } from "@/features/timetable/shared";
import { todayIst } from "@/features/fees/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My timetable" };

export default async function MyTimetablePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/my/timetable");
  const supabase = await createClient();
  const today = todayIst();
  const week = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today);
  const year = await resolveYear();
  const [bell, working, { data: rows }, { data: hols }] = await Promise.all([
    getBellData(supabase),
    getWorkingDays(supabase),
    supabase.rpc("my_week", { p_week_start: week }),
    year
      ? supabase.from("holidays").select("date, name").eq("academic_year_id", year.id).gte("date", week).lte("date", addDays(week, 6))
      : Promise.resolve({ data: [] as { date: string; name: string }[] }),
  ]);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => working.includes(d));
  const refSlots = slotsFor(bell, null, days[0]);
  const refTime = new Map(refSlots.filter((s) => s.periodNo).map((s) => [s.periodNo!, fmtRange(s.start, s.end)]));

  const cells: Record<string, GridCell> = {};
  for (const r of rows ?? []) {
    const own = r.start_time && r.end_time ? fmtRange(r.start_time, r.end_time) : undefined;
    const time = own && own !== refTime.get(r.period_no) ? own : undefined;
    const what = r.subject_name ?? r.activity ?? "";
    cells[`${r.weekday}|${r.period_no}`] =
      r.kind === "substituted_out"
        ? { tag: "Relieved", primary: r.section_label, secondary: `${what} · covered by ${r.other_name ?? "a colleague"}`, strike: true, time }
        : r.kind === "substitute_in"
          ? { tag: "Covering", primary: r.section_label, secondary: `${what}${r.other_name ? ` · for ${r.other_name}` : ""}`, time }
          : { primary: r.section_label, secondary: `${what}${r.room ? ` · ${r.room}` : ""}`, time };
  }
  const dayNote: Record<number, string> = {};
  for (const h of hols ?? []) dayNote[days.find((d) => addDays(week, d - 1) === h.date) ?? 0] = `Holiday: ${h.name}`;
  const isThisWeek = week === mondayOf(today);
  const todayWd = isThisWeek ? days.find((d) => addDays(week, d - 1) === today) : undefined;
  const total = (rows ?? []).filter((r) => r.kind !== "substituted_out").length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My work" }, { label: "My timetable" }]}
        icon={<CalendarClock />}
        title="My timetable"
        description="Your own periods for the week. Periods you cover for a colleague are marked Covering."
        actions={
          <Link href={`/print/timetable/teacher/${me.staffId}`} target="_blank" className={buttonClasses("secondary")}>
            <Printer className="size-4" aria-hidden /> Print
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/my/timetable?week=${addDays(week, -7)}`} className={buttonClasses("secondary", "sm")} aria-label="Previous week">
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Link>
        <span className="text-sm font-medium text-navy-900">
          {formatDate(week)} – {formatDate(addDays(week, days[days.length - 1] - 1))}
        </span>
        <Link href={`/my/timetable?week=${addDays(week, 7)}`} className={buttonClasses("secondary", "sm")} aria-label="Next week">
          Next <ChevronRight className="size-4" aria-hidden />
        </Link>
        {!isThisWeek && (
          <Link href="/my/timetable" className={buttonClasses("ghost", "sm")}>
            This week
          </Link>
        )}
        <Card className="ml-auto px-3 py-1.5 text-sm">
          <span className="text-muted">Periods this week </span>
          <span className="font-semibold tabular-nums text-navy-900">{total}</span>
        </Card>
      </div>
      {total === 0 && (rows ?? []).length === 0 ? (
        <EmptyState title="No periods yet">Your timetable has not been set up yet. The Admin sets the class timetables.</EmptyState>
      ) : (
        <TimetableGrid refSlots={refSlots} days={days} cells={cells} todayWeekday={todayWd} emptyLabel="Free" dayNote={dayNote} />
      )}
    </>
  );
}
