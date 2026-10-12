"use client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { saveClassSubjects, saveSubject } from "@/features/setup/actions";
import type { Subject } from "@/types/database";

export function SubjectForm({ subject }: { subject?: Subject }) {
  return (
    <ActionForm action={saveSubject} submitLabel={subject ? "Save subject" : "Add subject"} resetOnSuccess={!subject} className="grid gap-4 sm:grid-cols-5">
      {(fe) => (
        <>
          {subject && <input type="hidden" name="id" value={subject.id} />}
          <Field label="Name" name="name" errors={fe.name} className="sm:col-span-2">
            <Input name="name" defaultValue={subject?.name} required />
          </Field>
          <Field label="Code" name="code" errors={fe.code}>
            <Input name="code" defaultValue={subject?.code ?? ""} />
          </Field>
          <Field label="Type" name="type" errors={fe.type}>
            <Select name="type" defaultValue={subject?.type ?? "scholastic"}>
              <option value="scholastic">Scholastic (marks)</option>
              <option value="co_scholastic">Co-scholastic (grades)</option>
            </Select>
          </Field>
          <Field label="Order" name="sort_order" errors={fe.sort_order}>
            <Input name="sort_order" type="number" defaultValue={subject?.sort_order ?? 0} />
          </Field>
          {subject && (
            <Field label="Status" name="is_active">
              <Select name="is_active" defaultValue={subject.is_active ? "on" : "off"}>
                <option value="on">Active</option>
                <option value="off">Inactive</option>
              </Select>
            </Field>
          )}
        </>
      )}
    </ActionForm>
  );
}

export function ClassSubjectsForm({
  yearId,
  classId,
  subjects,
  linked,
}: {
  yearId: string;
  classId: string;
  subjects: Subject[];
  linked: { subject_id: string; is_optional: boolean }[];
}) {
  const linkedMap = new Map(linked.map((l) => [l.subject_id, l.is_optional]));
  return (
    <ActionForm action={saveClassSubjects} submitLabel="Save subjects" className="mt-3 space-y-3">
      {() => (
        <>
          <input type="hidden" name="academic_year_id" value={yearId} />
          <input type="hidden" name="class_id" value={classId} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="subject_id" value={s.id} defaultChecked={linkedMap.has(s.id)} />
                  {s.name}
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" name="optional" value={s.id} defaultChecked={linkedMap.get(s.id) === true} />
                  optional
                </label>
              </div>
            ))}
          </div>
        </>
      )}
    </ActionForm>
  );
}
