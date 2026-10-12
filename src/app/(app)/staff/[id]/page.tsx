import { notFound } from "next/navigation";
import { UserRound } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can, DUTY_INFO, type Duty } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card, PageHeader, RoleBadge } from "@/components/ui/card";
import { StaffForm } from "../staff-form";
import { LoginPanel } from "./login-panel";
import { DutiesPanel } from "./duties-panel";
import { Badge } from "@/components/ui/card";

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireCapability("staff.viewAll");
  const supabase = await createClient();
  const [{ data: s }, { data: dutyRows }] = await Promise.all([
    supabase.from("staff").select("*").eq("id", id).maybeSingle(),
    supabase.from("staff_permissions").select("duty").eq("staff_id", id),
  ]);
  if (!s) notFound();
  const duties = (dutyRows ?? []).map((r) => r.duty as Duty);
  const editable = can(me, "staff.edit");

  return (
    <>
      <PageHeader icon={<UserRound />} title={s.full_name} description={`${s.employee_code} · ${s.designation ?? "No designation"}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          {editable ? (
            <StaffForm staff={s} />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {(
                [
                  ["Gender", s.gender],
                  ["Date of birth", formatDate(s.dob)],
                  ["Phone", s.phone],
                  ["Email", s.email],
                  ["Department", s.department],
                  ["Qualification", s.qualification],
                  ["Date of joining", formatDate(s.date_of_joining)],
                  ["Status", s.status],
                  ["Address", s.address],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="capitalize">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-navy-900">ERP login</h2>
          {s.user_id && s.app_role ? (
            <p className="mb-3 text-sm">
              <RoleBadge role={s.app_role} /> <span className="ml-1 break-all">{s.email}</span>
            </p>
          ) : s.user_id ? (
            <p className="mb-3 text-sm text-muted">Login exists but access is revoked.</p>
          ) : (
            <p className="mb-3 text-sm text-muted">No login. Many staff (e.g. ayah) don&apos;t need one.</p>
          )}
          {can(me, "users.manage") && (
            <LoginPanel staffId={s.id} hasLogin={!!s.user_id} role={s.app_role} email={s.email} isSelf={s.id === me.staffId} />
          )}
        </Card>
        {s.app_role === "teacher" && (
          <Card className="lg:col-start-2">
            <h2 className="mb-1 font-semibold text-navy-900">Duties</h2>
            <p className="mb-3 text-xs text-muted">Extra office work this teacher may do. Without duties they only see their own classes and subjects.</p>
            {can(me, "duties.manage") ? (
              <DutiesPanel staffId={s.id} granted={duties} />
            ) : duties.length ? (
              <div className="flex flex-wrap gap-1.5">
                {duties.map((d) => (
                  <Badge key={d} tone="gold">
                    {DUTY_INFO[d].label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No duties.</p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
