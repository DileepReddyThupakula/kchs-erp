import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, RoleBadge, Table } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "active" } = await searchParams;
  const me = await requireCapability("staff.viewAll");
  const supabase = await createClient();
  let q = supabase.from("staff").select("*").order("full_name");
  if (status !== "all") q = q.eq("status", status);
  const [{ data: staff }, { data: dutyRows }] = await Promise.all([q, supabase.from("staff_permissions").select("staff_id")]);
  const dutyCount = new Map<string, number>();
  for (const r of dutyRows ?? []) dutyCount.set(r.staff_id, (dutyCount.get(r.staff_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        icon={<Users />}
        title="Staff"
        description="Staff records, logins and teacher duties."
        actions={
          can(me, "staff.edit") && (
            <Link href="/staff/new" className={buttonClasses("primary")}>
              <UserPlus className="size-4" aria-hidden /> Add staff
            </Link>
          )
        }
      />
      <div className="mb-3 inline-flex rounded-lg border border-border bg-surface p-1 text-sm shadow-sm" role="tablist" aria-label="Filter by status">
        {["active", "inactive", "left", "all"].map((s) => (
          <Link
            key={s}
            href={`/staff?status=${s}`}
            role="tab"
            aria-selected={s === status}
            className={cn("rounded-md px-3 py-1.5 transition-colors", s === status ? "bg-navy-900 font-medium text-gold-400" : "text-muted hover:bg-navy-50 hover:text-navy-900")}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>
      {staff?.length ? (
        <Table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Phone</th>
              <th>ERP access</th>
              <th>Duties</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="tabular-nums">{s.employee_code}</td>
                <td>
                  <Link href={`/staff/${s.id}`} className="font-medium text-navy-700 hover:underline">
                    {s.full_name}
                  </Link>
                </td>
                <td>{s.designation ?? "—"}</td>
                <td>{s.phone ?? "—"}</td>
                <td>{s.app_role && s.user_id ? <RoleBadge role={s.app_role} /> : <span className="text-muted">No login</span>}</td>
                <td className="tabular-nums">{s.app_role === "teacher" ? dutyCount.get(s.id) ?? 0 : s.app_role === "admin" ? "All" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No staff here">{status === "active" ? "No active staff yet." : `No staff with status “${status}”.`}</EmptyState>
      )}
    </>
  );
}
