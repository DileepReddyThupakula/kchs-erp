"use client";
import { Plus } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { saveFeeHead } from "@/features/fees/actions";
import type { FeeHead } from "@/types/database";

export function HeadsTab({ heads }: { heads: FeeHead[] }) {
  const drawer = useDrawer<FeeHead>();
  const columns: Column<FeeHead>[] = [
    { id: "name", header: "Fee head", hideable: false, pinned: "left", className: "whitespace-nowrap", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name },
    { id: "code", header: "Code", cell: (r) => <span className="font-mono text-xs">{r.code ?? "—"}</span>, sortValue: (r) => r.code ?? "" },
    { id: "order", header: "Order", align: "right", cell: (r) => r.sort_order, sortValue: (r) => r.sort_order },
    { id: "status", header: "Status", cell: (r) => <StatusChip status={r.is_active ? "active" : "inactive"} />, sortValue: (r) => (r.is_active ? "active" : "inactive") },
  ];
  const actions = (r: FeeHead): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
    { id: "edit", kind: "edit", label: "Edit", onClick: () => drawer.openEdit(r) },
  ];
  return (
    <>
      <DataTable
        id="fee-heads"
        rows={heads}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.code ?? ""}`}
        rowActions={actions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        exportName="fee-heads"
        emptyMessage="Add a fee head such as Tuition, Exam or Books."
        toolbar={
          <Button onClick={drawer.openNew}>
            <Plus className="size-4" /> Add fee head
          </Button>
        }
      />
      <p className="mt-2 text-xs text-muted">Fee heads can&apos;t be deleted (receipts refer to them). Mark one Inactive to stop using it. Special fees have their own heads and are managed under “Special fees”.</p>
      <Drawer open={drawer.open} onClose={drawer.close} title={drawer.item ? `${drawer.readOnly ? "" : "Edit "}${drawer.item.name}` : "Add fee head"}>
        <ActionForm key={`${drawer.item?.id ?? "new"}-${drawer.mode}`} action={saveFeeHead} layout="drawer" submitLabel={drawer.item ? "Save fee head" : "Add fee head"} onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly} onEditRequest={drawer.toEdit}>
          {(fe) => (
            <FormSection title="Fee head">
              {drawer.item && <input type="hidden" name="id" value={drawer.item.id} />}
              <Field label="Name" name="name" errors={fe.name}>
                <Input id="name" name="name" defaultValue={drawer.item?.name ?? ""} required />
              </Field>
              <Field label="Code" name="code" errors={fe.code}>
                <Input id="code" name="code" defaultValue={drawer.item?.code ?? ""} />
              </Field>
              <Field label="Order" name="sort_order" errors={fe.sort_order}>
                <Input id="sort_order" name="sort_order" type="number" defaultValue={drawer.item?.sort_order ?? 50} />
              </Field>
              <Field label="Status" name="is_active">
                <Select id="is_active" name="is_active" defaultValue={drawer.item?.is_active === false ? "off" : "on"}>
                  <option value="on">Active</option>
                  <option value="off">Inactive</option>
                </Select>
              </Field>
            </FormSection>
          )}
        </ActionForm>
      </Drawer>
    </>
  );
}
