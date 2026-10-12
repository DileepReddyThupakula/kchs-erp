"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { RowAction } from "@/components/data-table/data-table";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { addAssignment, deleteAssignments, updateAssignment } from "@/features/setup/actions";

export type AssignmentRow = {
  id: string;
  sectionId: string;
  classId: string;
  className: string;
  classOrder: number;
  section: string;
  subjectId: string;
  subject: string;
  subjectOrder: number;
  staffId: string;
  teacher: string;
  isClassTeacher: boolean;
  periods: number | null;
  mine: boolean;
};
type Opt = { id: string; name: string };

export function AssignmentsTable({
  rows,
  editable,
  yearName,
  sections,
  classes,
  subjects,
  classSubjects,
  teachers,
}: {
  rows: AssignmentRow[];
  editable: boolean;
  yearName: string;
  sections: { id: string; label: string; classId: string }[];
  classes: Opt[];
  subjects: Opt[];
  classSubjects: { class_id: string; subject_id: string }[];
  teachers: (Opt & { designation: string | null })[];
}) {
  const router = useRouter();
  const drawer = useDrawer<null>();
  const rowDrawer = useDrawer<AssignmentRow>();
  const [sectionId, setSectionId] = useState("");

  async function remove(ids: string[], clear?: () => void) {
    const res = await deleteAssignments(ids);
    if (res.error) toast.error(res.error);
    else {
      toast.success(res.message);
      clear?.();
      router.refresh();
    }
  }

  const columns: Column<AssignmentRow>[] = [
    { id: "class", header: "Class", hideable: false, cell: (r) => <span className="font-medium text-navy-900">{r.className}</span>, sortValue: (r) => r.classOrder * 100 + r.section.charCodeAt(0), exportValue: (r) => r.className, className: "whitespace-nowrap" },
    { id: "section", header: "Section", cell: (r) => r.section, sortValue: (r) => r.section },
    { id: "subject", header: "Subject", cell: (r) => r.subject, sortValue: (r) => r.subjectOrder, exportValue: (r) => r.subject, className: "whitespace-nowrap" },
    {
      id: "teacher",
      header: "Teacher",
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {r.teacher}
          {r.isClassTeacher && <Badge tone="info">Class teacher</Badge>}
          {r.mine && <Badge tone="gold">You</Badge>}
        </span>
      ),
      sortValue: (r) => r.teacher,
    },
    { id: "periods", header: "Periods / week", align: "right", cell: (r) => r.periods ?? "—", sortValue: (r) => r.periods ?? null, defaultHidden: true },
  ];

  const assignmentActions = (r: AssignmentRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => rowDrawer.openView(r) },
    ...(editable
      ? ([
          { id: "edit", kind: "edit", label: "Edit", onClick: () => rowDrawer.openEdit(r) },
          {
            id: "remove",
            kind: "menu",
            label: "Remove assignment",
            icon: Trash2,
            tone: "danger",
            confirm: { title: "Remove this assignment?", message: `${r.teacher} will no longer be linked to ${r.subject} in ${r.className} – ${r.section}.`, confirmLabel: "Remove" },
            onClick: () => remove([r.id]),
          },
        ] satisfies RowAction[])
      : []),
  ];

  const classId = sections.find((s) => s.id === sectionId)?.classId;
  const allowed = new Set(classSubjects.filter((l) => l.class_id === classId).map((l) => l.subject_id));
  const subjectOptions = subjects.filter((s) => allowed.has(s.id));

  return (
    <>
      <DataTable
        id="assignments"
        rowActions={assignmentActions}
        onRowClick={(r) => rowDrawer.openView(r)}
        rowLabel={(r) => `${r.subject}, ${r.className} – ${r.section}`}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.className} ${r.section} ${r.subject} ${r.teacher}`}
        searchPlaceholder="Search class, subject, teacher…"
        filters={[
          { id: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })), match: (r, v) => r.classId === v },
          { id: "subject", label: "Subject", options: subjects.map((s) => ({ value: s.id, label: s.name })), match: (r, v) => r.subjectId === v },
          ...(editable ? [{ id: "teacher", label: "Teacher", options: teachers.map((t) => ({ value: t.id, label: t.name })), match: (r: AssignmentRow, v: string) => r.staffId === v }] : []),
        ]}
        pageSize={50}
        selectable={editable}
        bulkActions={(sel, clear) => (
          <ConfirmDialog
            title={`Remove ${sel.length} assignment(s)?`}
            message="The selected teachers will no longer be linked to these subjects."
            confirmLabel="Remove"
            onConfirm={() => remove(sel.map((s) => s.id), clear)}
            trigger={(open) => (
              <Button size="sm" variant="danger" onClick={open}>
                <Trash2 className="size-3.5" /> Remove
              </Button>
            )}
          />
        )}
        exportName={`teacher-assignments-${yearName}`}
        emptyTitle={editable ? `No assignments in ${yearName}` : "No classes assigned to you"}
        emptyMessage={editable ? "Assign teachers to subjects in each section." : "The Admin hasn't assigned you to a section yet."}
        toolbar={
          editable && (
            <Button onClick={drawer.openNew}>
              <Plus className="size-4" /> Assign teacher
            </Button>
          )
        }
      />
      {editable && (
        <Drawer open={drawer.open} onClose={drawer.close} title="Assign a teacher" description={`Academic year ${yearName}`}>
          <ActionForm action={addAssignment} layout="drawer" submitLabel="Assign" onCancel={drawer.close} onSuccess={drawer.close}>
            {(fe) => (
              <FormSection title="Assignment" columns={1}>
                <Field label="Section" name="section_id" errors={fe.section_id}>
                  <Select id="section_id" name="section_id" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                    <option value="">Pick a section</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Subject"
                  name="subject_id"
                  errors={fe.subject_id}
                  hint={sectionId && subjectOptions.length === 0 ? "No subjects linked to this class yet (Subjects → By class)." : undefined}
                >
                  <Select id="subject_id" name="subject_id" required disabled={!sectionId}>
                    <option value="">Pick a subject</option>
                    {subjectOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Teacher" name="staff_id" errors={fe.staff_id}>
                  <Select id="staff_id" name="staff_id" required>
                    <option value="">Pick a teacher</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.designation ? ` (${t.designation})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Periods / week" name="periods_per_week" errors={fe.periods_per_week}>
                  <Input id="periods_per_week" name="periods_per_week" type="number" min={0} max={48} />
                </Field>
              </FormSection>
            )}
          </ActionForm>
        </Drawer>
      )}
      {rowDrawer.item && (
        <Drawer
          open={rowDrawer.open}
          onClose={rowDrawer.close}
          title={`${rowDrawer.item.subject} · ${rowDrawer.item.className} – ${rowDrawer.item.section}`}
          description={`Academic year ${yearName}`}
        >
          <ActionForm
            key={`${rowDrawer.item.id}-${rowDrawer.mode}`}
            action={updateAssignment}
            layout="drawer"
            submitLabel="Save assignment"
            onCancel={rowDrawer.close}
            onSuccess={rowDrawer.close}
            readOnly={rowDrawer.readOnly}
            onEditRequest={editable ? rowDrawer.toEdit : undefined}
          >
            {(fe) => (
              <FormSection title="Assignment" columns={1}>
                <input type="hidden" name="id" value={rowDrawer.item!.id} />
                <Field label="Section" name="ro-section">
                  <Input id="ro-section" value={`${rowDrawer.item!.className} – ${rowDrawer.item!.section}`} disabled readOnly />
                </Field>
                <Field label="Subject" name="ro-subject">
                  <Input id="ro-subject" value={rowDrawer.item!.subject} disabled readOnly />
                </Field>
                <Field label="Teacher" name="staff_id" errors={fe.staff_id}>
                  <Select id="staff_id" name="staff_id" defaultValue={rowDrawer.item!.staffId} required>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.designation ? ` (${t.designation})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Periods / week" name="periods_per_week" errors={fe.periods_per_week}>
                  <Input id="periods_per_week" name="periods_per_week" type="number" min={0} max={48} defaultValue={rowDrawer.item!.periods ?? ""} />
                </Field>
                {rowDrawer.item!.isClassTeacher && <p className="text-xs text-muted">This teacher is also the class teacher of this section.</p>}
              </FormSection>
            )}
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
