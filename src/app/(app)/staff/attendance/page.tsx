import { UserCheck } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { MonthPicker } from "@/components/attendance/month-picker";
import { StaffMonthTable, StaffSheet, type MonthRow, type SheetRow } from "@/components/leave/staff-attendance-ui";
import { monthLabel, monthRange } from "@/features/attendance/shared";
import { todayIst } from "@/features/fees/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Staff attendance" };

export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; month?: string }> }) {
  const sp = await searchParams;
  await requirePage("/staff/attendance");
  const supabase = await createClient();
  const today = todayIst();
  const tab = sp.tab === "report" ? "report" : "mark";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! <= today ? sp.date! : today;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);

  const tabs = (
    <LinkTabs
      current={tab}
      tabs={[
        { id: "mark", label: "Mark attendance", href: `/staff/attendance?tab=mark&date=${date}` },
        { id: "report", label: "Monthly report", href: `/staff/attendance?tab=report&month=${month}` },
      ]}
    />
  );
  const header = (
    <PageHeader breadcrumbs={[{ label: "Staff" }, { label: "Staff attendance" }]} icon={<UserCheck />} title="Staff attendance" description="Mark each person's attendance for a day. Approved leave is filled in for you." />
  );

  if (tab === "report") {
    const { from, to } = monthRange(month);
    const [{ data: m }, { data: lt }] = await Promise.all([supabase.rpc("staff_attendance_month", { p_month: from }), supabase.rpc("leave_taken", { p_from: from, p_to: to })]);
    const taken = new Map<string, string[]>();
    for (const l of lt ?? []) (taken.get(l.staff_id) ?? taken.set(l.staff_id, []).get(l.staff_id)!).push(`${l.leave_type} ${l.days}`);
    const rows: MonthRow[] = (m ?? []).map((r) => ({ staffId: r.staff_id, name: r.full_name, present: r.present, late: r.late, absent: r.absent, onLeave: r.on_leave, leaveTaken: (taken.get(r.staff_id) ?? []).join(", ") }));
    return (
      <>
        {header}
        {tabs}
        <div className="mb-3 flex items-center gap-2">
          <MonthPicker kind="month" value={month} param="month" tab="report" base="/staff/attendance" />
          <span className="text-sm text-muted">{monthLabel(month)}</span>
        </div>
        <StaffMonthTable rows={rows} month={month} />
      </>
    );
  }

  const { data } = await supabase.rpc("staff_attendance_sheet", { p_date: date });
  const rows: SheetRow[] = (data ?? []).map((r) => ({
    staffId: r.staff_id,
    name: r.full_name,
    code: r.employee_code,
    designation: r.designation ?? "",
    status: (r.status as SheetRow["status"]) ?? null,
    prefilled: r.prefilled,
  }));
  return (
    <>
      {header}
      {tabs}
      <div className="mb-3 flex items-center gap-2">
        <StaffDate value={date} max={today} />
        <span className="text-sm text-muted">{formatDate(date)}</span>
      </div>
      <StaffSheet key={date} date={date} rows={rows} />
    </>
  );
}

function StaffDate({ value, max }: { value: string; max: string }) {
  return <MonthPicker kind="date" value={value} max={max} param="date" tab="mark" base="/staff/attendance" />;
}
