"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { applyLeave, cancelLeave, decideLeave, saveLeaveType, setLeaveAllowance } from "@/features/attendance/actions";
import { formatDate } from "@/lib/utils";

export type LeaveTypeOpt = { id: string; name: string; defaultDays: number | null; active: boolean };
export type LeaveRow = {
  id: string;
  staffId: string;
  staff: string;
  type: string;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  note: string;
  decidedBy: string;
  remaining: number | null; // balance left for that type (null = unlimited)
};

const TONE = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;
const TEXT = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;

// ------------------------------------------------------------------ apply
export function ApplyLeaveForm({ types, staff, onDone }: { types: LeaveTypeOpt[]; staff?: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types.find((t) => t.active)?.id ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-navy-900">Apply for leave</h2>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const r = await applyLeave({ typeId, from, to: to || from, reason, staffId: staffId || undefined });
          setBusy(false);
          if (!r.ok) return setError(r.error);
          toast.success(r.message ?? "Sent.");
          setFrom("");
          setTo("");
          setReason("");
          router.refresh();
          onDone?.();
        }}
      >
        {staff && (
          <Field label="For" name="lv-staff">
            <Select id="lv-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Myself</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Leave type" name="lv-type">
          <Select id="lv-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            {types
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="First day" name="lv-from">
          <Input id="lv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="Last day (same day if empty)" name="lv-to">
          <Input id="lv-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Reason" name="lv-reason">
            <Textarea id="lv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy}>
            Send request
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ tables
function columns(opts: { showStaff: boolean; showBalance: boolean }): Column<LeaveRow>[] {
  const cols: Column<LeaveRow>[] = [
    opts.showStaff
      ? { id: "staff", header: "Staff", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.staff}</span>, sortValue: (r) => r.staff, className: "whitespace-nowrap", exportValue: (r) => r.staff }
      : { id: "dates", header: "Dates", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} – ${formatDate(r.to)}`}</span>, sortValue: (r) => r.from, className: "whitespace-nowrap", exportValue: (r) => `${r.from} to ${r.to}` },
    { id: "type", header: "Type", cell: (r) => r.type, sortValue: (r) => r.type },
    ...(opts.showStaff
      ? [{ id: "dates", header: "Dates", cell: (r: LeaveRow) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} – ${formatDate(r.to)}`), sortValue: (r: LeaveRow) => r.from, className: "whitespace-nowrap", exportValue: (r: LeaveRow) => `${r.from} to ${r.to}` } as Column<LeaveRow>]
      : []),
    { id: "days", header: "Days", align: "right", cell: (r) => r.days, sortValue: (r) => r.days, exportValue: (r) => r.days },
    { id: "reason", header: "Reason", cell: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span>, exportValue: (r) => r.reason },
    {
      id: "status",
      header: "Status",
      cell: (r) => <Badge tone={TONE[r.status]}>{TEXT[r.status]}</Badge>,
      sortValue: (r) => r.status,
      exportValue: (r) => TEXT[r.status],
    },
    ...(opts.showBalance
      ? [{ id: "balance", header: "Balance left", align: "right", cell: (r: LeaveRow) => (r.remaining == null ? "Unlimited" : `${r.remaining} day(s)`), sortValue: (r: LeaveRow) => r.remaining ?? 9999, exportValue: (r: LeaveRow) => (r.remaining == null ? "Unlimited" : r.remaining) } as Column<LeaveRow>]
      : []),
    { id: "note", header: "Decision note", cell: (r) => r.note || <span className="text-muted">—</span>, defaultHidden: false, exportValue: (r) => r.note },
    { id: "by", header: "Decided by", cell: (r) => r.decidedBy || <span className="text-muted">—</span>, defaultHidden: true, exportValue: (r) => r.decidedBy },
  ];
  return cols;
}

