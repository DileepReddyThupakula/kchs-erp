import { CalendarCheck, Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { ParamSelect } from "@/components/ui/param-select";
import { AttendanceTabs } from "@/components/attendance/nav";
import { DailyTable, LowTable, PrintLink, RegisterTable, type DailyRowView, type LowRow, type RegisterRow } from "@/components/attendance/report-tables";
import { MonthPicker } from "@/components/attendance/month-picker";
import { getDailyRows, getLowThreshold } from "@/features/attendance/queries";
import { monthLabel, monthRange, shiftMonth, dayOfWeek, type SessionName } from "@/features/attendance/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Attendance reports" };

export default async function AttendanceReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; section?: string; month?: string; range?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/attendance");
  const supabase = await createClient();
  const today = todayIst();
  const isAny = me.role === "admin" || me.duties.includes("all_class_attendance");
  const isAdmin = me.role === "admin";
  const tab = sp.tab === "register" || sp.tab === "low" ? sp.tab : "daily";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const year = await resolveYear();
  const header = (
    <PageHeader breadcrumbs={[{ label: "Academics" }, { label: "Attendance" }]} icon={<CalendarCheck />} title="Attendance reports" description="Daily summary, monthly register and low attendance. You see the sections you are allowed to see." />
  );
  if (!year) return <>{header}<EmptyState title="No academic year yet">Create an academic year first.</EmptyState></>;

  const all = await getSectionsInfo(supabase, year.id);
  // office/duty: every section; a teacher: sections they are class teacher of (others show only their own sessions)
  const sections = isAny ? all : all.filter((s) => s.classTeacherId === me.staffId);
  const q = (t: string, extra = "") => `/attendance/reports?tab=${t}${extra}`;
  const tabs = (
    <LinkTabs
      current={tab}
      tabs={[
        { id: "daily", label: "Daily summary", href: q("daily", `&date=${date}`) },
        { id: "register", label: "Monthly register", href: q("register", `&month=${month}${sp.section ? `&section=${sp.section}` : ""}`) },
        { id: "low", label: "Low attendance", href: q("low") },
      ]}
    />
  );

  if (tab === "daily") {
    const { data } = await supabase.rpc("daily_attendance_summary", { p_date: date });
    const rows: DailyRowView[] = (data ?? []).map((r) => ({
      key: `${r.section_id}-${r.session}`,
      sectionId: r.section_id,
      section: r.section_label,
      session: r.session as SessionName,
      marked: r.marked,
      by: r.marked_by_name ?? "",
      kind: r.kind ?? "",
      present: r.present,
      late: r.late,
      absent: r.absent,
      total: r.total,
    }));
    return (
      <>
        {header}
        <AttendanceTabs current="reports" />
        {tabs}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MonthPicker kind="date" value={date} max={today} param="date" tab="daily" />
          <span className="text-sm text-muted">{rows.filter((r) => !r.marked).length} of {rows.length} sessions not marked</span>
        </div>
        <DailyTable rows={rows} date={date} canMark={isAny} />
      </>
    );
  }

  if (tab === "register") {
    const section = sections.find((s) => s.id === sp.section) ?? sections[0];
    if (!section) {
      return (
        <>
          {header}
          <AttendanceTabs current="reports" />
          {tabs}
          <EmptyState title="No section to show">The monthly register is for class teachers and the attendance duty. You can still see the sessions you marked on the Daily summary.</EmptyState>
        </>
      );
    }
    const { from, to, days } = monthRange(month);
    const { data: stats } = await supabase.rpc("section_attendance", { p_section: section.id, p_from: from, p_to: to });
    const ids = (stats ?? []).map((s) => s.student_id);
    const daily = await getDailyRows(supabase, ids, from, to);
    const byStudent = new Map<string, Record<number, string>>();
    for (const d of daily) (byStudent.get(d.studentId) ?? byStudent.set(d.studentId, {}).get(d.studentId)!)[Number(d.date.slice(8, 10))] = d.day;
    const rows: RegisterRow[] = (stats ?? []).map((s) => ({
      studentId: s.student_id,
      roll: s.roll_no,
      name: s.full_name,
      admissionNo: s.admission_no,
      days: byStudent.get(s.student_id) ?? {},
      pct: s.pct,
      full: s.full_days,
      half: s.half_days,
      absent: s.absent_days,
    }));
    const nonSchool = Array.from({ length: days }, (_, i) => i + 1).filter((d) => dayOfWeek(`${month}-${String(d).padStart(2, "0")}`) === 0);
    return (
      <>
        {header}
        <AttendanceTabs current="reports" />
        {tabs}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ParamSelect param="section" label="Section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
          <MonthPicker kind="month" value={month} param="month" tab="register" extra={`section=${section.id}`} />
          <span className="text-sm text-muted">
            {section.label} · {monthLabel(month)} · previous {monthLabel(shiftMonth(month, -1))}
          </span>
          <span className="ml-auto">
            <PrintLink href={`/print/attendance/register?section=${section.id}&month=${month}`}>
              <Printer className="size-4" aria-hidden /> Print
            </PrintLink>
          </span>
        </div>
        <RegisterTable rows={rows} month={month} days={days} nonSchool={nonSchool} exportName={`attendance-register-${section.label}-${month}`} />
      </>
    );
  }

  // low attendance
  const range = sp.range === "year" ? "year" : "month";
  const { from, to } = range === "year" ? { from: year.start_date, to: today } : monthRange(today.slice(0, 7));
  const threshold = await getLowThreshold(supabase);
  const lows: LowRow[] = [];
  for (const sec of sections) {
    const { data } = await supabase.rpc("section_attendance", { p_section: sec.id, p_from: from, p_to: to });
    for (const s of data ?? []) {
      if (s.pct !== null && s.pct < threshold) {
        lows.push({ studentId: s.student_id, name: s.full_name, admissionNo: s.admission_no, section: sec.label, pct: s.pct, marked: s.sessions_marked, attended: s.sessions_attended, absentDays: s.absent_days });
      }
    }
  }
  lows.sort((a, b) => a.pct - b.pct);
  return (
    <>
      {header}
      <AttendanceTabs current="reports" />
      {tabs}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ParamSelect param="range" label="Period" value={range} options={[{ value: "month", label: "This month" }, { value: "year", label: "Year to date" }]} />
        <input type="hidden" />
        <span className="ml-auto">
          <PrintLink href={`/print/attendance/low?range=${range}`}>
            <Printer className="size-4" aria-hidden /> Print
          </PrintLink>
        </span>
      </div>
      <LowTable rows={lows} threshold={threshold} isAdmin={isAdmin} rangeLabel={range === "year" ? `${year.name} to date` : monthLabel(today.slice(0, 7))} />
    </>
  );
}
