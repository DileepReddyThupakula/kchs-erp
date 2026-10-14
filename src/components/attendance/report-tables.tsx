"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { saveLowAttendanceThreshold } from "@/features/attendance/actions";
import { DAY_MARK, KIND_LABEL, SESSION_LABEL, dayOfWeek, type SessionName } from "@/features/attendance/shared";

// ------------------------------------------------------------------ daily summary
export type DailyRowView = {
  key: string;
  sectionId: string;
  section: string;
  session: SessionName;
  marked: boolean;
  by: string;
  kind: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  total: number;
};

export function DailyTable({ rows, date, canMark }: { rows: DailyRowView[]; date: string; canMark: boolean }) {
  const columns: Column<DailyRowView>[] = [
    { id: "section", header: "Section", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.section}</span>, sortValue: (r) => r.section, className: "whitespace-nowrap" },
    { id: "session", header: "Session", cell: (r) => SESSION_LABEL[r.session], sortValue: (r) => r.session },
    {
      id: "marked",
      header: "Marked?",
      cell: (r) => (r.marked ? <Badge tone="success">Marked</Badge> : <Badge tone="warning">Not marked</Badge>),
      sortValue: (r) => (r.marked ? 1 : 0),
      exportValue: (r) => (r.marked ? "Marked" : "Not marked"),
    },
    { id: "present", header: "Present", align: "right", cell: (r) => (r.marked ? r.present : "—"), exportValue: (r) => (r.marked ? r.present : "") },
    { id: "late", header: "Late", align: "right", cell: (r) => (r.marked ? r.late : "—"), exportValue: (r) => (r.marked ? r.late : "") },
    { id: "absent", header: "Absent", align: "right", cell: (r) => (r.marked ? <b className={r.absent ? "text-red-700" : ""}>{r.absent}</b> : "—"), exportValue: (r) => (r.marked ? r.absent : "") },
    { id: "leave", header: "Leave", align: "right", cell: (r) => (r.marked ? r.leave : "—"), exportValue: (r) => (r.marked ? r.leave : "") },
    { id: "total", header: "Students", align: "right", cell: (r) => (r.marked ? r.total : "—"), exportValue: (r) => (r.marked ? r.total : "") },
    { id: "by", header: "Marked by", cell: (r) => r.by || <span className="text-muted">—</span>, exportValue: (r) => r.by },
    { id: "kind", header: "Type", cell: (r) => (r.marked ? KIND_LABEL[r.kind] ?? r.kind : "—"), defaultHidden: true, exportValue: (r) => (r.marked ? KIND_LABEL[r.kind] ?? r.kind : "") },
  ];
  return (
    <DataTable
      id="attendance-daily"
      rows={rows}
      columns={columns}
      getRowId={(r) => r.key}
      searchText={(r) => `${r.section} ${r.by}`}
      filters={[
        { id: "marked", label: "Marked", options: [{ value: "no", label: "Not marked" }, { value: "yes", label: "Marked" }], match: (r, v) => (v === "yes") === r.marked },
        { id: "session", label: "Session", options: [{ value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }], match: (r, v) => r.session === v },
      ]}
      pageSize={30}
      exportName={`attendance-daily-${date}`}
      rowLabel={(r) => `${r.section} ${r.session}`}
      rowActions={(r) => [{ id: "open", kind: "view", label: canMark ? (r.marked ? "View / correct" : "Mark") : "View", href: `/attendance?section=${r.sectionId}&session=${r.session}&date=${date}` }]}
      emptyTitle="No sessions on this date"
      emptyMessage="This may be a holiday, a Sunday, or nothing is set up for that date."
    />
  );
}

// ------------------------------------------------------------------ monthly register
export type RegisterRow = {
  studentId: string;
  roll: number | null;
  name: string;
  admissionNo: string;
  days: Record<number, string | undefined>; // day-of-month -> day_status
  pct: number | null;
  full: number;
  half: number;
  absent: number;
};

