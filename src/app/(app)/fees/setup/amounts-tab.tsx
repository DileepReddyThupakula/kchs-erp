"use client";
import { useMemo } from "react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { formatPaise, rupeesInput } from "@/lib/money";
import { saveClassFees } from "@/features/fees/actions";
import { KIND_LABEL } from "@/features/fees/shared";

type Cls = { id: string; name: string; order: number };
type Head = { id: string; name: string };
type Plan = { id: string; name: string; kind: "one_time" | "monthly" | "custom" };
type Struct = { classId: string; headId: string; amount: number; planId: string | null };
type Row = { id: string; name: string; order: number; total: number };

export function AmountsTab({ yearId, yearName, classes, heads, plans, structure }: { yearId: string; yearName: string; classes: Cls[]; heads: Head[]; plans: Plan[]; structure: Struct[] }) {
  const drawer = useDrawer<Row>();
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const cell = (classId: string, headId: string) => structure.find((s) => s.classId === classId && s.headId === headId);
  const rows: Row[] = useMemo(
    () => classes.map((c) => ({ ...c, total: heads.reduce((a, h) => a + (structure.find((s) => s.classId === c.id && s.headId === h.id)?.amount ?? 0), 0) })),
    [classes, heads, structure],
  );

  const columns: Column<Row>[] = [
    { id: "class", header: "Class", hideable: false, pinned: "left", className: "whitespace-nowrap", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.order, exportValue: (r) => r.name },
    ...heads.map<Column<Row>>((h) => ({
      id: `h-${h.id}`,
      header: h.name,
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => {
        const c = cell(r.id, h.id);
        if (!c || c.amount === 0) return <span className="text-muted">Not set</span>;
        return (
          <span>
            <span className="font-medium tabular-nums">{formatPaise(c.amount)}</span>
            <span className="ml-1.5 text-xs text-muted">{c.planId ? planName.get(c.planId) : ""}</span>
          </span>
        );
      },
      sortValue: (r) => cell(r.id, h.id)?.amount ?? 0,
      exportValue: (r) => (cell(r.id, h.id)?.amount ?? 0) / 100,
    })),
    { id: "total", header: "Total / year", align: "right", className: "whitespace-nowrap", cell: (r) => <span className="font-semibold tabular-nums text-navy-900">{formatPaise(r.total)}</span>, sortValue: (r) => r.total, exportValue: (r) => r.total / 100 },
  ];
  const actions = (r: Row): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
    { id: "edit", kind: "edit", label: "Edit amounts", onClick: () => drawer.openEdit(r) },
  ];

  return (
    <>
      {plans.length === 0 && <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">No payment plans yet for {yearName}. Add plans under “Plans & schedules” first.</p>}
      <DataTable
        id="fee-amounts"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => r.name}
        searchPlaceholder="Search class…"
        rowActions={actions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        exportName={`fee-amounts-${yearName}`}
        emptyMessage="Add classes first (School setup → Classes & sections)."
      />
      {drawer.item && (
        <Drawer open={drawer.open} onClose={drawer.close} title={`${drawer.item.name} · fees for ${yearName}`} description={drawer.readOnly ? undefined : "Amount per year for each fee head and its default plan. Individual students can be moved to another plan."}>
          <ActionForm
            key={`${drawer.item.id}-${drawer.mode}`}
            action={saveClassFees}
            layout="drawer"
            submitLabel="Save amounts"
            onCancel={drawer.close}
            onSuccess={drawer.close}
            readOnly={drawer.readOnly}
            onEditRequest={drawer.toEdit}
          >
            {(fe) => (
              <>
                <input type="hidden" name="year_id" value={yearId} />
                <input type="hidden" name="class_id" value={drawer.item!.id} />
                {heads.map((h) => {
                  const c = cell(drawer.item!.id, h.id);
                  return (
                    <FormSection key={h.id} title={h.name}>
                      <Field label="Amount per year (₹)" name={`amount.${h.id}`} errors={fe[`amount.${h.id}`]} hint="0 = not charged">
                        <Input id={`amount.${h.id}`} name={`amount.${h.id}`} inputMode="decimal" defaultValue={c ? rupeesInput(c.amount) : "0"} />
                      </Field>
                      <Field label="Default plan" name={`plan.${h.id}`} errors={fe[`plan.${h.id}`]}>
                        <Select id={`plan.${h.id}`} name={`plan.${h.id}`} defaultValue={c?.planId ?? ""}>
                          <option value="">— choose —</option>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({KIND_LABEL[p.kind]})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FormSection>
                  );
                })}
              </>
            )}
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
