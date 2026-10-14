import Link from "next/link";
import { CalendarCheck, CalendarOff, CheckCircle2, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import type { CurrentStaff } from "@/lib/auth/session";
import { SESSION_LABEL, type SessionName } from "@/features/attendance/shared";
import { todayIst } from "@/features/fees/shared";

/**
 * Dashboard cards for attendance.
 *   Admin / attendance duty: sessions not yet marked today (+ leave waiting for Admin).
 *   Teacher: the sessions assigned to them that are still waiting.
 */
export async function AttendanceDashboard({ me }: { me: CurrentStaff }) {
  const supabase = await createClient();
  const today = todayIst();
  const isAny = me.role === "admin" || me.duties.includes("all_class_attendance");
  const link = (sectionId: string, session: string) => `/attendance?section=${sectionId}&session=${session}&date=${today}`;

  const { data: mine } = await supabase.rpc("my_attendance_sessions", { p_date: today });
  const waiting = (mine ?? []).filter((m) => !m.marked);

  const cards: React.ReactNode[] = [];
  if (isAny) {
    const { data: un } = await supabase.rpc("unmarked_sessions", { p_date: today });
    const list = un ?? [];
    let pending = 0;
    if (me.role === "admin") {
      const { count } = await supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
      pending = count ?? 0;
    }
    cards.push(
      <Card key="unmarked">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <CalendarCheck className="size-4 text-navy-500" aria-hidden /> Attendance not yet marked
          </h2>
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-peacock-700">
            <CheckCircle2 className="size-4" aria-hidden /> Everything for today is marked (or it is not a school day).
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {list.slice(0, 6).map((u) => (
              <li key={`${u.section_id}-${u.session}`}>
                <Link href={link(u.section_id, u.session)} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                  <span className="flex-1">
                    <span className="font-medium">{u.section_label}</span>
                    <span className="ml-2 text-xs text-muted">{SESSION_LABEL[u.session as SessionName]}</span>
                  </span>
                  <span className="text-xs text-muted">{u.staff_name ?? "nobody assigned"}</span>
                  <ChevronRight className="size-4 text-navy-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/attendance" className="font-medium text-navy-700 hover:underline">
            Open Attendance{list.length > 6 ? ` (${list.length - 6} more)` : ""}
          </Link>
          <Link href="/attendance/reports" className="font-medium text-navy-700 hover:underline">
            Reports
          </Link>
        </div>
      </Card>,
    );
    if (me.role === "admin") {
      cards.push(
        <Card key="leave">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
            <CalendarOff className="size-4 text-navy-500" aria-hidden /> Leave waiting for approval
          </h2>
          <p className="text-3xl font-semibold tabular-nums text-navy-900">{pending}</p>
          <Link href="/staff/leave" className="text-sm font-medium text-navy-700 hover:underline">
            Review requests
          </Link>
        </Card>,
      );
    }
  }
  if (me.role === "teacher" && (mine ?? []).length > 0) {
    cards.push(
      <Card key="mine">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <CalendarCheck className="size-4 text-navy-500" aria-hidden /> Sessions to mark now
          </h2>
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{waiting.length}</span>
        </div>
        {waiting.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-peacock-700">
            <CheckCircle2 className="size-4" aria-hidden /> All your sessions for today are marked.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {waiting.map((w) => (
              <li key={`${w.section_id}-${w.session}`}>
                <Link href={link(w.section_id, w.session)} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-gold-300 hover:bg-gold-50">
                  <span className="flex-1 font-medium text-navy-900">{w.section_label}</span>
                  <span className="text-xs text-muted">{SESSION_LABEL[w.session as SessionName]}</span>
                  <ChevronRight className="size-4 text-navy-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>,
    );
  }
  if (!cards.length) return null;
  return <div className="mb-4 grid gap-4 md:grid-cols-2">{cards}</div>;
}