export function RegisterTable({ rows, month, days, nonSchool, exportName }: { rows: RegisterRow[]; month: string; days: number; nonSchool: number[]; exportName: string }) {
  const dayCols: Column<RegisterRow>[] = Array.from({ length: days }, (_, i) => i + 1).map((d) => ({
    id: `d${d}`,
    header: String(d),
    align: "center",
    className: "px-1 text-xs",
    cell: (r) => {
      const s = r.days[d];
      if (!s) return nonSchool.includes(d) ? <span className="text-navy-200">·</span> : <span className="text-muted">–</span>;
      const mark = DAY_MARK[s as keyof typeof DAY_MARK] ?? "?";
      return <span className={s === "absent" ? "font-bold text-red-700" : s === "present" ? "text-peacock-800" : "font-semibold text-amber-800"}>{mark}</span>;
    },
    exportValue: (r) => (r.days[d] ? (DAY_MARK[r.days[d] as keyof typeof DAY_MARK] ?? "") : ""),
  }));
  const columns: Column<RegisterRow>[] = [
    { id: "roll", header: "Roll", align: "right", cell: (r) => r.roll ?? "", sortValue: (r) => r.roll ?? 9999, exportValue: (r) => r.roll ?? "" },
    { id: "name", header: "Student", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name, className: "whitespace-nowrap", exportValue: (r) => r.name },
    ...dayCols,
    { id: "full", header: "Full days", align: "right", cell: (r) => r.full, sortValue: (r) => r.full, exportValue: (r) => r.full },
    { id: "half", header: "Half days", align: "right", cell: (r) => r.half, sortValue: (r) => r.half, exportValue: (r) => r.half },
    { id: "absent", header: "Absent days", align: "right", cell: (r) => r.absent, sortValue: (r) => r.absent, exportValue: (r) => r.absent },
    { id: "pct", header: "%", align: "right", cell: (r) => (r.pct == null ? "—" : <b>{r.pct.toFixed(1)}%</b>), sortValue: (r) => r.pct ?? -1, exportValue: (r) => (r.pct == null ? "" : r.pct) },
  ];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        P present both sessions · A absent both · ½M morning only · ½A afternoon only · ? one session marked · – not marked · · not a school day. Percentage counts each session as half a day; Late counts as present.
      </p>
      <DataTable
        id={`attendance-register-${month}`}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.studentId}
        searchText={(r) => `${r.name} ${r.admissionNo}`}
        pageSize={60}
        exportName={exportName}
        rowLabel={(r) => r.name}
        rowActions={(r) => [{ id: "view", kind: "view", label: "Student attendance", href: `/students/${r.studentId}?tab=attendance&month=${month}` }]}
        rowHref={(r) => `/students/${r.studentId}?tab=attendance&month=${month}`}
        emptyTitle="No students"
        emptyMessage="There are no active students in this section."
      />
    </div>
  );
}

// ------------------------------------------------------------------ low attendance
export type LowRow = { studentId: string; name: string; admissionNo: string; section: string; pct: number; marked: number; attended: number; absentDays: number };

export function LowTable({ rows, threshold, isAdmin, rangeLabel }: { rows: LowRow[]; threshold: number; isAdmin: boolean; rangeLabel: string }) {
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const columns: Column<LowRow>[] = [
    { id: "name", header: "Student", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name, className: "whitespace-nowrap" },
    { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.admissionNo}</span>, sortValue: (r) => r.admissionNo, exportValue: (r) => r.admissionNo },
    { id: "section", header: "Section", cell: (r) => r.section, sortValue: (r) => r.section, exportValue: (r) => r.section },
    { id: "pct", header: "Attendance %", align: "right", cell: (r) => <b className="text-red-700">{r.pct.toFixed(1)}%</b>, sortValue: (r) => r.pct, exportValue: (r) => r.pct },
    { id: "att", header: "Sessions attended", align: "right", cell: (r) => `${r.attended} of ${r.marked}`, sortValue: (r) => r.attended, exportValue: (r) => `${r.attended}/${r.marked}` },
    { id: "abs", header: "Absent days", align: "right", cell: (r) => r.absentDays, sortValue: (r) => r.absentDays, exportValue: (r) => r.absentDays },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-sm text-muted">
          Students below <b className="text-navy-900">{threshold}%</b> · {rangeLabel}
        </p>
        {isAdmin && (
          <form
            className="ml-auto flex items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await saveLowAttendanceThreshold(Number(value));
              setBusy(false);
              if (!r.ok) toast.error(r.error);
              else toast.success("Threshold saved.");
            }}
          >
            <label className="text-xs text-muted">
              Low-attendance threshold (%)
              <Input type="number" min={1} max={100} value={value} onChange={(e) => setValue(e.target.value)} className="mt-0.5 w-28" />
            </label>
            <Button type="submit" variant="secondary" loading={busy}>
              Save
            </Button>
          </form>
        )}
      </div>
      <DataTable
        id="attendance-low"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.studentId}
        searchText={(r) => `${r.name} ${r.admissionNo} ${r.section}`}
        exportName="low-attendance"
        rowLabel={(r) => r.name}
        rowActions={(r) => [{ id: "view", kind: "view", label: "Student attendance", href: `/students/${r.studentId}?tab=attendance` }]}
        rowHref={(r) => `/students/${r.studentId}?tab=attendance`}
        emptyTitle="Nobody is below the threshold"
        emptyMessage="Every student with marked attendance is at or above the threshold for this period."
      />
    </div>
  );
}

export function PrintLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-navy-800 hover:bg-navy-50">
      {children}
    </Link>
  );
}
void dayOfWeek;
