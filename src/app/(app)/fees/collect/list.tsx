"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CheckCircle2, FilePlus2, Printer, Wallet } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import type { PickerStudent } from "@/components/fees/student-picker";
import type { QrSettings } from "@/components/fees/upi-qr-dialog";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { filterCollectRows, summarize, type CollectRow, type CollectShow } from "@/features/fees/collect-list";
import { Receipt, type ReceiptSchool } from "@/components/fees/receipt";
import type { ReceiptDetail } from "@/features/fees/queries";
import { MiscModal } from "./misc-modal";

type Opt = { id: string; label: string; classId: string };

/** Class-wise list: students with pending dues first, largest balance on top. */
export function CollectList({
  rows,
  classes,
  sections,
  classId,
  sectionId,
  show,
  saved,
  savedReceipt,
  isAdmin,
  pickerStudents,
  miscHeads,
  qr,
  requireUpiRef,
}: {
  rows: CollectRow[];
  classes: { id: string; name: string }[];
  sections: Opt[];
  classId: string;
  sectionId: string;
  show: CollectShow;
  saved: { id: string; no: string; amount: number; name: string } | null;
  savedReceipt: { data: ReceiptDetail; school: ReceiptSchool } | null;
  isAdmin: boolean;
  pickerStudents: PickerStudent[];
  miscHeads: { id: string; name: string }[];
  qr: QrSettings;
  requireUpiRef: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const [miscOpen, setMiscOpen] = useState(false);

  const go = (next: { classId?: string; sectionId?: string; show?: CollectShow }) => {
    const q = new URLSearchParams();
    const c = next.classId ?? classId;
    const s = next.classId !== undefined ? "" : (next.sectionId ?? sectionId);
    const sh = next.show ?? show;
    if (c) q.set("class", c);
    if (s) q.set("section", s);
    if (sh !== "pending") q.set("show", sh);
    router.replace(`${path}${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  const shown = useMemo(() => filterCollectRows(rows, { classId, sectionId, show }), [rows, classId, sectionId, show]);
  const stats = useMemo(() => summarize(filterCollectRows(rows, { classId, sectionId, show: "all" })), [rows, classId, sectionId]);
  const backQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (classId) q.set("class", classId);
    if (sectionId) q.set("section", sectionId);
    if (show !== "pending") q.set("show", show);
    return q.toString();
  }, [classId, sectionId, show]);
  const collectHref = (id: string) => `/fees/collect?student=${id}${backQuery ? `&${backQuery}` : ""}`;

  const columns: Column<CollectRow>[] = useMemo(
    () => [
      {
        id: "student",
        header: "Student",
        hideable: false,
        pinned: "left",
        className: "whitespace-nowrap",
        cell: (r) => (
          <Link href={collectHref(r.studentId)} className="font-medium text-navy-800 hover:underline">
            {r.name}
          </Link>
        ),
        sortValue: (r) => r.name,
        exportValue: (r) => r.name,
      },
      { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.adm}</span>, sortValue: (r) => r.adm },
      { id: "class", header: "Class", className: "whitespace-nowrap", cell: (r) => r.classLabel, sortValue: (r) => r.classOrder },
      { id: "roll", header: "Roll", align: "right", cell: (r) => r.roll ?? "—", sortValue: (r) => r.roll ?? 9999 },
      { id: "phone", header: "Phone", className: "whitespace-nowrap", cell: (r) => r.phone ?? "—", sortValue: (r) => r.phone ?? "", defaultHidden: true },
      {
        id: "due",
        header: "Total due",
        align: "right",
        className: "whitespace-nowrap",
        cell: (r) => (r.totalDue ? <span className="font-semibold tabular-nums text-navy-900">{formatPaise(r.totalDue)}</span> : <span className="text-peacock-700">Paid up</span>),
        sortValue: (r) => r.totalDue,
        exportValue: (r) => r.totalDue / 100,
      },
      {
        id: "overdue",
        header: "Overdue",
        align: "right",
        className: "whitespace-nowrap",
        cell: (r) => (r.overdue ? <span className="font-medium tabular-nums text-red-700">{formatPaise(r.overdue)}</span> : <span className="text-muted">—</span>),
        sortValue: (r) => r.overdue,
        exportValue: (r) => r.overdue / 100,
      },
      { id: "last", header: "Last payment", className: "whitespace-nowrap", cell: (r) => (r.lastPayment ? formatDate(r.lastPayment) : <span className="text-muted">None yet</span>), sortValue: (r) => r.lastPayment ?? "", exportValue: (r) => r.lastPayment ?? "" },
    ],
    // collectHref depends on backQuery only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backQuery],
  );
  const actions = useMemo(
    () =>
      (r: CollectRow): RowAction[] => [{ id: "collect", kind: "view", label: "Collect", icon: Wallet, href: collectHref(r.studentId) }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backQuery],
  );
  const sectionOptions = sections.filter((s) => !classId || s.classId === classId);
  const className = classes.find((c) => c.id === classId)?.name;

  return (
    <div className="space-y-4">
      {saved && (
        <Card className="border-peacock-200 bg-peacock-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-medium text-peacock-800">
              <CheckCircle2 className="size-5" aria-hidden /> Saved: receipt {saved.no} for {formatPaise(saved.amount)} from {saved.name}
            </p>
            <div className="flex gap-2">
              <Link href={`/print/receipt/${saved.id}?copy=original`} target="_blank" className={buttonClasses("primary")}>
                <Printer className="size-4" aria-hidden /> Print receipt
              </Link>
              <Link href={`/fees/receipts/${saved.id}`} className={buttonClasses("secondary")}>
                View
              </Link>
            </div>
          </div>
          {savedReceipt && (
            <div className="mt-4 overflow-x-auto rounded-lg bg-neutral-200/70 p-3 sm:p-5">
              <div className="mx-auto w-fit shadow-[0_6px_20px_rgba(1,26,55,0.15)]">
                <Receipt data={savedReceipt.data} school={savedReceipt.school} duplicate={false} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* class / section / show pickers + summary */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">
            Class
            <Select aria-label="Class" value={classId} onChange={(e) => go({ classId: e.target.value })} className="mt-0.5 w-44">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-muted">
            Section
            <Select aria-label="Section" value={sectionId} onChange={(e) => go({ sectionId: e.target.value })} className="mt-0.5 w-40" disabled={!sectionOptions.length}>
              <option value="">All sections</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="inline-flex rounded-lg border border-border bg-surface p-1 text-sm shadow-sm" role="group" aria-label="Show">
            {([
              ["pending", "Pending dues"],
              ["overdue", "Overdue only"],
              ["all", "All students"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={show === v}
                onClick={() => go({ show: v })}
                className={`rounded-md px-3 py-1.5 transition-colors ${show === v ? "bg-navy-900 font-medium text-gold-400" : "text-navy-800 hover:bg-navy-50"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Button variant="secondary" className="ml-auto" onClick={() => setMiscOpen(true)}>
              <FilePlus2 className="size-4" /> Miscellaneous receipt
            </Button>
          )}
        </div>
        <p className="text-sm text-foreground" aria-live="polite">
          <span className="font-semibold tabular-nums">{stats.students}</span> student{stats.students === 1 ? "" : "s"} with pending dues
          {className ? ` in ${className}${sectionId ? ` – ${sectionOptions.find((s) => s.id === sectionId)?.label.split("–").pop()?.trim() ?? ""}` : ""}` : " in all classes"} · total outstanding{" "}
          <span className="font-semibold tabular-nums text-navy-900">{formatPaise(stats.outstanding)}</span>
          {stats.overdue > 0 && (
            <>
              {" "}
              · overdue <span className="font-semibold tabular-nums text-red-700">{formatPaise(stats.overdue)}</span>
            </>
          )}
        </p>
      </Card>

      <DataTable
        id="collect-list"
        rows={shown}
        columns={columns}
        getRowId={(r) => r.studentId}
        searchText={(r) => `${r.name} ${r.adm} ${r.phone ?? ""}`}
        searchPlaceholder="Search name, admission no or phone…"
        pageSize={50}
        rowActions={actions}
        rowHref={(r) => collectHref(r.studentId)}
        rowLabel={(r) => r.name}
        exportName="fees-class-list"
        emptyTitle={show === "all" ? "No students here" : "No pending dues"}
        emptyMessage={show === "all" ? "No students match this class and section." : "Everyone in this selection is paid up. Switch to “All students” to see them."}
      />

      {isAdmin && <MiscModal open={miscOpen} onClose={() => setMiscOpen(false)} heads={miscHeads} students={pickerStudents} qr={qr} requireUpiRef={requireUpiRef} />}
    </div>
  );
}
