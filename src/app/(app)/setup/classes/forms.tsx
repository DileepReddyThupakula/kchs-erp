"use client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { saveClass, saveSection } from "@/features/setup/actions";
import type { SchoolClass, Section } from "@/types/database";

export function ClassForm({ cls }: { cls?: SchoolClass }) {
  return (
    <ActionForm action={saveClass} submitLabel={cls ? "Save class" : "Add class"} resetOnSuccess={!cls} className="grid gap-4 sm:grid-cols-4">
      {(fe) => (
        <>
          {cls && <input type="hidden" name="id" value={cls.id} />}
          <Field label="Class name" name="name" errors={fe.name}>
            <Input name="name" defaultValue={cls?.name} placeholder="e.g. Class 6" required />
          </Field>
          <Field label="Short name" name="short_name" errors={fe.short_name}>
            <Input name="short_name" defaultValue={cls?.short_name ?? ""} placeholder="e.g. VI" />
          </Field>
          <Field label="Order" name="sort_order" hint="Lower comes first" errors={fe.sort_order}>
            <Input name="sort_order" type="number" defaultValue={cls?.sort_order ?? 0} />
          </Field>
          <Field label="Status" name="is_active">
            <Select name="is_active" defaultValue={cls?.is_active === false ? "off" : "on"}>
              <option value="on">Active</option>
              <option value="off">Inactive</option>
            </Select>
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function SectionForm({
  yearId,
  classId,
  section,
  mediums,
  teachers,
}: {
  yearId: string;
  classId: string;
  section?: Section;
  mediums: string[];
  teachers: { id: string; full_name: string; designation: string | null }[];
}) {
  return (
    <ActionForm action={saveSection} submitLabel={section ? "Save section" : "Add section"} resetOnSuccess={!section} className="grid gap-4 sm:grid-cols-5">
      {(fe) => (
        <>
          {section && <input type="hidden" name="id" value={section.id} />}
          <input type="hidden" name="academic_year_id" value={yearId} />
          <input type="hidden" name="class_id" value={classId} />
          <Field label="Section" name="name" errors={fe.name}>
            <Input name="name" defaultValue={section?.name} placeholder="A" required />
          </Field>
          <Field label="Medium" name="medium" errors={fe.medium}>
            <Select name="medium" defaultValue={section?.medium ?? ""}>
              <option value="">Not confirmed</option>
              {mediums.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Class teacher" name="class_teacher_id" errors={fe.class_teacher_id}>
            <Select name="class_teacher_id" defaultValue={section?.class_teacher_id ?? ""}>
              <option value="">— none —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Room" name="room" errors={fe.room}>
            <Input name="room" defaultValue={section?.room ?? ""} />
          </Field>
          <Field label="Capacity" name="capacity" errors={fe.capacity}>
            <Input name="capacity" type="number" min={1} defaultValue={section?.capacity ?? ""} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
