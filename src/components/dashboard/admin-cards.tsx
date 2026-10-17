import Link from "next/link";
import { BookOpenCheck, CalendarCheck, CalendarOff, CheckCircle2, ChevronRight, Megaphone, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { boardRows } from "@/features/notices/diary-workflow";
import { SESSION_LABEL, type SessionName } from "@/features/attendance/shared";

/** What `public.admin_dashboard()` returns: everything the Admin dashboard shows, from ONE database call. */
export type AdminDashboardData = {
  counts: { classes: number; sections: number; subjects: number; active_staff: number };
  unmarked: { section_id: string; section_label: string; session: string; staff_name: string | null }[];
  pending_leave: number;
  notices: { id: string; title: string; circular_no: string | null; important: boolean; publish_date: string; read: boolean; read_count: number | null; total: number | null }[];
  translation: { used: number; cap: number } | null;
  exam: { groups: number; holidays: number };
  diary: { section_id: string; label: string; class_order: number; expected: number; submitted: number; published: number; pending: number; skipped: number }[];
};

/** The Admin's dashboard cards (notices, attendance, reminders). Pure display: no database calls here. */
export function AdminDashboardCards({ data, today, deadline }: { data: AdminDashboardData; today: string; deadline: string }) {
  const live = data.notices;
  const important = live.filter((n) => n.important);
  const unread = live.filter((n) => !n.read).length;
  const link = (sectionId: string, session: string) => `/attendance?section=${sectionId}&session=${session}&date=${today}`;

  const board = boardRows(
    data.diary.map((d) => ({ id: d.section_id, label: d.label, classId: "", className: "" })),
    new Map(data.diary.map((d) => [d.section_id, d])),
    today,
    today,
    deadline,
  ).filter((r) => r.expected > 0 && r.state !== "published" && r.state !== "none");
  const late = board.filter((r) => r.late);

  const used = Number(data.translation?.used ?? 0);
  const cap = Number(data.translation?.cap ?? 0);
  const pct = cap > 0 ? Math.round((used / cap) * 100) : used > 0 ? 100 : 0;

  return (
    <>
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

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-navy-900">
              <Megaphone className="size-4 text-navy-500" aria-hidden /> Recent notices
            </h2>
            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800" title="Notices you have not marked as read">
              {unread} unread
            </span>
          </div>
          {live.length === 0 ? (
            <p className="text-sm text-muted">No current notices.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {live.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <Link href={`/notices/${n.id}`} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{n.total != null ? `read ${n.read_count ?? 0}/${n.total}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notices" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
            All notices
          </Link>
        </Card>

        {data.exam.groups > 0 && (
          <Card className="border-gold-300 bg-gold-50">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-navy-900">Before printing report cards</h2>
            <p className="text-sm text-navy-900">
              Add every <b>school vacation and break</b> to the holiday list{data.exam.holidays === 0 ? " (none has been added yet)" : ` (${data.exam.holidays} added so far)`}. Otherwise the working days on the report card will be too high. Also enter the real <b>term dates</b> for each class.
            </p>
            <p className="mt-1 text-sm">
              <Link href="/setup/academic-years" className="font-medium text-navy-700 underline">
                Holiday list
              </Link>{" "}
              ·{" "}
              <Link href="/exams/scheme" className="font-medium text-navy-700 underline">
                Term dates (Exam scheme)
              </Link>
            </p>
          </Card>
        )}

        {cap > 0 && pct >= 80 && (
          <Card className="border-amber-300 bg-amber-50">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-amber-900">Telugu translation: {pct}% of this month&apos;s limit used</h2>
            <p className="text-sm text-amber-900">
              {used.toLocaleString("en-IN")} of {cap.toLocaleString("en-IN")} characters.{" "}
              {pct >= 100 ? "Automatic translation is switched off until next month: new lines show “Translation pending” and can be typed by hand." : "It switches off by itself at the limit."}{" "}
              <Link href="/settings" className="font-medium underline">
                School settings
              </Link>
            </p>
          </Card>
        )}

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-navy-900">
              <BookOpenCheck className="size-4 text-navy-500" aria-hidden /> Diary: classes pending or late today
            </h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${late.length ? "bg-red-100 text-red-800" : "bg-gold-100 text-gold-800"}`}>
              {board.length} pending{late.length ? ` · ${late.length} late` : ""}
            </span>
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
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
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
                    <ChevronRight className="size-4 text-navy-300" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/attendance" className="font-medium text-navy-700 hover:underline">
              Open Attendance{data.unmarked.length > 6 ? ` (${data.unmarked.length - 6} more)` : ""}
            </Link>
            <Link href="/attendance/reports" className="font-medium text-navy-700 hover:underline">
              Reports
            </Link>
          </div>
        </Card>
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
            <CalendarOff className="size-4 text-navy-500" aria-hidden /> Leave waiting for approval
          </h2>
          <p className="text-3xl font-semibold tabular-nums text-navy-900">{data.pending_leave}</p>
          <Link href="/staff/leave" className="text-sm font-medium text-navy-700 hover:underline">
            Review requests
          </Link>
        </Card>
      </div>
    </>
  );
}
