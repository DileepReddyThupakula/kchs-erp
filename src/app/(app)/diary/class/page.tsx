import Link from "next/link";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getSchoolSettings, resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { MonthPicker } from "@/components/attendance/month-picker";
import { ClassBoard } from "@/components/notices/class-board";
import { getBoard } from "@/features/notices/diary-workflow";
import { addDaysIso, fmtLong } from "@/features/notices/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Class diary" };

export default async function ClassDiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  await requirePage("/diary/class");
  const supabase = await createClient();
  const today = todayIst();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  const [sections, settings] = await Promise.all([getSectionsInfo(supabase, year.id), getSchoolSettings()]);
  const deadline = (settings?.diary_deadline ?? "15:30").slice(0, 5);
  const rows = await getBoard(supabase, sections, date, today, deadline);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MonthPicker kind="date" value={date} param="date" tab="board" base="/diary/class" />
        <span className="text-sm text-muted">
          {fmtLong(date)}
        </span>
        {date !== today && (
          <Link className="text-sm text-navy-700 underline" href="/diary/class">
            Today
          </Link>
        )}
        <Link className="text-sm text-navy-700 underline" href={`/diary/class?date=${addDaysIso(date, 1)}`}>
          Next day
        </Link>
      </div>
      <ClassBoard rows={rows} date={date} deadline={deadline} />
    </>
  );
}
