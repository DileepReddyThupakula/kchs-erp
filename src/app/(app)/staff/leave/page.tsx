import { CalendarOff } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { ApplyLeaveForm, ApprovalsTable, BalancesTable, MyLeaveTable, TypesPanel, type BalanceRow, type LeaveRow, type LeaveTypeOpt } from "@/components/leave/leave-ui";

export const metadata = { title: "Leave" };

export default async function StaffLeavePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/staff/leave");
  const supabase = await createClient();
  const year = await resolveYear();
  const tab = ["all", "balances", "types", "apply"].includes(sp.tab ?? "") ? sp.tab! : "approvals";

  const [{ data: types }, { data: reqs }, { data: dir }] = await Promise.all([
    supabase.from("leave_types").select("id, name, default_days, is_active").order("sort_order"),
    supabase.from("leave_requests").select("*").order("from_date", { ascending: false }).limit(1000),
    supabase.rpc("staff_directory"),
  ]);
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const names = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  const opts: LeaveTypeOpt[] = (types ?? []).map((t) => ({ id: t.id, name: t.name, defaultDays: t.default_days, active: t.is_active }));

  // remaining balance of each pending request's type, for its staff member
  const pendingStaff = [...new Set((reqs ?? []).filter((r) => r.status === "pending").map((r) => r.staff_id))];
  const remaining = new Map<string, number | null>();
  if (year) {
    for (const sid of pendingStaff) {
      const { data } = await supabase.rpc("leave_balance", { p_staff: sid, p_year: year.id });
      for (const b of data ?? []) remaining.set(`${sid}|${b.leave_type_id}`, b.remaining);
    }
  }
  const all: LeaveRow[] = (reqs ?? []).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staff: names.get(r.staff_id) ?? "—",
    type: typeName.get(r.leave_type_id) ?? "Leave",
    from: r.from_date,
    to: r.to_date,
    days: r.days,
    reason: r.reason,
    status: r.status,
    note: r.decision_note ?? "",
    decidedBy: r.decided_by ? (names.get(r.decided_by) ?? "") : "",
    remaining: remaining.get(`${r.staff_id}|${r.leave_type_id}`) ?? null,
  }));
  const pending = all.filter((r) => r.status === "pending");

  const tabs = (
    <LinkTabs
      current={tab}
      tabs={[
        { id: "approvals", label: "Waiting for approval", href: "/staff/leave", count: pending.length },
        { id: "all", label: "All requests", href: "/staff/leave?tab=all" },
        { id: "balances", label: "Balances", href: "/staff/leave?tab=balances" },
        { id: "types", label: "Leave types", href: "/staff/leave?tab=types" },
        { id: "apply", label: "Apply for leave", href: "/staff/leave?tab=apply" },
      ]}
    />
  );

  let body: React.ReactNode;
  if (tab === "all") body = <ApprovalsTable id="leave-all" rows={all} pendingOnly={false} />;
  else if (tab === "types") body = <TypesPanel types={opts} />;
  else if (tab === "apply")
    body = (
      <div className="space-y-6">
        <ApplyLeaveForm types={opts} staff={(dir ?? []).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.full_name }))} />
        <div>
          <h2 className="mb-2 text-lg font-semibold text-navy-900">My requests</h2>
          <MyLeaveTable rows={all.filter((r) => r.staffId === me.staffId)} />
        </div>
      </div>
    );
  else if (tab === "balances") {
    if (!year) body = <EmptyState title="No academic year">Create an academic year first.</EmptyState>;
    else {
      const staffIds = (dir ?? []).filter((s) => s.status === "active").map((s) => s.id);
      const rows: BalanceRow[] = [];
      for (const sid of staffIds) {
        const { data } = await supabase.rpc("leave_balance", { p_staff: sid, p_year: year.id });
        rows.push({
          staffId: sid,
          staff: names.get(sid) ?? "—",
          cells: Object.fromEntries((data ?? []).map((b) => [b.leave_type_id, { allowance: b.allowance, used: b.used, pending: b.pending, remaining: b.remaining }])),
        });
      }
      rows.sort((a, b) => a.staff.localeCompare(b.staff));
      body = <BalancesTable rows={rows} types={opts} yearId={year.id} yearName={year.name} />;
    }
  } else body = <ApprovalsTable id="leave-pending" rows={pending} pendingOnly />;

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Staff" }, { label: "Leave" }]} icon={<CalendarOff />} title="Leave" description="Approve or reject leave requests, see balances and set leave types. Approved leave appears on the Substitutions screen." />
      {tabs}
      {body}
    </>
  );
}
