"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, ClipboardCopy, Eye, Pencil, Printer, RotateCcw, Send, Star } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { archiveNotice, markNoticeRead, publishNotice } from "@/features/notices/actions";
import { AUDIENCE_LABEL, fmtShort } from "@/features/notices/shared";

export type NoticeState = "draft" | "scheduled" | "active" | "expired" | "archived";
export type NoticeItem = {
  id: string;
  title: string;
  circularNo: string | null;
  audience: keyof typeof AUDIENCE_LABEL;
  audienceText: string;
  publishDate: string;
  expiresOn: string | null;
  important: boolean;
  state: NoticeState;
  readCount: number | null; // Admin only
  total: number | null;
  iRead: boolean;
};
const STATE_TEXT: Record<NoticeState, string> = { draft: "Draft", scheduled: "Scheduled", active: "Published", expired: "Expired", archived: "Archived" };
const STATE_TONE = { draft: "warning", scheduled: "info", active: "success", expired: "neutral", archived: "neutral" } as const;

function useRun() {
  const router = useRouter();
  return async (p: Promise<{ ok: boolean; message?: string; error?: string }>) => {
    const r = await p;
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.message ?? "Done.");
      router.refresh();
    }
    return r.ok;
  };
}

export function NoticesTable({ rows, canEdit, isAdmin }: { rows: NoticeItem[]; canEdit: boolean; isAdmin: boolean }) {
  const run = useRun();
  const cols: Column<NoticeItem>[] = [
    {
      id: "title",
      header: "Notice",
      hideable: false,
      pinned: "left",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-navy-900">
          {r.important && <Star className="size-4 shrink-0 fill-gold-400 text-gold-600" aria-label="Important" />}
          <span className="max-w-xs truncate">{r.title}</span>
        </span>
      ),
      sortValue: (r) => r.title,
      exportValue: (r) => r.title,
    },
    { id: "no", header: "Circular no", cell: (r) => <span className="font-mono text-xs">{r.circularNo ?? "—"}</span>, sortValue: (r) => r.circularNo ?? "", exportValue: (r) => r.circularNo ?? "" },
    { id: "audience", header: "For", cell: (r) => <span className="line-clamp-1 max-w-48">{r.audienceText}</span>, sortValue: (r) => r.audienceText, exportValue: (r) => r.audienceText },
    { id: "date", header: "Publish date", cell: (r) => fmtShort(r.publishDate), sortValue: (r) => r.publishDate, exportValue: (r) => r.publishDate },
    { id: "expires", header: "Expires", cell: (r) => (r.expiresOn ? fmtShort(r.expiresOn) : <span className="text-muted">—</span>), sortValue: (r) => r.expiresOn ?? "9999", exportValue: (r) => r.expiresOn ?? "" },
    { id: "state", header: "Status", cell: (r) => <Badge tone={STATE_TONE[r.state]}>{STATE_TEXT[r.state]}</Badge>, sortValue: (r) => r.state, exportValue: (r) => STATE_TEXT[r.state] },
    isAdmin
      ? { id: "read", header: "Read by", align: "right", cell: (r) => (r.total == null ? "—" : `${r.readCount} of ${r.total}`), sortValue: (r) => r.readCount ?? -1, exportValue: (r) => (r.total == null ? "" : `${r.readCount}/${r.total}`) }
      : { id: "read", header: "Read", cell: (r) => (r.iRead ? <Badge tone="success">Read</Badge> : r.state === "active" ? <Badge tone="warning">Unread</Badge> : "—"), sortValue: (r) => (r.iRead ? 1 : 0), exportValue: (r) => (r.iRead ? "Read" : "Unread") },
  ];
  return (
    <DataTable
      id="notices-table"
      rows={rows}
      columns={cols}
      getRowId={(r) => r.id}
      searchText={(r) => `${r.title} ${r.circularNo ?? ""} ${r.audienceText}`}
      filters={[
        { id: "audience", label: "Audience", options: Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label })), match: (r, v) => r.audience === v },
        { id: "status", label: "Status", options: Object.entries(STATE_TEXT).filter(([k]) => isAdmin || k !== "archived").map(([value, label]) => ({ value, label })), match: (r, v) => r.state === v },
        { id: "important", label: "Important", options: [{ value: "yes", label: "Important only" }, { value: "no", label: "Not important" }], match: (r, v) => (v === "yes") === r.important },
      ]}
      pageSize={25}
      exportName="notices"
      rowLabel={(r) => r.title}
      rowHref={(r) => `/notices/${r.id}`}
      rowActions={(r) => [
        { id: "view", kind: "view", label: "Open", icon: Eye, href: `/notices/${r.id}` },
        ...(canEdit && r.state !== "archived" ? [{ id: "edit", kind: "edit" as const, label: "Edit", href: `/notices/${r.id}/edit` }] : []),
        { id: "print", kind: "menu", label: "Print circular", icon: Printer, href: `/print/notice/${r.id}` },
        ...(canEdit && r.state === "draft" ? [{ id: "publish", kind: "menu" as const, label: "Publish", icon: Send, onClick: () => void run(publishNotice(r.id)) }] : []),
        ...(isAdmin
          ? [
              r.state === "archived"
                ? { id: "restore", kind: "menu" as const, label: "Restore", icon: RotateCcw, onClick: () => void run(archiveNotice(r.id, false)) }
                : { id: "archive", kind: "menu" as const, label: "Archive", icon: Archive, tone: "danger" as const, confirm: { title: "Archive this notice?", message: "It disappears for everyone except Admin. You can restore it.", confirmLabel: "Archive", danger: true }, onClick: () => void run(archiveNotice(r.id, true)) },
            ]
          : []),
      ]}
      emptyTitle="No notices"
      emptyMessage={canEdit ? "Create the first notice with “New notice”." : "There are no notices for you right now."}
    />
  );
}

