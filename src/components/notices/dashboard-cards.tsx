import Link from "next/link";
import { BookOpenCheck, CheckCircle2, Circle, Megaphone, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import type { CurrentStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSchoolSettings } from "@/lib/settings";
import { getBoard, getSubmitCards } from "@/features/notices/diary-workflow";
import { getSubjectNameMap } from "@/features/notices/queries";
import { getSectionsInfo } from "@/features/timetable/queries";
import { fmtShort, noticeState } from "@/features/notices/shared";
import { todayIst } from "@/features/fees/shared";

/**
 * Dashboard: important notices pinned at the top for everyone they are addressed to
 * (until they expire), Admin's recent notices with read counts, and a teacher's
 * unread count and today's diary status for their own sections.
 */
export async function NoticesDashboard({ me }: { me: CurrentStaff }) {
  const supabase = await createClient();
  const today = todayIst();
  const { data } = await supabase.from("notices").select("id, title, circular_no, important, status, publish_date, expires_on, archived_at").eq("status", "published").is("archived_at", null).order("publish_date", { ascending: false }).limit(60);
  const live = (data ?? []).filter((n) => noticeState({ ...n, archived_at: null }, today) === "active");
  const { data: reads } = await supabase.from("notice_reads").select("notice_id").eq("staff_id", me.staffId);
  const read = new Set((reads ?? []).map((r) => r.notice_id));
  const important = live.filter((n) => n.important);
  const unread = live.filter((n) => !read.has(n.id)).length;

  const cards: React.ReactNode[] = [];

  if (me.role === "admin") {
    const recent = live.slice(0, 5);
    const counts = await Promise.all(
      recent.map(async (n) => {
        const { data: r } = await supabase.rpc("notice_readers", { p_notice: n.id });
        return { id: n.id, read: (r ?? []).filter((x) => x.read_at).length, total: (r ?? []).length };
      }),
    );
    cards.push(
      <Card key="recent">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <Megaphone className="size-4 text-navy-500" aria-hidden /> Recent notices
          </h2>
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800" title="Notices you have not marked as read">
            {unread} unread
          </span>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No current notices.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recent.map((n) => {
              const c = counts.find((x) => x.id === n.id);
              return (
                <li key={n.id}>
                  <Link href={`/notices/${n.id}`} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{c ? `read ${c.read}/${c.total}` : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/notices" className="mt-2 inline-block text-sm font-medium text-navy-700 hover:underline">
          All notices
        </Link>
      </Card>,
    );
  } else {
    // teacher: unread count, then the diary still to submit today
    cards.push(
      <Card key="notices">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <Megaphone className="size-4 text-navy-500" aria-hidden /> My notices
          </h2>
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">{unread} unread</span>
        </div>
        {live.length === 0 ? (
          <p className="text-sm text-muted">No current notices for you.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {live.slice(0, 4).map((n) => (
              <li key={n.id}>
                <Link href={`/notices/${n.id}`} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                  {read.has(n.id) ? <CheckCircle2 className="size-4 shrink-0 text-peacock-600" aria-label="read" /> : <Circle className="size-4 shrink-0 text-gold-600" aria-label="unread" />}
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
      </Card>,
    );
  }

  const year = await resolveYear();
  if (me.role !== "admin" && year) {
    const [sections, subjects] = await Promise.all([getSectionsInfo(supabase, year.id), getSubjectNameMap(supabase)]);
    const todo = (await getSubmitCards(supabase, me, sections, subjects, today)).filter((c) => c.status === "new" || c.status === "draft");
    if (todo.length || sections.length) {
      cards.push(
        <Card key="diary-submit">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-navy-900">
              <BookOpenCheck className="size-4 text-navy-500" aria-hidden /> Diary to submit today
            </h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${todo.length ? "bg-amber-100 text-amber-900" : "bg-peacock-100 text-peacock-800"}`}>{todo.length ? `${todo.length} to do` : "All done"}</span>
          </div>
          {todo.length === 0 ? (
            <p className="text-sm text-muted">Everything for today is submitted.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {todo.slice(0, 6).map((c) => (
                <li key={c.key}>
                  <Link href="/diary/submit" className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                    <span className="flex-1 font-medium">
                      {c.sectionLabel} · {c.subjectName ?? "Class remark"}
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
        </Card>,
      );
    }
  }

  if (me.role === "admin") {
    const { data: u } = await supabase.rpc("translation_status");
    const used = Number(u?.[0]?.used ?? 0);
    const cap = Number(u?.[0]?.cap ?? 0);
    const pct = cap > 0 ? Math.round((used / cap) * 100) : used > 0 ? 100 : 0;
    if (cap > 0 && pct >= 80) {
      cards.push(
        <Card key="translation" className="border-amber-300 bg-amber-50">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-amber-900">Telugu translation: {pct}% of this month&apos;s limit used</h2>
          <p className="text-sm text-amber-900">
            {used.toLocaleString("en-IN")} of {cap.toLocaleString("en-IN")} characters.{" "}
            {pct >= 100 ? "Automatic translation is switched off until next month: new lines show “Translation pending” and can be typed by hand." : "It switches off by itself at the limit."}{" "}
            <Link href="/settings" className="font-medium underline">
              School settings
            </Link>
          </p>
        </Card>,
      );
    }
  }

  if (year && can(me, "notices.edit")) {
    const [sections, settings] = await Promise.all([getSectionsInfo(supabase, year.id), getSchoolSettings()]);
    const rows = (await getBoard(supabase, sections, today, today, settings?.diary_deadline ?? "15:30")).filter((r) => r.expected > 0 && r.state !== "published" && r.state !== "none");
    const late = rows.filter((r) => r.late);
    cards.push(
      <Card key="diary-board">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <BookOpenCheck className="size-4 text-navy-500" aria-hidden /> Diary: classes pending or late today
          </h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${late.length ? "bg-red-100 text-red-800" : "bg-gold-100 text-gold-800"}`}>
            {rows.length} pending{late.length ? ` · ${late.length} late` : ""}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Every class with a diary today is published.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.slice(0, 6).map((r) => (
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
      </Card>,
    );
  }

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
              {!read.has(n.id) && <span className="shrink-0 rounded-full bg-navy-900 px-2 py-0.5 text-xs font-semibold text-gold-300">Unread</span>}
            </Link>
          ))}
        </section>
      )}
      {cards.length > 0 && <div className="mb-4 grid gap-4 md:grid-cols-2">{cards}</div>}
    </>
  );
}