export function MyLeaveTable({ rows }: { rows: LeaveRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      id="my-leave"
      rows={rows}
      columns={columns({ showStaff: false, showBalance: false })}
      getRowId={(r) => r.id}
      exportName="my-leave"
      rowLabel={(r) => `${r.type} ${r.from}`}
      filters={[{ id: "status", label: "Status", options: Object.entries(TEXT).map(([value, label]) => ({ value, label })), match: (r, v) => r.status === v }]}
      rowActions={(r) =>
        r.status === "pending"
          ? [
              {
                id: "cancel",
                kind: "menu",
                label: "Cancel request",
                icon: Ban,
                tone: "danger",
                confirm: { title: "Cancel this leave request?", message: "The request is withdrawn. You can apply again.", confirmLabel: "Cancel request", danger: true },
                onClick: async () => {
                  const res = await cancelLeave(r.id);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success(res.message ?? "Cancelled.");
                    router.refresh();
                  }
                },
              },
            ]
          : []
      }
      emptyTitle="No leave requests yet"
      emptyMessage="When you apply for leave, it shows up here with its status."
    />
  );
}

export function ApprovalsTable({ rows, pendingOnly, id }: { rows: LeaveRow[]; pendingOnly: boolean; id: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState<LeaveRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve(r: LeaveRow): Promise<void> {
    const res = await decideLeave(r.id, true, "");
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Approved.");
    router.refresh();
  }
  return (
    <>
      <DataTable
        id={id}
        rows={rows}
        columns={columns({ showStaff: true, showBalance: pendingOnly })}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.staff} ${r.type} ${r.reason}`}
        exportName={pendingOnly ? "leave-pending" : "leave-requests"}
        rowLabel={(r) => `${r.staff} ${r.from}`}
        filters={
          pendingOnly
            ? []
            : [
                { id: "status", label: "Status", options: Object.entries(TEXT).map(([value, label]) => ({ value, label })), match: (r, v) => r.status === v },
                { id: "type", label: "Type", options: [...new Set(rows.map((r) => r.type))].map((t) => ({ value: t, label: t })), match: (r, v) => r.type === v },
              ]
        }
        rowActions={(r) =>
          r.status === "pending"
            ? [
                { id: "approve", kind: "view", label: "Approve", icon: Check, onClick: () => approve(r) },
                { id: "reject", kind: "menu", label: "Reject…", icon: X, tone: "danger", onClick: () => { setRejecting(r); setNote(""); setError(""); } },
              ]
            : []
        }
        emptyTitle={pendingOnly ? "No requests waiting" : "No leave requests"}
        emptyMessage={pendingOnly ? "Nothing is waiting for a decision." : "Requests appear here once staff apply."}
      />
      <Modal
        open={!!rejecting}
        onClose={() => !busy && setRejecting(null)}
        title={`Reject leave: ${rejecting?.staff ?? ""}`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={note.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                const res = await decideLeave(rejecting!.id, false, note);
                setBusy(false);
                if (!res.ok) return setError(res.error);
                toast.success(res.message ?? "Rejected.");
                setRejecting(null);
                router.refresh();
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-foreground">
          <p>
            {rejecting?.type}, {rejecting && (rejecting.from === rejecting.to ? formatDate(rejecting.from) : `${formatDate(rejecting.from)} – ${formatDate(rejecting.to)}`)} ({rejecting?.days} day(s)). Give the reason so the applicant knows.
          </p>
          <Field label="Note to the applicant" name="rej-note">
            <Textarea id="rej-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ balances
export type BalanceRow = { staffId: string; staff: string; cells: Record<string, { allowance: number | null; used: number; pending: number; remaining: number | null }> };

export function BalancesTable({ rows, types, yearId, yearName }: { rows: BalanceRow[]; types: LeaveTypeOpt[]; yearId: string; yearName: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<BalanceRow | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = types.filter((t) => t.active);
  const cols: Column<BalanceRow>[] = [
    { id: "staff", header: "Staff", hideable: false, pinned: "left", cell: (r) => <span className="font-medium text-navy-900">{r.staff}</span>, sortValue: (r) => r.staff, className: "whitespace-nowrap", exportValue: (r) => r.staff },
    ...active.map<Column<BalanceRow>>((t) => ({
      id: `t${t.id}`,
      header: t.name,
      cell: (r) => {
        const c = r.cells[t.id];
        return c ? (
          <span className="tabular-nums">
            {c.used} used{c.allowance == null ? "" : ` of ${c.allowance}`}
            {c.pending > 0 && <span className="text-amber-800"> (+{c.pending} pending)</span>}
          </span>
        ) : (
          "—"
        );
      },
      exportValue: (r) => {
        const c = r.cells[t.id];
        return c ? `${c.used}${c.allowance == null ? "" : `/${c.allowance}`}` : "";
      },
    })),
  ];
  return (
    <>
      <DataTable
        id="leave-balances"
        rows={rows}
        columns={cols}
        getRowId={(r) => r.staffId}
        searchText={(r) => r.staff}
        exportName={`leave-balances-${yearName}`}
        rowLabel={(r) => r.staff}
        pageSize={30}
        rowActions={(r) => [
          {
            id: "edit",
            kind: "edit",
            label: "Set yearly allowance",
            icon: Pencil,
            onClick: () => {
              setEdit(r);
              setError("");
              setVals(Object.fromEntries(active.map((t) => [t.id, r.cells[t.id]?.allowance == null ? "" : String(r.cells[t.id]!.allowance)])));
            },
          },
        ]}
      />
      <Modal
        open={!!edit}
        onClose={() => !busy && setEdit(null)}
        title={`Yearly leave allowance: ${edit?.staff ?? ""}`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                for (const t of active) {
                  const raw = (vals[t.id] ?? "").trim();
                  const current = edit!.cells[t.id]?.allowance;
                  const next = raw === "" ? null : Number(raw);
                  if (next === current) continue;
                  const r = await setLeaveAllowance({ staffId: edit!.staffId, typeId: t.id, yearId, days: next });
                  if (!r.ok) {
                    setBusy(false);
                    return setError(r.error);
                  }
                }
                setBusy(false);
                toast.success("Allowances saved.");
                setEdit(null);
                router.refresh();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-foreground">
          <p className="text-xs text-muted">{yearName}. Leave a box empty for unlimited. This replaces the type&apos;s default for this person only.</p>
          {active.map((t) => (
            <Field key={t.id} label={`${t.name} (default ${t.defaultDays ?? "unlimited"})`} name={`al-${t.id}`}>
              <Input id={`al-${t.id}`} type="number" min={0} step="0.5" value={vals[t.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [t.id]: e.target.value }))} placeholder="Unlimited" />
            </Field>
          ))}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ leave types
export function TypesPanel({ types }: { types: LeaveTypeOpt[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<LeaveTypeOpt | "new" | null>(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (t: LeaveTypeOpt | "new") => {
    setEdit(t);
    setError("");
    setName(t === "new" ? "" : t.name);
    setDays(t === "new" || t.defaultDays == null ? "" : String(t.defaultDays));
    setActive(t === "new" ? true : t.active);
  };
  const cols: Column<LeaveTypeOpt>[] = [
    { id: "name", header: "Leave type", hideable: false, pinned: "left", cell: (t) => <span className="font-medium text-navy-900">{t.name}</span>, sortValue: (t) => t.name, exportValue: (t) => t.name },
    { id: "days", header: "Default days per year", align: "right", cell: (t) => (t.defaultDays == null ? "Unlimited" : t.defaultDays), exportValue: (t) => t.defaultDays ?? "Unlimited" },
    { id: "active", header: "Status", cell: (t) => <Badge tone={t.active ? "success" : "neutral"}>{t.active ? "In use" : "Not offered"}</Badge>, exportValue: (t) => (t.active ? "In use" : "Not offered") },
  ];
  return (
    <>
      <div className="mb-3">
        <Button onClick={() => open("new")}>Add leave type</Button>
      </div>
      <DataTable
        id="leave-types"
        rows={types}
        columns={cols}
        getRowId={(t) => t.id}
        rowLabel={(t) => t.name}
        rowActions={(t) => [{ id: "edit", kind: "edit", label: "Edit", icon: Pencil, onClick: () => open(t) }]}
      />
      <Modal
        open={!!edit}
        onClose={() => !busy && setEdit(null)}
        title={edit === "new" ? "New leave type" : "Edit leave type"}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await saveLeaveType({ id: edit && edit !== "new" ? edit.id : undefined, name, defaultDays: days.trim() === "" ? null : Number(days), active });
                setBusy(false);
                if (!r.ok) return setError(r.error);
                toast.success(r.message ?? "Saved.");
                setEdit(null);
                router.refresh();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-foreground">
          <Field label="Name" name="lt-name">
            <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Default days per year (empty = unlimited)" name="lt-days">
            <Input id="lt-days" type="number" min={0} step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-navy-700" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Offered when applying for leave
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