/** Buttons on the notice page. */
export function NoticeActions({ id, state, canEdit, isAdmin, iRead, whatsapp }: { id: string; state: NoticeState; canEdit: boolean; isAdmin: boolean; iRead: boolean; whatsapp: string }) {
  const run = useRun();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "active" && (
        <Button
          variant={iRead ? "secondary" : "primary"}
          disabled={iRead || busy}
          onClick={async () => {
            setBusy(true);
            await run(markNoticeRead(id));
            setBusy(false);
          }}
        >
          <Check className="size-4" /> {iRead ? "You have read this" : "Mark as read"}
        </Button>
      )}
      {canEdit && state === "draft" && (
        <Button onClick={() => run(publishNotice(id))}>
          <Send className="size-4" /> Publish
        </Button>
      )}
      {canEdit && state !== "archived" && (
        <Link href={`/notices/${id}/edit`} className={buttonClasses("secondary")}>
          <Pencil className="size-4" aria-hidden /> Edit
        </Link>
      )}
      <Link href={`/print/notice/${id}`} target="_blank" className={buttonClasses("secondary")}>
        <Printer className="size-4" aria-hidden /> Print circular
      </Link>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(whatsapp);
            toast.success("Copied. Paste it into WhatsApp.");
          } catch {
            window.prompt("Copy this text:", whatsapp);
          }
        }}
      >
        <ClipboardCopy className="size-4" /> Copy for WhatsApp
      </Button>
      {isAdmin &&
        (state === "archived" ? (
          <Button variant="secondary" onClick={() => run(archiveNotice(id, false))}>
            <RotateCcw className="size-4" /> Restore
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => run(archiveNotice(id, true))}>
            <Archive className="size-4" /> Archive
          </Button>
        ))}
    </div>
  );
}

export function ReadersCard({ readers }: { readers: { name: string; designation: string; readAt: string | null }[] }) {
  const read = readers.filter((r) => r.readAt);
  const unread = readers.filter((r) => !r.readAt);
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold text-navy-900">
        Read by {read.length} of {readers.length}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-peacock-700">Read ({read.length})</p>
          <ul className="space-y-0.5 text-sm">
            {read.map((r) => (
              <li key={r.name}>
                {r.name} <span className="text-xs text-muted">· {new Date(r.readAt!).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}</span>
              </li>
            ))}
            {!read.length && <li className="text-muted">Nobody yet.</li>}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Not read ({unread.length})</p>
          <ul className="space-y-0.5 text-sm">
            {unread.map((r) => (
              <li key={r.name}>
                {r.name} <span className="text-xs text-muted">{r.designation}</span>
              </li>
            ))}
            {!unread.length && <li className="text-muted">Everyone has read it.</li>}
          </ul>
        </div>
      </div>
      <p className="text-xs text-muted">Only active staff with a login are counted.</p>
    </Card>
  );
}
