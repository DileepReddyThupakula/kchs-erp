import Link from "next/link";
import { BookOpenCheck, CalendarCheck, CheckCircle2, ChevronRight, Circle, ClipboardList, Megaphone, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { boardRows } from "@/features/notices/diary-workflow";
import { SESSION_LABEL, type SessionName } from "@/features/attendance/shared";
import { fmtShort } from "@/features/notices/shared";
import { TodayStrip, type TodayPeriod } from "@/components/timetable/today-strip";
import { FeeTiles, type FeeBlock } from "./fee-tiles";

/** What `public.staff_dashboard()` returns: a teacher's or an office person's dashboard, scoped to them, in ONE database call. */
export type StaffDashboardData = {
  counts: { sections: number; subjects: number; students: number };
  next_holiday: { date: string; name: string } | null;
  sessions: { section_id: string; section_label: string; session: string; marked: boolean }[];
  unmarked: { section_id: string; section_label: string; session: string; staff_name: string | null }[] | null;
  notices: { id: string; title: string; circular_no: string | null; important: boolean; publish_date: string; read: boolean }[];
  marks_to_enter: { section_label: string; subject: string; exam: string; missing: number }[];
  today: TodayPeriod[];
  diary_sections: number;
  diary_todo: { section_id: string; section_label: string; subject: string | null; status: "new" | "draft"; reminded: boolean }[];
  diary_board: { section_id: string; label: string; class_order: number; expected: number; submitted: number; published: number; pending: number; skipped: number }[] | null;
  /** null unless the person has fee access (never for a teacher) */
  fees: FeeBlock;
};

export function StaffDashboardCards({ data, today, deadline, isTeacher }: { data: StaffDashboardData; today: string; deadline: string; isTeacher: boolean }) {
  const important = data.notices.filter((n) => n.important);
  const unread = data.notices.filter((n) => !n.read).length;
  const waiting = data.sessions.filter((s) => !s.marked);
  const link = (sectionId: string, session: string) => `/attendance?section=${sectionId}&session=${session}&date=${today}`;
  const board = data.diary_board
    ? boardRows(data.diary_board.map((d) => ({ id: d.section_id, label: d.label, classId: "", className: "" })), new Map(data.diary_board.map((d) => [d.section_id, d])), today, today, deadline).filter((r) => r.expected > 0 && r.state !== "published" && r.state !== "none")
    : null;
  return (
    <>
      <FeeTiles fees={data.fees} />
      {important.length > 0 && (
        <section aria-label="Important notices" className="mb-4 space-y-2">
          {important.map((n) => (
            <Link key={n.id} href={`/notices/${n.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border-2 border-gold-400 bg-gold-50 px-4 py-3 shadow-[var(--shadow-soft)] hover:bg-gold-100">
              <Pin className="size-5 shrink-0 text-gold-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gold-800">Important{n.circular_no ? ` · ${n.circular_no}` : ""}</span>
                <span className="block truncate font-semibold text-navy-900">{n.title}</span>
              </span>
              {!n.read && <span className="shrink-0 rounded-full bg-navy-900 px-2 py-0.5 text-xs font-semibold text-gold-300">Unread</span>}
            </Link>
          ))}
        </section>
      )}
      {isTeacher && <TodayStrip rows={data.today} />}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-navy-900">
              <Megaphone className="size-4 text-navy-500" aria-hidden /> My notices
            </h2>
            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{unread} unread</span>
          </div>
          {data.notices.length === 0 ? (
            <p className="text-sm text-muted">No current notices for you.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.notices.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <Link href={`/notices/${n.id}`} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                    {n.read ? <CheckCircle2 className="size-4 shrink-0 text-peacock-600" aria-label="read" /> : <Circle className="size-4 shrink-0 text-gold-600" aria-label="unread" />}
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtShort(n.publish_date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notices" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
            All notices
          </Link>
        </Card>

        {(data.diary_todo.length > 0 || data.diary_sections > 0) && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <BookOpenCheck className="size-4 text-navy-500" aria-hidden /> Diary to submit today
              </h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${data.diary_todo.length ? "bg-amber-100 text-amber-900" : "bg-peacock-100 text-peacock-800"}`}>{data.diary_todo.length ? `${data.diary_todo.length} to do` : "All done"}</span>
            </div>
            {data.diary_todo.length === 0 ? (
              <p className="text-sm text-muted">Everything for today is submitted.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.diary_todo.slice(0, 6).map((c) => (
                  <li key={`${c.section_id}-${c.subject ?? "remark"}`}>
                    <Link href="/diary/submit" className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                      <span className="flex-1 font-medium">
                        {c.section_label} · {c.subject ?? "Class remark"}
                      </span>
                      {c.reminded && <span className="rounded-full bg-gold-100 px-1.5 text-xs font-semibold text-gold-800">Reminder</span>}
                      <span className="text-xs text-amber-800">{c.status === "draft" ? "Draft" : "Not started"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/diary/submit" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
              Open Submit diary
            </Link>
          </Card>
        )}

        {data.sessions.length > 0 && (
          <Card>
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
          </Card>
        )}

        {data.marks_to_enter.length > 0 && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <ClipboardList className="size-4 text-navy-500" aria-hidden /> Marks still to enter
              </h2>
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{data.marks_to_enter.reduce((a, m) => a + m.missing, 0)}</span>
            </div>
            <ul className="divide-y divide-border text-sm">
              {data.marks_to_enter.slice(0, 6).map((m) => (
                <li key={`${m.section_label}-${m.subject}-${m.exam}`} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 font-medium">
                    {m.section_label} · {m.subject} · {m.exam}
                  </span>
                  <span className="text-xs text-muted">{m.missing} to enter</span>
                </li>
              ))}
            </ul>
            <Link href="/exams/marks" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
              Open marks entry
            </Link>
          </Card>
        )}

        {data.unmarked && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <CalendarCheck className="size-4 text-navy-500" aria-hidden /> Attendance not yet marked
              </h2>
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{data.unmarked.length}</span>
            </div>
            {data.unmarked.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-peacock-700">
                <CheckCircle2 className="size-4" aria-hidden /> Everything for today is marked (or it is not a school day).
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.unmarked.slice(0, 6).map((u) => (
                  <li key={`${u.section_id}-${u.session}`}>
                    <Link href={link(u.section_id, u.session)} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                      <span className="flex-1">
                        <span className="font-medium">{u.section_label}</span>
                        <span className="ml-2 text-xs text-muted">{SESSION_LABEL[u.session as SessionName]}</span>
                      </span>
                      <span className="text-xs text-muted">{u.staff_name ?? "nobody assigned"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/attendance" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
              Open Attendance{data.unmarked.length > 6 ? ` (${data.unmarked.length - 6} more)` : ""}
            </Link>
          </Card>
        )}

        {board && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <BookOpenCheck className="size-4 text-navy-500" aria-hidden /> Diary: classes pending or late today
              </h2>
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{board.length} pending</span>
            </div>
            {board.length === 0 ? (
              <p className="text-sm text-muted">Every class with a diary today is published.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {board.slice(0, 6).map((r) => (
                  <li key={r.sectionId}>
                    <Link href={`/diary/class/${r.sectionId}?date=${today}`} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                      <span className="flex-1 font-medium">{r.label}</span>
                      <span className="text-xs text-muted">
                        {r.submitted}/{r.expected} in
                      </span>
                      {r.late && <span className="rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-800">Late</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/diary/class" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
              Open Class diary
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
