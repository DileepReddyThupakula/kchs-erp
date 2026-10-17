import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { NoticesTable, type NoticeItem } from "@/components/notices/notices-ui";
import { getAudienceText } from "@/features/notices/queries";
import { noticeState } from "@/features/notices/shared";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Notices" };

export default async function NoticesPage() {
  const me = await requirePage("/notices");
  const supabase = await createClient();
  const canEdit = can(me, "notices.edit");
  const isAdmin = me.role === "admin";
  const today = todayIst();
  const { data: notices } = await supabase.from("notices").select("*").order("publish_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  const list = notices ?? [];
  const [audience, { data: reads }, rc, sc] = await Promise.all([
    getAudienceText(supabase, list),
    supabase.from("notice_reads").select("notice_id").eq("staff_id", me.staffId),
    isAdmin ? supabase.rpc("notice_read_counts") : Promise.resolve({ data: null }),
    canEdit ? supabase.rpc("notice_send_counts") : Promise.resolve({ data: null }),
  ]);
  const mine = new Set((reads ?? []).map((r) => r.notice_id));
  const counts = new Map<string, { read: number; total: number }>();
  (rc.data ?? []).forEach((c) => counts.set(c.notice_id, { read: c.read_count, total: c.total }));
  const sendCounts = new Map<string, { sent: number; total: number }>();
  (sc.data ?? []).forEach((c) => sendCounts.set(c.notice_id, { sent: c.sent, total: c.total }));
  const rows: NoticeItem[] = list.map((n) => ({
    id: n.id,
    title: n.title,
    circularNo: n.circular_no,
    audience: n.audience,
    audienceText: audience.get(n.id) ?? "",
    publishDate: n.publish_date,
    expiresOn: n.expires_on,
    important: n.important,
    state: noticeState(n, today),
    readCount: counts.get(n.id)?.read ?? null,
    total: counts.get(n.id)?.total ?? null,
    iRead: mine.has(n.id),
    sends: sendCounts.get(n.id) ?? null,
  }));
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Notices" }]}
        icon={<Megaphone />}
        title="Notices"
        description={canEdit ? "Circulars and announcements. Each published notice gets a circular number." : "Circulars and announcements addressed to you."}
        actions={
          canEdit && (
            <Link href="/notices/new" className={buttonClasses("primary")}>
              <Plus className="size-4" aria-hidden /> New notice
            </Link>
          )
        }
      />
      <NoticesTable rows={rows} canEdit={canEdit} isAdmin={isAdmin} />
    </>
  );
}
