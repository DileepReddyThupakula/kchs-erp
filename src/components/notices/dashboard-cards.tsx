import Link from "next/link";
import { BookOpenCheck, CheckCircle2, Circle, Megaphone, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import type { CurrentStaff } from "@/lib/auth/session";
import { getMyClasses } from "@/features/my/queries";
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
    // teacher: unread count + today's diary status for their own sections
    const year = await resolveYear();
    const mine = year ? await getMyClasses(me, year.id) : [];
    const { data: entries } = mine.length
      ? await supabase.from("diary_entries").select("id, status").eq("entry_date", today).eq("status", "published").is("archived_at", null)
      : { data: [] };
    const ids = (entries ?? []).map((e) => e.id);
    const { data: links } = ids.length ? await supabase.from("diary_entry_sections").select("entry_id, section_id").in("entry_id", ids) : { data: [] };
    const counts = new Map<string, number>();
    for (const l of links ?? []) counts.set(l.section_id, (counts.get(l.section_id) ?? 0) + 1);
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
    if (mine.length) {
      cards.push(
        <Card key="diary">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-navy-900">
            <BookOpenCheck className="size-4 text-navy-500" aria-hidden /> Today&apos;s diary
          </h2>
          <ul className="divide-y divide-border text-sm">
            {mine.map((m) => {
              const n = counts.get(m.sectionId) ?? 0;
              return (
                <li key={m.sectionId}>
                  <Link href={`/diary?section=${m.sectionId}&date=${today}`} className="flex items-center gap-2 py-1.5 hover:text-navy-900">
                    <span className="flex-1 font-medium">
                      {m.className} – {m.section}
                    </span>
                    {n > 0 ? <span className="text-xs text-peacock-700">{n} entr{n === 1 ? "y" : "ies"} added</span> : <span className="text-xs text-amber-800">Not added yet</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>,
      );
    }
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
