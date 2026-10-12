"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, XCircle } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, StatusChip } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { cancelReceiptAction } from "@/features/fees/actions";
import { MODE_LABEL } from "@/features/fees/shared";
import type { ReceiptRow } from "@/features/fees/queries";

export function ReceiptsTable({ rows, canCancel, classes, rangeLabel }: { rows: ReceiptRow[]; canCancel: boolean; classes: { id: string; name: string }[]; rangeLabel: string }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<ReceiptRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const collectors = [...new Map(rows.map((r) => [r.collectedById, r.collectedBy])).entries()];

  const columns: Column<ReceiptRow>[] = [
    {
      id: "no",
      header: "Receipt no",
      hideable: false,
      pinned: "left",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Link href={`/fees/receipts/${r.id}`} className={r.status === "cancelled" ? "font-mono text-xs text-red-700 line-through hover:underline" : "font-mono text-xs font-medium text-navy-800 hover:underline"}>
          {r.receiptNo}
        </Link>
      ),
      sortValue: (r) => r.receiptNo,
      exportValue: (r) => r.receiptNo,
    },
    { id: "date", header: "Date", className: "whitespace-nowrap", cell: (r) => formatDate(r.date), sortValue: (r) => r.date, exportValue: (r) => r.date },
    {
      id: "student",
      header: "Student / payer",
      className: "whitespace-nowrap",
      cell: (r) => (
        <span>
          {r.studentName} {r.kind === "misc" && <Badge tone="gold" className="ml-1">Miscellaneous</Badge>}
        </span>
      ),
      sortValue: (r) => r.studentName,
      exportValue: (r) => r.studentName,
    },
    { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.admissionNo ?? "—"}</span>, sortValue: (r) => r.admissionNo ?? "" },
    { id: "class", header: "Class", className: "whitespace-nowrap", cell: (r) => r.className ?? "—", sortValue: (r) => r.className ?? "" },
    {
      id: "heads",
      header: "Fee heads",
      cell: (r) => (
        <span className="text-xs">
          {r.heads.map((h) => h.headName).join(", ") || "—"}
        </span>
      ),
      exportValue: (r) => r.heads.map((h) => h.headName).join(", "),
      defaultHidden: true,
    },
    { id: "amount", header: "Amount", align: "right", className: "whitespace-nowrap", cell: (r) => <span className="font-semibold tabular-nums">{formatPaise(r.total)}</span>, sortValue: (r) => r.total, exportValue: (r) => r.total / 100 },
    { id: "mode", header: "Mode", className: "whitespace-nowrap", cell: (r) => MODE_LABEL[r.mode], sortValue: (r) => r.mode, exportValue: (r) => MODE_LABEL[r.mode] },
    { id: "ref", header: "Reference", cell: (r) => <span className="font-mono text-xs">{r.reference ?? "—"}</span>, exportValue: (r) => r.reference ?? "" },
    { id: "by", header: "Collected by", className: "whitespace-nowrap", cell: (r) => r.collectedBy, sortValue: (r) => r.collectedBy },
    {
      id: "status",
      header: "Status",
      cell: (r) => (r.status === "cancelled" ? <StatusChip status="left" label="Cancelled" /> : <StatusChip status="active" label="Valid" />),
      sortValue: (r) => r.status,
      exportValue: (r) => (r.status === "cancelled" ? `Cancelled: ${r.cancelReason ?? ""}` : "Valid"),
    },
  ];

  const actions = (r: ReceiptRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", href: `/fees/receipts/${r.id}` },
    { id: "print", kind: "edit", label: "Print duplicate", href: `/print/receipt/${r.id}?copy=duplicate` },
    ...(canCancel && r.status === "valid"
      ? ([{ id: "cancel", kind: "menu", label: "Cancel receipt", icon: XCircle, tone: "danger", onClick: () => { setReason(""); setCancelling(r); } }] satisfies RowAction[])
      : []),
  ];

  return (
    <>
      <DataTable
        id="receipts"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.receiptNo} ${r.studentName} ${r.admissionNo ?? ""} ${r.reference ?? ""}`}
        searchPlaceholder="Search receipt no, student, reference…"
        filters={[
          { id: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })), match: (r, v) => r.classId === v },
          { id: "mode", label: "Mode", options: Object.entries(MODE_LABEL).map(([value, label]) => ({ value, label })), match: (r, v) => r.mode === v },
          { id: "by", label: "Collected by", options: collectors.map(([value, label]) => ({ value, label })), match: (r, v) => r.collectedById === v },
          { id: "status", label: "Status", options: [{ value: "valid", label: "Valid" }, { value: "cancelled", label: "Cancelled" }], match: (r, v) => r.status === v },
          { id: "kind", label: "Type", options: [{ value: "dues", label: "Fee payments" }, { value: "misc", label: "Miscellaneous" }], match: (r, v) => r.kind === v },
        ]}
        pageSize={50}
        rowActions={actions}
        rowHref={(r) => `/fees/receipts/${r.id}`}
        rowLabel={(r) => r.receiptNo}
        exportName={`receipts-${rangeLabel}`}
        emptyTitle="No receipts in this period"
        emptyMessage="Change the dates above, or collect a fee."
      />
      <p className="mt-2 text-xs text-muted">
        <Printer className="mr-1 inline size-3.5" aria-hidden />
        Printing from here marks the page “Duplicate copy”. Cancelled receipts keep their number.
      </p>
      <Modal
        open={!!cancelling}
        onClose={() => !busy && setCancelling(null)}
        title={`Cancel receipt ${cancelling?.receiptNo ?? ""}?`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (!cancelling) return;
                setBusy(true);
                const res = await cancelReceiptAction(cancelling.id, reason);
                setBusy(false);
                if (res.error) return toast.error(res.error);
                toast.success(res.message);
                setCancelling(null);
                router.refresh();
              }}
            >
              Cancel receipt
            </Button>
          </>
        }
      >
        <p className="mb-3">
          {cancelling && formatPaise(cancelling.total)} paid by {cancelling?.studentName}. The dues go back to unpaid; the receipt number stays visible as cancelled.
        </p>
        <Field label="Reason" name="cancel-reason">
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered for the wrong student" />
        </Field>
      </Modal>
    </>
  );
}
