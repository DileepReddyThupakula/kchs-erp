import Link from "next/link";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { SubmitCards, MySubmissions } from "@/components/notices/submit-cards";
import { getMySubmissions, getSubmitCards } from "@/features/notices/diary-workflow";
import { getSubjectNameMap } from "@/features/notices/queries";
import { addDaysIso, fmtLong, FAR_AHEAD_DAYS } from "@/features/notices/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Submit diary" };

export default async function SubmitDiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/diary/submit");
  const supabase = await createClient();
  const today = todayIst();
  const max = addDaysIso(today, FAR_AHEAD_DAYS);
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const date = asked < today ? today : asked > max ? max : asked;
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;

  const [sections, subjects] = await Promise.all([getSectionsInfo(supabase, year.id), getSubjectNameMap(supabase)]);
  const [cards, mine] = await Promise.all([getSubmitCards(supabase, me, sections, subjects, date), getMySubmissions(supabase, me, sections, subjects, addDaysIso(today, -3), max)]);
  const chip = (d: string, label: string) => (
    <Link href={`/diary/submit?date=${d}`} className={`rounded-full border px-3 py-1 text-sm ${d === date ? "border-navy-700 bg-navy-700 text-white" : "border-border bg-surface hover:bg-navy-50"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {chip(today, "Today")}
        {chip(addDaysIso(today, 1), "Tomorrow")}
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-muted">
            Another date
            <input type="date" name="date" defaultValue={date} min={today} max={max} className="mt-0.5 block h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
          </label>
          <button className="h-9 rounded-lg border border-border bg-surface px-3 text-sm hover:bg-navy-50">Show</button>
        </form>
        <span className="pb-1.5 text-sm text-muted">{fmtLong(date)}</span>
      </div>
      {cards.length === 0 ? (
        <EmptyState title="Nothing to submit">You are not assigned to any subject or section yet. The Admin sets this under Staff → Assignments.</EmptyState>
      ) : (
        <SubmitCards key={date} date={date} cards={cards} />
      )}
      <MySubmissions rows={mine} />
    </>
  );
}
