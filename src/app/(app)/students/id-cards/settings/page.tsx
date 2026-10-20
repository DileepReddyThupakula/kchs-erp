import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { IdCardSettingsPanel } from "@/components/id-cards/settings-panel";

export const metadata = { title: "ID card settings" };

export default async function IdCardSettings() {
  const me = await requirePage("/students/id-cards");
  if (me.role !== "admin") redirect("/not-allowed");
  const supabase = await createClient();
  const { data } = await supabase.rpc("id_card_settings_get");
  const s = (data as unknown as { prefix: string; show_phone: boolean; show_blood_group: boolean } | null) ?? { prefix: "ID", show_phone: true, show_blood_group: true };
  const year = (await getAcademicYears()).find((y) => y.is_current);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "ID cards", href: "/students/id-cards" }, { label: "Settings" }]} icon={<Settings2 />} title="ID card settings" description="Admin only. Every change is recorded in the audit log." />
      <IdCardSettingsPanel prefix={s.prefix} showPhone={s.show_phone} showBlood={s.show_blood_group} year={year?.name ?? "2026-27"} />
    </>
  );
}
