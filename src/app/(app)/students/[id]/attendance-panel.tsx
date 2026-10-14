import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { getDailyRows } from "@/features/attendance/queries";
import { DAY_MARK, DAY_TEXT, monthLabel, monthRange, shiftMonth, type DayStatus } from "@/features/attendance/shared";
import { todayIst } from "@/features/fees/shared";

/** Month calendar + percentages. Only attendance the signed-in person may see is counted (scope rule, enforced by RLS). */
export async function StudentAttendancePanel({ studentId, month: monthParam }: { studentId: string; month?: string }) {
  const supabase = await createClient();
  const today = todayIst();
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : today.slice(0, 7);
  const { from, to, days } = monthRange(month);
  const year = await resolveYear();
  const [rows, { data: m }, { data: y }] = await Promise.all([
    getDailyRows(supabase, [studentId], from, to),
    supabase.rpc("attendance_summary", { p_student: studentId, p_from: from, p_to: to }),
    year ? supabase.rpc("attendance_summary", { p_student: studentId, p_from: year.start_date, p_to: today }) : Promise.resolve({ data: null }),
  ]);
  const byDay = new Map(rows.map((r) => [Number(r.date.slice(8, 10)), r]));
  const first = new Date(`${from}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7; // Monday-first grid
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const ms = m?.[0];
  const ys = y?.[0];
  const href = (mm: string) => `/students/${studentId}?tab=attendance&month=${mm}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-navy-900">{monthLabel(month)}</h2>
          <div className="flex gap-1">
            <Link href={href(shiftMonth(month, -1))} className={buttonClasses("secondary", "sm")} aria-label="Previous month">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <Link href={href(shiftMonth(month, 1))} className={buttonClasses("secondary", "sm")} aria-label="Next month">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1 font-semibold text-muted">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const r = byDay.get(d);
            const st = r?.day as DayStatus | undefined;
            const sunday = (i % 7) === 6;
            return (
              <div
                key={i}
                title={st ? DAY_TEXT[st] : sunday ? "Sunday" : "Not marked"}
                className={`min-h-14 rounded-lg border px-1 py-1 ${st === "absent" ? "border-red-300 bg-red-50" : st === "present" ? "border-peacock-200 bg-peacock-50" : st ? "border-amber-300 bg-amber-50" : "border-border bg-surface"} ${sunday ? "opacity-60" : ""}`}
              >
                <span className="block text-[11px] text-muted">{d}</span>
                <span className="block text-sm font-bold text-navy-900">{st ? DAY_MARK[st] : sunday ? "" : "–"}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">P present both sessions · A absent both · ½M morning only · ½A afternoon only · ? one session marked · – not marked.</p>
        {rows.length === 0 && <p className="mt-2 text-sm text-muted">No attendance is recorded for this month, or none that you are allowed to see.</p>}
      </Card>
      <div className="space-y-4">
        <Card>
          <h3 className="mb-2 font-semibold text-navy-900">{monthLabel(month)}</h3>
          <Figures s={ms} />
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold text-navy-900">Year to date</h3>
          <Figures s={ys} />
        </Card>
      </div>
    </div>
  );
}

function Figures({ s }: { s: { sessions_marked: number; sessions_attended: number; pct: number | null; full_days: number; half_days: number; absent_days: number } | undefined }) {
  if (!s || s.sessions_marked === 0) return <p className="text-sm text-muted">Nothing marked yet.</p>;
  return (
    <>
      <p className="text-3xl font-semibold tabular-nums text-navy-900">{s.pct?.toFixed(1)}%</p>
      <p className="text-xs text-muted">
        {s.sessions_attended} of {s.sessions_marked} sessions attended
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <dt className="text-xs text-muted">Full days</dt>
          <dd className="font-semibold tabular-nums">{s.full_days}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Half days</dt>
          <dd className="font-semibold tabular-nums">{s.half_days}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Absent days</dt>
          <dd className="font-semibold tabular-nums">{s.absent_days}</dd>
        </div>
      </dl>
    </>
  );
}
