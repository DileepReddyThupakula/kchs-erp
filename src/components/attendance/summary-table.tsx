"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { exportSheets } from "@/lib/export";
import { fmtDays } from "@/features/attendance/shared";

export type SummaryRow = { studentId: string; roll: number | null; name: string; admissionNo: string; working: number; present: number; absent: number; unmarked: number; pct: number | null };
type Month = { label: string; key: string; rows: Record<string, { working: number; present: number }> };

/** Year summary: working / present / absent days per student for a section and a date range. */
export function SummaryPanel({
  sections,
  sectionId,
  sectionLabel,
  from,
  to,
  rows,
  months,
  yearName,
}: {
  sections: { id: string; label: string }[];
  sectionId: string;
  sectionLabel: string;
  from: string;
  to: string;
  rows: SummaryRow[];
  months: Month[];
  yearName: string;
}) {
  const router = useRouter();
  const [sec, setSec] = useState(sectionId);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const unmarked = rows.reduce((a, r) => a + r.unmarked, 0);

  const cols: Column<SummaryRow>[] = [
    { id: "name", header: "Student", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name, className: "whitespace-nowrap", exportValue: (r) => r.name },
    { id: "roll", header: "Roll", align: "right", cell: (r) => r.roll ?? "", sortValue: (r) => r.roll ?? 9999, exportValue: (r) => r.roll ?? "" },
    { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.admissionNo}</span>, sortValue: (r) => r.admissionNo, exportValue: (r) => r.admissionNo },
    { id: "working", header: "Working days", align: "right", hideable: false, cell: (r) => fmtDays(r.working), sortValue: (r) => r.working, exportValue: (r) => r.working },
    { id: "present", header: "Days present", align: "right", hideable: false, cell: (r) => <b>{fmtDays(r.present)}</b>, sortValue: (r) => r.present, exportValue: (r) => r.present },
    { id: "absent", header: "Days absent", align: "right", hideable: false, cell: (r) => fmtDays(r.absent), sortValue: (r) => r.absent, exportValue: (r) => r.absent },
    { id: "unmarked", header: "Unmarked sessions", align: "right", cell: (r) => (r.unmarked ? <b className="text-amber-800">{r.unmarked}</b> : 0), sortValue: (r) => r.unmarked, exportValue: (r) => r.unmarked },
    { id: "pct", header: "%", align: "right", hideable: false, cell: (r) => (r.pct == null ? "—" : <b>{r.pct.toFixed(1)}%</b>), sortValue: (r) => r.pct ?? -1, exportValue: (r) => (r.pct == null ? "" : r.pct) },
  ];

  async function excel() {
    await exportSheets(`attendance-summary-${sectionLabel}`, "xlsx", [
      {
        name: "Summary",
        headers: ["Roll", "Student", "Adm no", "Working days", "Days present", "Days absent", "Unmarked sessions", "%"],
        rows: rows.map((r) => [r.roll ?? "", r.name, r.admissionNo, r.working, r.present, r.absent, r.unmarked, r.pct ?? ""]),
        widths: [6, 28, 14, 14, 14, 14, 18, 8],
      },
      {
        name: "By month",
        headers: ["Roll", "Student", ...months.flatMap((m) => [`${m.label} working`, `${m.label} present`])],
        rows: rows.map((r) => [r.roll ?? "", r.name, ...months.flatMap((m) => [m.rows[r.studentId]?.working ?? "", m.rows[r.studentId]?.present ?? ""])]),
        widths: [6, 28, ...months.flatMap(() => [16, 16])],
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/attendance/reports?tab=summary&section=${sec}&from=${f}&to=${t}`);
        }}
      >
        <Field label="Class and section" name="sum-sec">
          <Select id="sum-sec" value={sec} onChange={(e) => setSec(e.target.value)} className="min-w-44">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" name="sum-from">
          <Input id="sum-from" type="date" value={f} onChange={(e) => setF(e.target.value)} className="w-44" />
        </Field>
        <Field label="To" name="sum-to">
          <Input id="sum-to" type="date" value={t} onChange={(e) => setT(e.target.value)} className="w-44" />
        </Field>
        <Button type="submit">Show</Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={excel}>
            <FileSpreadsheet className="size-4" /> Excel (with months)
          </Button>
          <Link
            href={`/print/attendance/summary?section=${sectionId}&from=${from}&to=${to}`}
            target="_blank"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-navy-800 hover:bg-navy-50"
          >
            <Printer className="size-4" aria-hidden /> Print
          </Link>
        </div>
      </form>
      <p className="text-sm text-muted">
        {sectionLabel} · {from} to {to} ({yearName}). Working days: Mon–Sat without holidays and 2nd Saturdays, from each student&apos;s admission date to their leaving date. Days present: half a day for each attended session (Present or Late).
      </p>
      {unmarked > 0 && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Warning: {unmarked} student sessions in this range are not marked, so the figures are incomplete.
        </p>
      )}
      <DataTable
        id="attendance-summary"
        rows={rows}
        columns={cols}
        getRowId={(r) => r.studentId}
        searchText={(r) => `${r.name} ${r.admissionNo}`}
        pageSize={60}
        exportName={`attendance-summary-${sectionLabel}`}
        rowLabel={(r) => r.name}
        rowActions={(r) => [{ id: "view", kind: "view", label: "Student attendance", href: `/students/${r.studentId}?tab=attendance` }]}
        rowHref={(r) => `/students/${r.studentId}?tab=attendance`}
        emptyTitle="No students"
        emptyMessage="There are no students enrolled in this section."
      />
    </div>
  );
}
