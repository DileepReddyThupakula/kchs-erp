import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fmtRange, mondayOf } from "@/features/timetable/shared";
import { todayIst } from "@/features/fees/shared";

/** "Today" strip on a teacher's dashboard: their own periods today, next one marked. */
export async function TodayStrip() {
  const supabase = await createClient();
  const today = todayIst();
  const { data } = await supabase.rpc("my_week", { p_week_start: mondayOf(today) });
  const rows = (data ?? []).filter((r) => r.on_date === today);
  const nowIst = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const nextIdx = rows.findIndex((r) => r.kind !== "substituted_out" && r.end_time && r.end_time.slice(0, 5) > nowIst);
  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <CalendarClock className="size-4 text-navy-500" aria-hidden /> Today
        </h2>
        <Link href="/my/timetable" className="inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
          My timetable <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No periods today (a holiday, or no timetable has been set for you yet).</p>
      ) : (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {rows.map((r, i) => {
            const isNext = i === nextIdx;
            return (
              <li
                key={`${r.period_no}-${r.section_id}-${r.kind}`}
                className={`min-w-40 shrink-0 rounded-lg border px-3 py-2 text-sm ${isNext ? "border-gold-400 bg-gold-50" : "border-border bg-surface"}`}
              >
                <p className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-semibold text-navy-900">P{r.period_no}</span>
                  <span className="tabular-nums">{r.start_time && r.end_time ? fmtRange(r.start_time, r.end_time) : ""}</span>
                </p>
                <p className={`font-medium text-navy-900 ${r.kind === "substituted_out" ? "line-through opacity-70" : ""}`}>{r.section_label}</p>
                <p className="text-xs text-muted">
                  {r.subject_name ?? r.activity ?? ""}
                  {r.kind === "substitute_in" && " · covering"}
                  {r.kind === "substituted_out" && " · relieved"}
                </p>
                {isNext && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gold-800">Next</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
