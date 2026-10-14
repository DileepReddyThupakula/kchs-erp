import { CalendarOff } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ApplyLeaveForm, MyLeaveTable, type LeaveRow, type LeaveTypeOpt } from "@/components/leave/leave-ui";
import { monthLabel, monthRange } from "@/features/attendance/shared";
import { todayIst } from "@/features/fees/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My leave" };

const STATUS_TEXT = { present: "Present", late: "Late", absent: "Absent", on_leave: "On leave" } as const;

export default async function MyLeavePage() {
  const me = await requirePage("/my/leave");
  const supabase = await createClient();
  const year = await resolveYear();
  const today = todayIst();
  const { from, to } = monthRange(today.slice(0, 7));
  const [{ data: types }, { data: reqs }, { data: att }, bal] = await Promise.all([
    supabase.from("leave_types").select("id, name, default_days, is_active").order("sort_order"),
    supabase.from("leave_requests").select("*").eq("staff_id", me.staffId).order("from_date", { ascending: false }),
    supabase.from("staff_attendance").select("att_date, status").eq("staff_id", me.staffId).gte("att_date", from).lte("att_date", to).order("att_date"),
    year ? supabase.rpc("leave_balance", { p_staff: me.staffId, p_year: year.id }) : Promise.resolve({ data: [] }),
  ]);
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const opts: LeaveTypeOpt[] = (types ?? []).map((t) => ({ id: t.id, name: t.name, defaultDays: t.default_days, active: t.is_active }));
  const rows: LeaveRow[] = (reqs ?? []).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staff: me.fullName,
    type: typeName.get(r.leave_type_id) ?? "Leave",
    from: r.from_date,
    to: r.to_date,
    days: r.days,
    reason: r.reason,
    status: r.status,
    note: r.decision_note ?? "",
    decidedBy: "",
    remaining: null,
  }));
  const counts = { present: 0, late: 0, absent: 0, on_leave: 0 };
  for (const a of att ?? []) counts[a.status]++;

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "My work" }, { label: "My leave" }]} icon={<CalendarOff />} title="My leave" description="Apply for leave and see the decision. The Admin approves or rejects each request." />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <ApplyLeaveForm types={opts} />
        <Card>
          <h2 className="mb-2 font-semibold text-navy-900">My leave balance {year ? `(${year.name})` : ""}</h2>
          {(bal.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">No leave types yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(bal.data ?? []).map((b) => (
                <li key={b.leave_type_id} className="flex items-center justify-between py-1.5">
                  <span>{b.leave_type}</span>
                  <span className="tabular-nums">
                    {b.used} used{b.allowance == null ? " · unlimited" : ` of ${b.allowance} · ${b.remaining} left`}
                    {b.pending > 0 && <Badge tone="warning" className="ml-1.5">{b.pending} pending</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold text-navy-900">My requests</h2>
      <MyLeaveTable rows={rows} />

      <h2 className="mb-2 mt-6 text-lg font-semibold text-navy-900">My attendance, {monthLabel(today.slice(0, 7))}</h2>
      {(att ?? []).length === 0 ? (
        <EmptyState title="Nothing marked yet">The Admin marks staff attendance. Your own record for this month will show here.</EmptyState>
      ) : (
        <Card>
          <p className="mb-2 text-sm">
            <b>{counts.present}</b> present · <b>{counts.late}</b> late · <b>{counts.absent}</b> absent · <b>{counts.on_leave}</b> on leave
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(att ?? []).map((a) => (
              <span key={a.att_date} className="rounded-md border border-border px-2 py-1 text-xs">
                {formatDate(a.att_date)} · <b>{STATUS_TEXT[a.status]}</b>
              </span>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
