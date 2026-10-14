import Link from "next/link";
import { CalendarCheck, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Badge, Breadcrumbs, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { AttendanceTabs } from "@/components/attendance/nav";
import { MarkSheet } from "@/components/attendance/mark-sheet";
import { DatePicker, SectionPicker } from "@/components/attendance/pickers";
import { getRoster, getSavedSession } from "@/features/attendance/queries";
import { KIND_LABEL, SESSION_LABEL, type SessionName } from "@/features/attendance/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ section?: string; session?: string; date?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/attendance");
  const supabase = await createClient();
  const today = todayIst();
  const isAny = me.role === "admin" || me.duties.includes("all_class_attendance");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! <= today ? sp.date! : today;
  const session = sp.session === "morning" || sp.session === "afternoon" ? (sp.session as SessionName) : null;
  const year = await resolveYear();

  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Academics" }, { label: "Attendance" }]}
      icon={<CalendarCheck />}
      title="Attendance"
      description={isAny ? "Mark or correct any section, session and date." : "Mark the sessions assigned to you today. Each day has a morning and an afternoon session."}
    />
  );
  if (!year) return <>{header}<EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState></>;

  const sections = await getSectionsInfo(supabase, year.id);

  // ---------------------------------------------------------------- one session
  if (sp.section && session) {
    const { data: mine } = await supabase.rpc("my_attendance_sessions", { p_date: date });
    const assignedRow = (mine ?? []).find((m) => m.section_id === sp.section && m.session === session);
    const assigned = !!assignedRow;
    // a substitute marker cannot read a section they do not teach: take its name from their assigned session
    const known = sections.find((s) => s.id === sp.section);
    const section = known ? { id: known.id, label: known.label } : assignedRow ? { id: assignedRow.section_id, label: assignedRow.section_label } : undefined;
    const saved = await getSavedSession(supabase, sp.section, date, session);
    const backHref = isAny ? `/attendance?date=${date}` : "/attendance";
    if (!section || (!isAny && !assigned && !saved)) {
      return (
        <>
          {header}
          <EmptyState title="Not available" action={<Link href="/attendance" className="text-sm font-medium text-navy-700 underline">Back to my sessions</Link>}>
            This session is not assigned to you, or it does not exist on that date.
          </EmptyState>
        </>
      );
    }
    const students = await getRoster(supabase, sp.section, date, year.id);
    const editable = isAny || (assigned && date === today);
    let lockNote: string | null = null;
    if (!editable) {
      lockNote =
        assigned && date !== today
          ? "This day is over, so it is locked. Only the Admin or a teacher with the attendance duty can correct a past day."
          : "You can look at this session but it is assigned to another teacher. Only the assigned teacher marks it today.";
    } else if (isAny && date !== today) {
      lockNote = "You are correcting a past day. The change is recorded as a correction with your name and the time.";
    }
    return (
      <>
        <Breadcrumbs items={[{ label: "Academics" }, { label: "Attendance", href: backHref }, { label: section.label }]} />
        <MarkSheet
          key={`${sp.section}-${date}-${session}`}
          sectionId={section.id}
          sectionLabel={section.label}
          date={date}
          session={session}
          students={students}
          saved={saved}
          editable={editable}
          lockNote={lockNote}
          backHref={backHref}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- list
  const { data: mine } = await supabase.rpc("my_attendance_sessions", { p_date: date });
  const waiting = (mine ?? []).filter((m) => !m.marked);
  const unmarked = isAny ? ((await supabase.rpc("unmarked_sessions", { p_date: date })).data ?? []) : [];
  const href = (sectionId: string, s: string, d = date) => `/attendance?section=${sectionId}&session=${s}&date=${d}`;

  return (
    <>
      {header}
      <AttendanceTabs current="mark" />

      <section aria-label="Your sessions" className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-navy-900">
          {date === today ? "Your sessions today" : `Your sessions on ${formatDate(date)}`}
          {waiting.length > 0 && <Badge tone="warning">{waiting.length} to mark</Badge>}
        </h2>
        {(mine ?? []).length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No attendance session is assigned to you {date === today ? "today" : "on this date"}. This is normal on a holiday or when you take no first or after-lunch period.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(mine ?? []).map((m) => (
              <li key={`${m.section_id}-${m.session}`}>
                <Link
                  href={href(m.section_id, m.session)}
                  className="flex min-h-20 items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-soft)] transition-colors hover:border-gold-300 hover:bg-gold-50"
                >
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${m.marked ? "bg-peacock-100 text-peacock-700" : "bg-gold-100 text-gold-800"}`}>
                    {m.marked ? <CheckCircle2 className="size-6" aria-hidden /> : <Clock className="size-6" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-navy-900">{m.section_label}</span>
                    <span className="block text-sm text-muted">
                      {SESSION_LABEL[m.session as SessionName]} · period {m.period_no}
                      {m.source === "substitute" ? " · substitute" : m.source === "class_teacher" ? " · class teacher" : ""}
                    </span>
                    <span className="block text-xs font-medium">
                      {m.marked ? <span className="text-peacock-700">Marked ({KIND_LABEL[m.marked_kind ?? "regular"]})</span> : <span className="text-amber-800">Waiting to be marked</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-navy-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAny && (
        <section aria-label="Any section" className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-navy-900">Any section, session or date</h2>
            <div className="flex flex-wrap items-end gap-3">
              <DatePicker value={date} max={today} />
              <SectionPicker sections={sections.map((s) => ({ id: s.id, label: s.label }))} date={date} />
            </div>
          </Card>
          <Card className="p-0">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-semibold text-navy-900">Not yet marked on {formatDate(date)}</h3>
              <p className="text-xs text-muted">Tap a session to mark it yourself, for example when a teacher is absent.</p>
            </div>
            {unmarked.length === 0 ? (
              <p className="px-4 py-4 text-sm text-peacock-700">Everything has been marked for this date (or it is not a school day).</p>
            ) : (
              <ul className="divide-y divide-border">
                {unmarked.map((u) => (
                  <li key={`${u.section_id}-${u.session}`}>
                    <Link href={href(u.section_id, u.session)} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-gold-50">
                      <span className="flex-1">
                        <span className="font-medium text-navy-900">{u.section_label}</span>
                        <span className="ml-2 text-sm text-muted">{SESSION_LABEL[u.session as SessionName]}</span>
                      </span>
                      <span className="text-xs text-muted">{u.staff_name ? `Assigned: ${u.staff_name}` : "Nobody assigned"}</span>
                      <ChevronRight className="size-4 text-navy-300" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}
    </>
  );
}
