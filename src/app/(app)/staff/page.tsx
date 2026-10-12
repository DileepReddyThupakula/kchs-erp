import { Users } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { StaffTable, type StaffRow } from "./staff-table";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const me = await requireCapability("staff.viewAll");
  const supabase = await createClient();
  const [{ data: staff }, { data: dutyRows }] = await Promise.all([
    supabase.from("staff").select("*").order("full_name"),
    supabase.from("staff_permissions").select("staff_id"),
  ]);
  const dutyCount = new Map<string, number>();
  for (const r of dutyRows ?? []) dutyCount.set(r.staff_id, (dutyCount.get(r.staff_id) ?? 0) + 1);
  const rows: StaffRow[] = (staff ?? []).map((s) => ({ ...s, duties: dutyCount.get(s.id) ?? 0 }));

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "People" }, { label: "Staff" }]} icon={<Users />} title="Staff" description="Staff records, logins and teacher duties." />
      <StaffTable rows={rows} editable={can(me, "staff.edit")} />
    </>
  );
}
