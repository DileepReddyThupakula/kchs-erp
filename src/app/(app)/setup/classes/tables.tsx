"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Languages, Pencil, Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusChip } from "@/components/ui/card";
import { ActionForm, DeleteButton, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { deleteClass, deleteSection, saveClass, saveSection, setSectionsMedium } from "@/features/setup/actions";
import type { SchoolClass, Section } from "@/types/database";

export type SectionRow = Section & { className: string; classOrder: number; classTeacher: string | null; students: number | null };
export type ClassRow = SchoolClass & { sectionCount: number };
type Opt = { id: string; name: string };

// ------------------------------------------------------------------ sections
export function SectionsTable({
  rows,
  editable,
  yearId,
  yearName,
  classes,
  mediums,
  teachers,
}: {
  rows: SectionRow[];
  editable: boolean;
  yearId: string;
  yearName: string;
  classes: Opt[];
  mediums: string[];
  teachers: Opt[];
}) {
  const drawer = useDrawer<SectionRow>();
  const router = useRouter();

  const columns: Column<SectionRow>[] = [
    { id: "class", header: "Class", cell: (r) => <span className="font-medium text-navy-900">{r.className}</span>, sortValue: (r) => r.classOrder, exportValue: (r) => r.className, hideable: false },
    { id: "section", header: "Section", cell: (r) => r.name, sortValue: (r) => r.name },
    {
      id: "medium",
      header: "Medium",
      cell: (r) => (r.medium ? <StatusChip status="declared" label={r.medium} /> : <StatusChip status="inactive" label="Not set" />),
      sortValue: (r) => r.medium ?? "",
    },
    { id: "teacher", header: "Class teacher", cell: (r) => r.classTeacher ?? <span className="text-muted">Not assigned</span>, sortValue: (r) => r.classTeacher ?? "" },
    { id: "students", header: "Students", align: "right", cell: (r) => (r.students === null ? <span className="text-muted">—</span> : r.students), sortValue: (r) => r.students ?? -1, exportValue: (r) => r.students ?? "" },
    { id: "room", header: "Room", cell: (r) => r.room ?? "—", sortValue: (r) => r.room ?? "", defaultHidden: true },
    { id: "capacity", header: "Capacity", align: "right", cell: (r) => r.capacity ?? "—", sortValue: (r) => r.capacity ?? null, defaultHidden: true },
  ];
  if (editable) {
    columns.push({
      id: "actions",
      header: "Actions",
      hideable: false,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Edit ${r.className} ${r.name}`} onClick={() => drawer.openEdit(r)}>
            <Pencil />
          </IconButton>
          <DeleteButton action={deleteSection} id={r.id} iconOnly label="Delete section" title={`Delete ${r.className} – ${r.name}?`} confirmText="Teacher assignments for this section are removed too." />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        id="sections"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.className} ${r.name} ${r.classTeacher ?? ""} ${r.medium ?? ""}`}
        searchPlaceholder="Search class, section, teacher…"
        filters={[
          { id: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })), match: (r, v) => r.class_id === v },
          { id: "medium", label: "Medium", options: [...mediums.map((m) => ({ value: m, label: m })), { value: "__none", label: "Not set" }], match: (r, v) => (v === "__none" ? !r.medium : r.medium === v) },
          { id: "teacher", label: "Class teacher", options: [{ value: "set", label: "Assigned" }, { value: "none", label: "Not assigned" }], match: (r, v) => (v === "set" ? !!r.class_teacher_id : !r.class_teacher_id) },
        ]}
        selectable={editable}
        bulkActions={(sel, clear) =>
          mediums.map((m) => (
            <Button
              key={m}
              size="sm"
              variant="accent"
              onClick={async () => {
                const res = await setSectionsMedium(sel.map((s) => s.id), m);
                if (res.error) toast.error(res.error);
                else {
                  toast.success(res.message);
                  clear();
                  router.refresh();
                }
              }}
            >
              <Languages className="size-3.5" /> Set {m}
            </Button>
          ))
        }
        exportName={`sections-${yearName}`}
        emptyTitle={`No sections in ${yearName}`}
        emptyMessage={editable ? "Add the first section for this year." : "The Admin hasn't added sections yet."}
        toolbar={
          editable && (
            <Button size="md" onClick={drawer.openNew}>
              <Plus className="size-4" /> Add section
            </Button>
          )
        }
      />
      {editable && (
        <Drawer
          open={drawer.open}
          onClose={drawer.close}
          title={drawer.item ? `Edit ${drawer.item.className} – ${drawer.item.name}` : "Add section"}
          description={`Academic year ${yearName}`}
        >
          <ActionForm key={drawer.item?.id ?? "new"} action={saveSection} layout="drawer" submitLabel={drawer.item ? "Save section" : "Add section"} onCancel={drawer.close} onSuccess={drawer.close}>
            {(fe) => {
              const s = drawer.item;
              return (
                <>
                  {s && <input type="hidden" name="id" value={s.id} />}
                  <input type="hidden" name="academic_year_id" value={yearId} />
                  <FormSection title="Section">
                    <Field label="Class" name="class_id" errors={fe.class_id}>
                      <Select id="class_id" name="class_id" defaultValue={s?.class_id ?? ""} required>
                        <option value="" disabled>
                          Pick a class
                        </option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Section name" name="name" errors={fe.name} hint="e.g. A">
                      <Input id="name" name="name" defaultValue={s?.name ?? ""} required />
                    </Field>
                    <Field label="Medium" name="medium" errors={fe.medium}>
                      <Select id="medium" name="medium" defaultValue={s?.medium ?? ""}>
                        <option value="">Not confirmed</option>
                        {mediums.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Class teacher" name="class_teacher_id" errors={fe.class_teacher_id}>
                      <Select id="class_teacher_id" name="class_teacher_id" defaultValue={s?.class_teacher_id ?? ""}>
                        <option value="">— none —</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormSection>
                  <FormSection title="Room">
                    <Field label="Room" name="room" errors={fe.room}>
                      <Input id="room" name="room" defaultValue={s?.room ?? ""} />
                    </Field>
                    <Field label="Capacity" name="capacity" errors={fe.capacity}>
                      <Input id="capacity" name="capacity" type="number" min={1} defaultValue={s?.capacity ?? ""} />
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

// ------------------------------------------------------------------ classes
export function ClassesTable({ rows, editable }: { rows: ClassRow[]; editable: boolean }) {
  const drawer = useDrawer<ClassRow>();
  const columns: Column<ClassRow>[] = [
    { id: "order", header: "Order", align: "right", cell: (r) => <span className="tabular-nums text-muted">{r.sort_order}</span>, sortValue: (r) => r.sort_order },
    { id: "name", header: "Class", hideable: false, cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name },
    { id: "short", header: "Short name", cell: (r) => r.short_name ?? "—", sortValue: (r) => r.short_name ?? "" },
    { id: "sections", header: "Sections (this year)", align: "right", cell: (r) => r.sectionCount, sortValue: (r) => r.sectionCount },
    { id: "status", header: "Status", cell: (r) => <StatusChip status={r.is_active ? "active" : "inactive"} />, sortValue: (r) => (r.is_active ? "active" : "inactive") },
  ];
  if (editable) {
    columns.push({
      id: "actions",
      header: "Actions",
      hideable: false,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Edit ${r.name}`} onClick={() => drawer.openEdit(r)}>
            <Pencil />
          </IconButton>
          <DeleteButton action={deleteClass} id={r.id} iconOnly label="Delete class" title={`Delete ${r.name}?`} confirmText="Only possible when the class has no sections. Otherwise mark it inactive." />
        </div>
      ),
    });
  }
  return (
    <>
      <DataTable
        id="classes"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.short_name ?? ""}`}
        searchPlaceholder="Search classes…"
        filters={[{ id: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], match: (r, v) => (v === "active") === r.is_active }]}
        exportName="classes"
        emptyMessage={editable ? "Add your first class." : "The Admin hasn't added classes yet."}
        toolbar={
          editable && (
            <Button onClick={drawer.openNew}>
              <Plus className="size-4" /> Add class
            </Button>
          )
        }
      />
      {editable && (
        <Drawer open={drawer.open} onClose={drawer.close} title={drawer.item ? `Edit ${drawer.item.name}` : "Add class"}>
          <ActionForm key={drawer.item?.id ?? "new"} action={saveClass} layout="drawer" submitLabel={drawer.item ? "Save class" : "Add class"} onCancel={drawer.close} onSuccess={drawer.close}>
            {(fe) => {
              const c = drawer.item;
              return (
                <>
                  {c && <input type="hidden" name="id" value={c.id} />}
                  <FormSection title="Class">
                    <Field label="Class name" name="name" errors={fe.name} hint="e.g. Class 6">
                      <Input id="name" name="name" defaultValue={c?.name ?? ""} required />
                    </Field>
                    <Field label="Short name" name="short_name" errors={fe.short_name} hint="e.g. VI">
                      <Input id="short_name" name="short_name" defaultValue={c?.short_name ?? ""} />
                    </Field>
                    <Field label="Order" name="sort_order" errors={fe.sort_order} hint="Lower comes first">
                      <Input id="sort_order" name="sort_order" type="number" defaultValue={c?.sort_order ?? 0} />
                    </Field>
                    <Field label="Status" name="is_active">
                      <Select id="is_active" name="is_active" defaultValue={c?.is_active === false ? "off" : "on"}>
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
