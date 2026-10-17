import { Megaphone } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { PageHeader } from "@/components/ui/card";
import { NoticeForm } from "@/components/notices/notice-form";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "New notice" };

export default async function NewNoticePage() {
  await requirePage("/notices");
  await requireCapability("notices.edit");
  const supabase = await createClient();
  const [{ data: classes }, { data: dir }, settings] = await Promise.all([
    supabase.from("classes").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.rpc("staff_directory"),
    getReceiptSchool(),
  ]);
  const today = todayIst();
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Academics" }, { label: "Notices", href: "/notices" }, { label: "New notice" }]} icon={<Megaphone />} title="New notice" description="Write the circular, choose who it is for, and publish it. It gets its circular number when published." />
      <NoticeForm
        initial={{ id: null, title: "", body: "", titleTe: "", bodyTe: "", teStatus: "none", audience: "all", roles: [], classIds: [], staffIds: [], publishDate: today, expiresOn: "", important: false, status: "draft", circularNo: null }}
        classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
        teachers={(dir ?? []).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.full_name, designation: s.designation ?? "" }))}
        files={[]}
        school={settings}
        today={today}
      />
    </>
  );
}
