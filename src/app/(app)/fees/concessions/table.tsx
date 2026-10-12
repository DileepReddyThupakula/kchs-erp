"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { StudentPicker, type PickerStudent } from "@/components/fees/student-picker";
import { formatDate } from "@/lib/utils";
import { formatPaise, rupeesInput } from "@/lib/money";
import { deleteConcession, saveConcession } from "@/features/fees/actions";

export type ConcessionRow = {
  id: string;
  studentId: string;
  studentName: string;
  adm: string;
  classLabel: string;
  headId: string | null;
  headName: string;
  kind: "fixed" | "percent";
  amount: number | null;
  percentBp: number | null;
  reason: string;
  createdAt: string;
};

const valueText = (r: ConcessionRow) => (r.kind === "percent" ? `${(r.percentBp ?? 0) / 100}%` : formatPaise(r.amount));

export function ConcessionsTable({ rows, yearId, yearName, heads, students }: { rows: ConcessionRow[]; yearId: string; yearName: string; heads: { id: string; name: string }[]; students: PickerStudent[] }) {
  const router = useRouter();
  const drawer = useDrawer<ConcessionRow>();
  const [pick, setPick] = useState<string[]>([]);
  const [kind, setKind] = useState<"fixed" | "percent">("percent");
  const cur = drawer.item;

  const columns: Column<ConcessionRow>[] = [
    {
      id: "student",
      header: "Student",
      hideable: false,
      pinned: "left",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Link href={`/students/${r.studentId}?tab=fees`} className="font-medium text-navy-800 hover:underline">
          {r.studentName}
        </Link>
      ),
      sortValue: (r) => r.studentName,
    },
    { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.adm}</span>, sortValue: (r) => r.adm },
    { id: "class", header: "Class", className: "whitespace-nowrap", cell: (r) => r.classLabel, sortValue: (r) => r.classLabel },
    { id: "head", header: "Applies to", cell: (r) => (r.headId ? r.headName : <Badge>All fee heads</Badge>), sortValue: (r) => r.headName },
    { id: "value", header: "Concession", align: "right", className: "whitespace-nowrap", cell: (r) => <span className="font-semibold tabular-nums">{valueText(r)}</span>, sortValue: (r) => (r.kind === "percent" ? (r.percentBp ?? 0) : (r.amount ?? 0)), exportValue: valueText },
    { id: "reason", header: "Reason", cell: (r) => <span className="line-clamp-1 max-w-64">{r.reason}</span>, sortValue: (r) => r.reason, exportValue: (r) => r.reason },
    { id: "date", header: "Added", className: "whitespace-nowrap", cell: (r) => formatDate(r.createdAt.slice(0, 10)), sortValue: (r) => r.createdAt },
  ];
  const actions = (r: ConcessionRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => { setKind(r.kind); drawer.openView(r); } },
    { id: "edit", kind: "edit", label: "Edit", onClick: () => { setKind(r.kind); drawer.openEdit(r); } },
    {
      id: "delete",
      kind: "menu",
      label: "Remove concession",
      icon: Trash2,
      tone: "danger",
      confirm: { title: "Remove this concession?", message: `${r.studentName} will pay the full amount again on unpaid dues.`, confirmLabel: "Remove" },
      onClick: async () => {
        const fd = new FormData();
        fd.set("id", r.id);
        const res = await deleteConcession({}, fd);
        if (res.error) toast.error(res.error);
        else {
          toast.success(res.message);
          router.refresh();
        }
      },
    },
  ];

  return (
    <>
      <DataTable
        id="concessions"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.studentName} ${r.adm} ${r.reason}`}
        searchPlaceholder="Search student or reason…"
        filters={[
          { id: "kind", label: "Type", options: [{ value: "fixed", label: "Fixed amount" }, { value: "percent", label: "Percentage" }], match: (r, v) => r.kind === v },
          { id: "head", label: "Fee head", options: heads.map((h) => ({ value: h.id, label: h.name })), match: (r, v) => r.headId === v },
        ]}
        rowActions={actions}
        onRowClick={(r) => { setKind(r.kind); drawer.openView(r); }}
        rowLabel={(r) => r.studentName}
        exportName={`concessions-${yearName}`}
        emptyTitle="No concessions yet"
        emptyMessage="Add a concession for a student, e.g. sibling discount or staff child."
        toolbar={
          <Button
            onClick={() => {
              setPick([]);
              setKind("percent");
              drawer.openNew();
            }}
          >
            <Plus className="size-4" /> Add concession
          </Button>
        }
      />
      <Drawer open={drawer.open} onClose={drawer.close} title={cur ? `${drawer.readOnly ? "" : "Edit "}concession · ${cur.studentName}` : "Add concession"} description={`Academic year ${yearName}`}>
        <ActionForm key={`${cur?.id ?? "new"}-${drawer.mode}`} action={saveConcession} layout="drawer" submitLabel={cur ? "Save concession" : "Add concession"} onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly} onEditRequest={drawer.toEdit}>
          {(fe) => (
            <>
              <input type="hidden" name="year_id" value={yearId} />
              {cur && <input type="hidden" name="id" value={cur.id} />}
              <input type="hidden" name="student_id" value={cur ? cur.studentId : (pick[0] ?? "")} />
              <FormSection title="Student" columns={1}>
                {cur ? (
                  <p className="text-sm">
                    <span className="font-medium text-navy-900">{cur.studentName}</span> <span className="font-mono text-xs text-muted">{cur.adm}</span> · {cur.classLabel}
                  </p>
                ) : (
                  <>
                    <StudentPicker students={students} value={pick} onChange={(v) => setPick(v.slice(-1))} />
                    {fe.student_id?.map((e) => (
                      <p key={e} className="text-xs text-danger">{e}</p>
                    ))}
                  </>
                )}
              </FormSection>
              <FormSection title="Concession">
                <Field label="Applies to" name="fee_head_id">
                  <Select id="fee_head_id" name="fee_head_id" defaultValue={cur?.headId ?? ""}>
                    <option value="">All fee heads</option>
                    {heads.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Type" name="kind">
                  <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "fixed" | "percent")}>
                    <option value="percent">Percentage</option>
                    <option value="fixed">Fixed amount (₹)</option>
                  </Select>
                </Field>
                <Field label={kind === "percent" ? "Percentage (%)" : "Amount (₹)"} name="value" errors={fe.value} hint={kind === "fixed" ? "Taken from the last installment backwards." : "Applied to every unpaid installment, rounded down."}>
                  <Input id="value" name="value" inputMode="decimal" defaultValue={cur ? (cur.kind === "percent" ? String((cur.percentBp ?? 0) / 100) : rupeesInput(cur.amount)) : ""} required />
                </Field>
                <Field label="Reason" name="reason" errors={fe.reason} className="sm:col-span-2">
                  <Textarea id="reason" name="reason" rows={2} defaultValue={cur?.reason ?? ""} required />
                </Field>
              </FormSection>
            </>
          )}
        </ActionForm>
      </Drawer>
    </>
  );
}
