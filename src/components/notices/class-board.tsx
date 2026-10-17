"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Eye, Send } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { publishAllComplete, publishClassDiary } from "@/features/notices/actions";
import type { BoardRow, BoardState } from "@/features/notices/diary-workflow";

const STATE_TEXT: Record<BoardState, string> = { none: "No diary expected", waiting: "Waiting for teachers", ready: "Ready to publish", published: "Published" };
const STATE_TONE = { none: "neutral", waiting: "warning", ready: "info", published: "success" } as const;

export function ClassBoard({ rows, date, deadline }: { rows: BoardRow[]; date: string; deadline: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const late = rows.filter((r) => r.late).length;
  const ready = rows.filter((r) => r.state === "ready" && r.submitted >= r.expected).length;
  async function run(p: Promise<{ ok: boolean; message?: string; error?: string }>) {
    const r = await p;
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.message ?? "Done.");
      router.refresh();
    }
  }
  const cols: Column<BoardRow>[] = [
    { id: "class", header: "Class", hideable: false, pinned: "left", cell: (r) => <span className="whitespace-nowrap font-medium text-navy-900">{r.label}</span>, sortValue: (r) => r.label, exportValue: (r) => r.label },
    { id: "in", header: "Subjects in", cell: (r) => (r.expected ? <span className="tabular-nums">{r.submitted} of {r.expected}{r.skipped ? <span className="text-xs text-muted"> ({r.skipped} skipped)</span> : null}</span> : <span className="text-muted">—</span>), sortValue: (r) => (r.expected ? r.submitted / r.expected : 2), exportValue: (r) => `${r.submitted}/${r.expected}` },
    { id: "state", header: "Status", cell: (r) => <Badge tone={STATE_TONE[r.state]}>{STATE_TEXT[r.state]}</Badge>, sortValue: (r) => r.state, exportValue: (r) => STATE_TEXT[r.state] },
    {
      id: "late",
      header: "Late?",
      cell: (r) =>
        r.late ? (
          <Badge tone="danger">
            <AlertTriangle className="size-3" /> Late
          </Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortValue: (r) => (r.late ? 0 : 1),
      exportValue: (r) => (r.late ? "Late" : ""),
    },
    { id: "pending", header: "Waiting to publish", cell: (r) => (r.pending ? r.pending : "—"), sortValue: (r) => r.pending, exportValue: (r) => r.pending },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">
          {rows.filter((r) => r.state === "published").length} published · {ready} ready · {late ? <b className="text-red-700">{late} late</b> : "none late"} · deadline {deadline.slice(0, 5)}
        </span>
        <span className="flex-1" />
        <ConfirmDialog
          tone="primary"
          title="Publish all complete classes?"
          message="Every class whose expected subjects are all submitted is published now. Classes with missing subjects are left alone."
          confirmLabel="Publish"
          trigger={(open) => (
            <Button size="sm" disabled={busy || ready === 0} onClick={open}>
              <Check className="size-4" /> Publish all complete classes
            </Button>
          )}
          onConfirm={async () => {
            setBusy(true);
            await run(publishAllComplete(date));
            setBusy(false);
          }}
        />
      </div>
      <DataTable
        id="class-diary-board"
        rows={rows}
        columns={cols}
        getRowId={(r) => r.sectionId}
        searchText={(r) => r.label}
        filters={[
          { id: "state", label: "Status", options: Object.entries(STATE_TEXT).map(([value, label]) => ({ value, label })), match: (r, v) => r.state === v },
          { id: "late", label: "Late", options: [{ value: "late", label: "Late only" }], match: (r) => r.late },
        ]}
        pageSize={40}
        exportName={`class-diary-${date}`}
        rowLabel={(r) => r.label}
        rowHref={(r) => `/diary/class/${r.sectionId}?date=${date}`}
        rowActions={(r) => [
          { id: "open", kind: "view", label: "Open class", icon: Eye, href: `/diary/class/${r.sectionId}?date=${date}` },
          ...(r.state === "ready" ? [{ id: "pub", kind: "menu" as const, label: "Publish", icon: Check, onClick: () => void run(publishClassDiary(r.sectionId, date)) }] : []),
          ...(r.state === "published" ? [{ id: "send", kind: "menu" as const, label: "Send on WhatsApp", icon: Send, href: `/diary/class/${r.sectionId}?date=${date}&send=1` }] : []),
        ]}
        emptyTitle="No classes"
        emptyMessage="There are no sections in the current academic year."
      />
    </div>
  );
}
