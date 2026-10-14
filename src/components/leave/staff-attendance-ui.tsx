"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { cn } from "@/lib/utils";
import { saveStaffAttendance } from "@/features/attendance/actions";

type St = "present" | "late" | "absent" | "on_leave";
const LABEL: Record<St, string> = { present: "Present", late: "Late", absent: "Absent", on_leave: "On leave" };
const ON: Record<St, string> = {
  present: "data-[on=true]:border-peacock-600 data-[on=true]:bg-peacock-600 data-[on=true]:text-white",
  late: "data-[on=true]:border-amber-600 data-[on=true]:bg-amber-500 data-[on=true]:text-navy-950",
  absent: "data-[on=true]:border-red-700 data-[on=true]:bg-red-700 data-[on=true]:text-white",
  on_leave: "data-[on=true]:border-navy-700 data-[on=true]:bg-navy-700 data-[on=true]:text-white",
};

export type SheetRow = { staffId: string; name: string; code: string; designation: string; status: St | null; prefilled: boolean };

export function StaffSheet({ date, rows }: { date: string; rows: SheetRow[] }) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, St | null>>(() => Object.fromEntries(rows.map((r) => [r.staffId, r.status])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (id: string, s: St) => setMarks((m) => ({ ...m, [id]: s }));
  const todo = rows.filter((r) => marks[r.staffId]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setMarks((m) => Object.fromEntries(rows.map((r) => [r.staffId, m[r.staffId] ?? "present"])))}>
          <UserCheck className="size-4" /> Mark everyone else present
        </Button>
        <span className="text-sm text-muted">Approved leave is filled in as “On leave”. {rows.filter((r) => r.prefilled).length} filled from leave.</span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
        {rows.map((r) => (
          <li key={r.staffId} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-48 flex-1">
              <span className="font-medium text-navy-900">{r.name}</span>
              <span className="ml-2 text-xs text-muted">{r.designation}</span>
              {r.prefilled && <Badge tone="info" className="ml-2">From approved leave</Badge>}
            </span>
            <div role="radiogroup" aria-label={`Attendance for ${r.name}`} className="grid grid-cols-4 gap-1">
              {(Object.keys(LABEL) as St[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={marks[r.staffId] === s}
                  data-on={marks[r.staffId] === s}
                  onClick={() => set(r.staffId, s)}
                  className={cn("inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-border bg-white px-2 text-sm font-medium text-navy-800", ON[s])}
                >
                  {marks[r.staffId] === s && <Check className="size-4" aria-hidden />}
                  {LABEL[s]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          loading={busy}
          disabled={busy || todo.length === 0}
          onClick={async () => {
            setError("");
            setBusy(true);
            const r = await saveStaffAttendance(date, todo.map((x) => ({ staffId: x.staffId, status: marks[x.staffId]! })));
            setBusy(false);
            if (!r.ok) return setError(r.error);
            toast.success(r.message ?? "Saved.");
            router.refresh();
          }}
        >
          Save staff attendance
        </Button>
        <span className="text-sm text-muted">{todo.length} of {rows.length} marked</span>
      </div>
    </div>
  );
}

export type MonthRow = { staffId: string; name: string; present: number; late: number; absent: number; onLeave: number; leaveTaken: string };

export function StaffMonthTable({ rows, month }: { rows: MonthRow[]; month: string }) {
  const cols: Column<MonthRow>[] = [
    { id: "name", header: "Staff", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name, className: "whitespace-nowrap", exportValue: (r) => r.name },
    { id: "present", header: "Present", align: "right", cell: (r) => r.present, sortValue: (r) => r.present, exportValue: (r) => r.present },
    { id: "late", header: "Late", align: "right", cell: (r) => r.late, sortValue: (r) => r.late, exportValue: (r) => r.late },
    { id: "absent", header: "Absent", align: "right", cell: (r) => (r.absent ? <b className="text-red-700">{r.absent}</b> : 0), sortValue: (r) => r.absent, exportValue: (r) => r.absent },
    { id: "leave", header: "On leave", align: "right", cell: (r) => r.onLeave, sortValue: (r) => r.onLeave, exportValue: (r) => r.onLeave },
    { id: "taken", header: "Leave taken (approved)", cell: (r) => r.leaveTaken || <span className="text-muted">—</span>, exportValue: (r) => r.leaveTaken },
  ];
  return <DataTable id="staff-month" rows={rows} columns={cols} getRowId={(r) => r.staffId} searchText={(r) => r.name} pageSize={30} exportName={`staff-attendance-${month}`} rowLabel={(r) => r.name} />;
}
