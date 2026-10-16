import { redirect } from "next/navigation";
import { Megaphone, Star } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSchoolSettings } from "@/lib/settings";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { AttachmentsPanel } from "@/components/notices/attachments-panel";
import { NoticeActions, ReadersCard } from "@/components/notices/notices-ui";
import { getAudienceText, signedLinks } from "@/features/notices/queries";
import { fmtShort, noticeState, noticeWhatsApp } from "@/features/notices/shared";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Notice" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePage("/notices");
  const supabase = await createClient();
  const { data: n } = await supabase.from("notices").select("*").eq("id", id).maybeSingle(); // RLS: audience / drafts / expiry
  if (!n) redirect("/not-allowed");
  const canEdit = can(me, "notices.edit");
  const isAdmin = me.role === "admin";
  const today = todayIst();
  const state = noticeState(n, today);
  const [audience, { data: files }, { data: mine }, settings] = await Promise.all([
    getAudienceText(supabase, [n]),
    supabase.from("notice_attachments").select("id, file_path, file_name, mime_type, size_bytes").eq("notice_id", id),
    supabase.from("notice_reads").select("read_at").eq("notice_id", id).eq("staff_id", me.staffId).maybeSingle(),
    getSchoolSettings(),
  ]);
  const audienceLine = audience.get(n.id) ?? "";
  const readers = isAdmin && n.status === "published" ? ((await supabase.rpc("notice_readers", { p_notice: id })).data ?? []) : null;
  const links = await signedLinks(supabase, "notice-files", files ?? []);
  const wa = noticeWhatsApp({ school: settings?.name ?? "School", circularNo: n.circular_no, date: n.publish_date, title: n.title, body: n.body, audienceLine });
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Notices", href: "/notices" }, { label: n.circular_no ?? "Draft" }]}
        icon={<Megaphone />}
        title={n.title}
        description={`${n.circular_no ? `Circular ${n.circular_no} · ` : "Draft · "}${fmtShort(n.publish_date)}${n.expires_on ? ` · expires ${fmtShort(n.expires_on)}` : ""}`}
        actions={
          <>
            {n.important && (
              <Badge tone="gold">
                <Star className="size-3 fill-current" /> Important
              </Badge>
            )}
            <Badge tone={state === "active" ? "success" : state === "draft" ? "warning" : "neutral"}>{{ draft: "Draft", scheduled: "Scheduled", active: "Published", expired: "Expired", archived: "Archived" }[state]}</Badge>
          </>
        }
      />
      <div className="mb-4">
        <NoticeActions id={id} state={state} canEdit={canEdit} isAdmin={isAdmin} iRead={!!mine} whatsapp={wa} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{n.body}</p>
          <p className="mt-4 border-t border-border pt-2 text-sm text-muted">
            <b className="text-navy-900">For:</b> {audienceLine}
          </p>
        </Card>
        <div className="space-y-4">
          <Card>
            <AttachmentsPanel kind="notice" parentId={id} files={links} canEdit={false} />
          </Card>
          {mine && <p className="text-sm text-peacock-700">You marked this as read on {fmtShort(mine.read_at.slice(0, 10))}.</p>}
        </div>
      </div>
      {readers && (
        <div className="mt-4">
          <ReadersCard readers={readers.map((r) => ({ name: r.full_name, designation: r.designation ?? "", readAt: r.read_at }))} />
        </div>
      )}
    </>
  );
}
