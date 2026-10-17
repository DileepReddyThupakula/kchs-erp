import { redirect } from "next/navigation";
import { Megaphone, Star } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSchoolSettings } from "@/lib/settings";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getDiaryCardSchool } from "@/features/notices/card-school";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { AttachmentsPanel } from "@/components/notices/attachments-panel";
import { CircularSheet } from "@/components/notices/circular-sheet";
import { NoticeActions, ReadersCard } from "@/components/notices/notices-ui";
import { NoticeSend } from "@/components/notices/notice-send";
import { TeStatusRow } from "@/components/notices/te-status";
import { circularData } from "@/features/notices/circular";
import { getAudienceText, signedLinks } from "@/features/notices/queries";
import { fmtShort, isParentsAudience, noticeState, noticeWhatsApp } from "@/features/notices/shared";
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
  const [audience, { data: files }, { data: mine }, settings, school] = await Promise.all([
    getAudienceText(supabase, [n]),
    supabase.from("notice_attachments").select("id, file_path, file_name, mime_type, size_bytes").eq("notice_id", id),
    supabase.from("notice_reads").select("read_at").eq("notice_id", id).eq("staff_id", me.staffId).maybeSingle(),
    getSchoolSettings(),
    getReceiptSchool(),
  ]);
  const audienceLine = audience.get(n.id) ?? "";
  const parents = isParentsAudience(n.audience);
  const readers = isAdmin && n.status === "published" ? ((await supabase.rpc("notice_readers", { p_notice: id })).data ?? []) : null;
  const links = await signedLinks(supabase, "notice-files", files ?? []);
  const data = circularData(n, school, audienceLine);
  const text = noticeWhatsApp({ school: settings?.name ?? "School", circularNo: n.circular_no, date: n.publish_date, title: n.title, body: n.body, titleTe: n.title_te, bodyTe: n.body_te, audienceLine });
  const canSend = canEdit && n.status === "published" && !n.archived_at;
  const groups = canSend ? ((await supabase.rpc("notice_send_list", { p_notice: id })).data ?? []) : [];
  const cardSchool = await getDiaryCardSchool();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Notices", href: "/notices" }, { label: n.circular_no ?? "Draft" }]}
        icon={<Megaphone />}
        title={n.title}
        description={`${n.circular_no ? `Circular ${n.circular_no} · ` : "Draft · "}${fmtShort(n.publish_date)}${n.expires_on ? ` · expires ${fmtShort(n.expires_on)}` : ""}`}
        actions={
          <>
            {parents && <Badge tone="gold">Sent to parents</Badge>}
            {n.important && (
              <Badge tone="gold">
                <Star className="size-3 fill-current" /> Important
              </Badge>
            )}
            <Badge tone={state === "active" ? "success" : state === "draft" ? "warning" : "neutral"}>{{ draft: "Draft", scheduled: "Scheduled", active: "Published", expired: "Expired", archived: "Archived" }[state]}</Badge>
          </>
        }
      />
      {parents && (
        <p className="mb-3 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-navy-900">
          This notice is written for parents and students. Parents have no login: it reaches them only by print or WhatsApp, sent by the school office.
          {!canEdit && " You can read it here so you know what parents were told."}
        </p>
      )}
      <div className="mb-4">
        <NoticeActions id={id} state={state} canEdit={canEdit} isAdmin={isAdmin} iRead={!!mine}>
          {canSend && <NoticeSend noticeId={id} data={data} cardSchool={cardSchool} text={text} groups={groups.map((g) => ({ key: g.group_key, label: g.group_label, status: g.status, openedBy: g.opened_by_name, openedAt: g.opened_at, markedBy: g.marked_by_name, markedAt: g.marked_at }))} date={n.publish_date} />}
        </NoticeActions>
        {canSend && groups.length > 0 && <p className="mt-1 text-sm text-muted">Sent to {groups.filter((g) => g.status === "marked_sent").length} of {groups.length} group{groups.length === 1 ? "" : "s"} (as marked by the office)</p>}
      </div>
      {canEdit && n.status === "published" && <TeStatusRow id={id} status={n.te_status} hasTe={!!n.body_te} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="overflow-x-auto rounded-lg border border-border bg-neutral-100 p-3">
          <div className="mx-auto shadow-md" style={{ width: "210mm" }}>
            <CircularSheet data={data} layout="a4" />
          </div>
        </div>
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
