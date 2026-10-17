import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { PageHeader } from "@/components/ui/card";
import { NoticeForm, type NoticeDraft } from "@/components/notices/notice-form";
import { signedLinks } from "@/features/notices/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Edit notice" };

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePage("/notices");
  await requireCapability("notices.edit");
  const supabase = await createClient();
  const { data: n } = await supabase.from("notices").select("*").eq("id", id).maybeSingle();
  if (!n || n.archived_at) redirect("/notices");
  const [{ data: aud }, { data: files }, { data: classes }, { data: dir }, settings] = await Promise.all([
    supabase.from("notice_audience").select("role, class_id, staff_id").eq("notice_id", id),
    supabase.from("notice_attachments").select("id, file_path, file_name, mime_type, size_bytes").eq("notice_id", id),
    supabase.from("classes").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.rpc("staff_directory"),
    getReceiptSchool(),
  ]);
  const initial: NoticeDraft = {
    id: n.id,
    title: n.title,
    body: n.body,
    titleTe: n.title_te ?? "",
    bodyTe: n.body_te ?? "",
    teStatus: n.te_status,
    audience: n.audience,
    roles: (aud ?? []).map((a) => a.role).filter(Boolean) as string[],
    classIds: (aud ?? []).map((a) => a.class_id).filter(Boolean) as string[],
    staffIds: (aud ?? []).map((a) => a.staff_id).filter(Boolean) as string[],
    publishDate: n.publish_date,
    expiresOn: n.expires_on ?? "",
    important: n.important,
    status: n.status,
    circularNo: n.circular_no,
  };
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Academics" }, { label: "Notices", href: "/notices" }, { label: n.circular_no ?? "Draft", href: `/notices/${id}` }, { label: "Edit" }]} icon={<Megaphone />} title="Edit notice" description={n.circular_no ? `Circular ${n.circular_no}` : "Draft: not yet published"} />
      <NoticeForm
        key={n.updated_at}
        initial={initial}
        classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
        teachers={(dir ?? []).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.full_name, designation: s.designation ?? "" }))}
        files={await signedLinks(supabase, "notice-files", files ?? [])}
        school={settings}
        today={todayIst()}
      />
    </>
  );
}
