"use client";
import { useRouter } from "next/navigation";
import { runFormAction } from "@/components/data-table/run-action";
import type { RowAction } from "@/components/data-table/data-table";
import { Plus, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, StatusChip } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { deleteSubject, saveClassSubjects, saveSubject } from "@/features/setup/actions";
import type { Subject } from "@/types/database";

export type SubjectRow = Subject & { classCount: number };
export type ClassLinkRow = {
  id: string;
  name: string;
  order: number;
  links: { subject_id: string; is_optional: boolean }[];
  scholastic: string[];
  coScholastic: string[];
};

const TYPE_LABEL: Record<string, string> = { scholastic: "Scholastic", co_scholastic: "Co-scholastic" };

export function SubjectsTable({ rows, editable }: { rows: SubjectRow[]; editable: boolean }) {
  const drawer = useDrawer<SubjectRow>();
  const router = useRouter();
  const subjectActions = (r: SubjectRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
    ...(editable
      ? ([
          { id: "edit", kind: "edit", label: "Edit", onClick: () => drawer.openEdit(r) },
          {
            id: "delete",
            kind: "menu",
            label: "Delete subject",
            icon: Trash2,
            tone: "danger",
            confirm: { title: `Delete ${r.name}?`, message: "Only possible when no class or teacher uses it. Otherwise mark it inactive.", confirmLabel: "Delete" },
            onClick: () => runFormAction(deleteSubject, { id: r.id }, router.refresh),
          },
        ] satisfies RowAction[])
      : []),
  ];
  const columns: Column<SubjectRow>[] = [
    { id: "name", header: "Subject", hideable: false, cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name, className: "whitespace-nowrap", pinned: "left" },
    { id: "te", header: "Telugu name", cell: (r) => (r.name_te ? <span>{r.name_te}{!r.name_te_verified && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">VERIFY</span>}</span> : <span className="text-muted">—</span>), sortValue: (r) => r.name_te ?? "" },
    { id: "code", header: "Code", cell: (r) => <span className="font-mono text-xs">{r.code ?? "—"}</span>, sortValue: (r) => r.code ?? "" },
    { id: "type", header: "Type", cell: (r) => <StatusChip status={r.type} label={TYPE_LABEL[r.type]} />, sortValue: (r) => TYPE_LABEL[r.type] },
    { id: "classes", header: "Classes", align: "right", cell: (r) => r.classCount, sortValue: (r) => r.classCount },
    { id: "order", header: "Order", align: "right", cell: (r) => r.sort_order, sortValue: (r) => r.sort_order, defaultHidden: true },
    { id: "status", header: "Status", cell: (r) => <StatusChip status={r.is_active ? "active" : "inactive"} />, sortValue: (r) => (r.is_active ? "active" : "inactive") },
  ];
  return (
    <>
      <DataTable
        id="subjects"
        rowActions={subjectActions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.code ?? ""}`}
        searchPlaceholder="Search subjects…"
        filters={[
          { id: "type", label: "Type", options: [{ value: "scholastic", label: "Scholastic" }, { value: "co_scholastic", label: "Co-scholastic" }], match: (r, v) => r.type === v },
          { id: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], match: (r, v) => (v === "active") === r.is_active },
        ]}
        exportName="subjects"
        emptyMessage={editable ? "Add subjects, then link them to classes." : "The Admin hasn't added subjects yet."}
        toolbar={
          editable && (
            <Button onClick={drawer.openNew}>
              <Plus className="size-4" /> Add subject
            </Button>
          )
        }
      />
      {(editable || drawer.readOnly) && (
        <Drawer open={drawer.open} onClose={drawer.close} title={drawer.item ? `${drawer.readOnly ? "" : "Edit "}${drawer.item.name}` : "Add subject"}>
          <ActionForm key={`${drawer.item?.id ?? "new"}-${drawer.mode}`} action={saveSubject} layout="drawer" submitLabel={drawer.item ? "Save subject" : "Add subject"} onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly} onEditRequest={editable ? drawer.toEdit : undefined}>
            {(fe) => {
              const s = drawer.item;
              return (
                <>
                  {s && <input type="hidden" name="id" value={s.id} />}
                  <FormSection title="Subject">
                    <Field label="Name" name="name" errors={fe.name} className="sm:col-span-2">
                      <Input id="name" name="name" defaultValue={s?.name ?? ""} required />
                    </Field>
                    <Field label="Telugu name (తెలుగు)" name="name_te" errors={fe.name_te} hint="Shown on the diary card and message. Standard names are pre-filled: please have a Telugu speaker VERIFY them." className="sm:col-span-2">
                      <Input id="name_te" name="name_te" lang="te" defaultValue={s?.name_te ?? ""} />
                    </Field>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" name="name_te_verified" defaultChecked={s?.name_te_verified ?? false} /> Telugu name checked by a Telugu speaker
                    </label>
                    <Field label="Code" name="code" errors={fe.code}>
                      <Input id="code" name="code" defaultValue={s?.code ?? ""} />
                    </Field>
                    <Field label="Type" name="type" errors={fe.type}>
                      <Select id="type" name="type" defaultValue={s?.type ?? "scholastic"}>
                        <option value="scholastic">Scholastic (marks)</option>
                        <option value="co_scholastic">Co-scholastic (grades)</option>
                      </Select>
                    </Field>
                    <Field label="Order" name="sort_order" errors={fe.sort_order}>
                      <Input id="sort_order" name="sort_order" type="number" defaultValue={s?.sort_order ?? 0} />
                    </Field>
                    <Field label="Status" name="is_active">
                      <Select id="is_active" name="is_active" defaultValue={s?.is_active === false ? "off" : "on"}>
                        <option value="on">Active</option>
                        <option value="off">Inactive</option>
                      </Select>
                    </Field>
                  </FormSection>
                </>
              );
            }}
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}

export function ClassSubjectsTable({ rows, editable, yearId, subjects }: { rows: ClassLinkRow[]; editable: boolean; yearId: string; subjects: Subject[] }) {
  const drawer = useDrawer<ClassLinkRow>();
  const chips = (names: string[]) =>
    names.length ? (
      <div className="flex flex-wrap gap-1">
        {names.map((n) => (
          <Badge key={n} tone="info">
            {n}
          </Badge>
        ))}
      </div>
    ) : (
      <span className="text-muted">None</span>
    );
  const columns: Column<ClassLinkRow>[] = [
    { id: "class", header: "Class", hideable: false, cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.order, exportValue: (r) => r.name, className: "whitespace-nowrap", pinned: "left" },
    { id: "scholastic", header: "Subjects", cell: (r) => chips(r.scholastic), exportValue: (r) => r.scholastic.join(", ") },
    { id: "co", header: "Co-scholastic", cell: (r) => chips(r.coScholastic), exportValue: (r) => r.coScholastic.join(", "), defaultHidden: true },
    { id: "count", header: "Total", align: "right", cell: (r) => r.links.length, sortValue: (r) => r.links.length },
  ];
  const linked = new Map(drawer.item?.links.map((l) => [l.subject_id, l.is_optional]) ?? []);
  const group = (type: string) => subjects.filter((s) => s.type === type);
  return (
    <>
      <DataTable
        id="class-subjects"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.scholastic.join(" ")}`}
        exportName="subjects-by-class"
        rowActions={(r) => [
          { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
          ...(editable ? [{ id: "edit", kind: "edit" as const, label: "Change subjects", onClick: () => drawer.openEdit(r) }] : []),
        ]}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
      />
      {drawer.item && (
        <Drawer open={drawer.open} onClose={drawer.close} title={`Subjects for ${drawer.item.name}`} description={drawer.readOnly ? undefined : "Tick the subjects this class studies this year."}>
          <ActionForm key={`${drawer.item.id}-${drawer.mode}`} action={saveClassSubjects} layout="drawer" submitLabel="Save subjects" onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly} onEditRequest={editable ? drawer.toEdit : undefined}>
            {() => (
              <>
                <input type="hidden" name="academic_year_id" value={yearId} />
                <input type="hidden" name="class_id" value={drawer.item!.id} />
                {(["scholastic", "co_scholastic"] as const).map((type) => (
                  <FormSection key={type} title={TYPE_LABEL[type]} columns={1}>
                    {group(type).map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-gold-300 has-[:checked]:bg-gold-50/60">
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" name="subject_id" value={s.id} defaultChecked={linked.has(s.id)} className="size-4 accent-navy-700" />
                          {s.name}
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted">
                          <input type="checkbox" name="optional" value={s.id} defaultChecked={linked.get(s.id) === true} className="accent-navy-700" />
                          optional
                        </label>
                      </div>
                    ))}
                  </FormSection>
                ))}
              </>
            )}
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
