"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { formatDate } from "@/lib/utils";
import { savePlan } from "@/features/fees/actions";
import { KIND_LABEL } from "@/features/fees/shared";
import type { FeePlan, FeePlanInstallment } from "@/types/database";

type Row = FeePlan & { installments: FeePlanInstallment[] };
type Inst = { seq?: number; label: string; due_date: string; pct: string };

/** Installment rows. custom: add/remove/edit labels, dates and %; others: dates only. */
function InstallmentEditor({ kind, initial, error }: { kind: string; initial: Inst[]; error?: string[] }) {
  const [rows, setRows] = useState<Inst[]>(initial);
  const sum = rows.reduce((a, r) => a + (Number(r.pct) || 0), 0);
  const custom = kind === "custom";
  const json = JSON.stringify(rows.map((r) => ({ seq: r.seq, label: r.label, due_date: r.due_date, share_bp: Math.round((Number(r.pct) || 0) * 100) })));
  const set = (i: number, patch: Partial<Inst>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2 sm:col-span-2">
      <input type="hidden" name="installments" value={json} />
      <div className="hidden grid-cols-[1fr_9rem_6rem_2rem] gap-2 text-xs font-medium text-muted sm:grid">
        <span>Installment</span>
        <span>Due date</span>
        <span>{custom ? "Share %" : ""}</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={r.seq ?? i} className="grid grid-cols-[1fr_9rem] items-center gap-2 sm:grid-cols-[1fr_9rem_6rem_2rem]">
          {custom ? (
            <input aria-label="Installment name" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
          ) : (
            <span className="text-sm text-navy-900">{r.label}</span>
          )}
          <input aria-label="Due date" type="date" className="h-10 rounded-lg border border-border bg-surface px-2 text-sm" value={r.due_date} onChange={(e) => set(i, { due_date: e.target.value })} />
          {custom && (
            <>
              <input aria-label="Share percent" inputMode="decimal" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={r.pct} onChange={(e) => set(i, { pct: e.target.value })} />
              <button type="button" aria-label="Remove installment" className="grid size-8 place-items-center rounded-lg text-red-700 hover:bg-red-50" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      ))}
      {custom && (
        <div className="flex items-center justify-between">
          <Button type="button" size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { label: `Part ${rs.length + 1}`, due_date: "", pct: "" }])}>
            <Plus className="size-3.5" /> Add installment
          </Button>
          <span className={sum === 100 ? "text-xs text-peacock-700" : "text-xs text-red-700"}>Total {sum.toFixed(2).replace(/\.00$/, "")}% {sum === 100 ? "✓" : "(must be 100%)"}</span>
        </div>
      )}
      {error?.map((e) => (
        <p key={e} className="text-xs text-danger">
          {e}
        </p>
      ))}
    </div>
  );
}

export function PlansTab({ yearId, plans, installments }: { yearId: string; plans: FeePlan[]; installments: FeePlanInstallment[] }) {
  const drawer = useDrawer<Row>();
  const [kind, setKind] = useState("monthly");
  const rows: Row[] = useMemo(
    () => plans.map((p) => ({ ...p, installments: installments.filter((i) => i.plan_id === p.id).sort((a, b) => a.seq - b.seq) })),
    [plans, installments],
  );
  const columns: Column<Row>[] = [
    { id: "name", header: "Plan", hideable: false, pinned: "left", className: "whitespace-nowrap", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name },
    { id: "kind", header: "Type", cell: (r) => <Badge tone="info">{KIND_LABEL[r.kind]}</Badge>, sortValue: (r) => r.kind },
    { id: "day", header: "Due day", align: "right", cell: (r) => (r.kind === "custom" ? <span className="text-muted">per installment</span> : r.due_day), sortValue: (r) => r.due_day },
    { id: "count", header: "Installments", align: "right", cell: (r) => r.installments.length, sortValue: (r) => r.installments.length },
    {
      id: "dates",
      header: "Schedule",
      cell: (r) => <span className="text-xs text-muted">{r.installments.length ? `${formatDate(r.installments[0].due_date)} → ${formatDate(r.installments[r.installments.length - 1].due_date)}` : "—"}</span>,
    },
  ];
  const actions = (r: Row): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
    { id: "edit", kind: "edit", label: "Edit", onClick: () => drawer.openEdit(r) },
  ];
  const cur = drawer.item;
  const effectiveKind = cur ? cur.kind : kind;
  const initial: Inst[] = cur
    ? cur.installments.map((i) => ({ seq: i.seq, label: i.label, due_date: i.due_date, pct: i.share_bp != null ? String(i.share_bp / 100) : "" }))
    : kind === "custom"
      ? [
          { label: "Part 1", due_date: "", pct: "50" },
          { label: "Part 2", due_date: "", pct: "50" },
        ]
      : [];

  return (
    <>
      <DataTable
        id="fee-plans"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => r.name}
        rowActions={actions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        exportName="fee-plans"
        emptyMessage="Add the plans you use, e.g. Monthly, One-time, Three terms."
        toolbar={
          <Button
            onClick={() => {
              setKind("monthly");
              drawer.openNew();
            }}
          >
            <Plus className="size-4" /> Add plan
          </Button>
        }
      />
      <p className="mt-2 text-xs text-muted">
        Changing a due date or schedule updates unpaid dues only. Monthly plans split the yearly amount over April–March; the last installment takes any remainder so the total is exact.
      </p>
      <Drawer open={drawer.open} onClose={drawer.close} wide title={cur ? `${drawer.readOnly ? "" : "Edit "}${cur.name}` : "Add plan"}>
        <ActionForm key={`${cur?.id ?? "new"}-${drawer.mode}-${kind}`} action={savePlan} layout="drawer" submitLabel="Save plan" onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly} onEditRequest={drawer.toEdit}>
          {(fe) => (
            <>
              <input type="hidden" name="year_id" value={yearId} />
              {cur && <input type="hidden" name="id" value={cur.id} />}
              <input type="hidden" name="kind" value={effectiveKind} />
              <FormSection title="Plan">
                <Field label="Name" name="name" errors={fe.name}>
                  <Input id="name" name="name" defaultValue={cur?.name ?? ""} required />
                </Field>
                {cur ? (
                  <Field label="Type" name="kind-show">
                    <Input id="kind-show" value={KIND_LABEL[cur.kind]} disabled readOnly />
                  </Field>
                ) : (
                  <Field label="Type" name="kind-select" errors={fe.kind}>
                    <Select id="kind-select" value={kind} onChange={(e) => setKind(e.target.value)}>
                      <option value="monthly">Monthly (April–March)</option>
                      <option value="one_time">One-time (whole year in one payment)</option>
                      <option value="custom">Custom installments</option>
                    </Select>
                  </Field>
                )}
                {effectiveKind !== "custom" && (
                  <Field label="Due day of the month" name="due_day" errors={fe.due_day} hint="1–28. Individual installment dates can be changed below.">
                    <Input id="due_day" name="due_day" type="number" min={1} max={28} defaultValue={cur?.due_day ?? 10} />
                  </Field>
                )}
                {effectiveKind === "custom" && <input type="hidden" name="due_day" value={cur?.due_day ?? 10} />}
              </FormSection>
              {(effectiveKind === "custom" || cur) && (
                <FormSection title={effectiveKind === "custom" ? "Installments" : "Due dates"} columns={1}>
                  <InstallmentEditor key={`${cur?.id ?? "new"}-${kind}`} kind={effectiveKind} initial={initial} error={fe.installments} />
                </FormSection>
              )}
            </>
          )}
        </ActionForm>
      </Drawer>
    </>
  );
}
