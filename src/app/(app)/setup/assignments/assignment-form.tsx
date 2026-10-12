"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { addAssignment } from "@/features/setup/actions";

export function AssignmentForm({
  sections,
  classSubjects,
  subjects,
  teachers,
}: {
  sections: { id: string; label: string; class_id: string }[];
  classSubjects: { class_id: string; subject_id: string }[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; full_name: string; designation: string | null }[];
}) {
  const [sectionId, setSectionId] = useState("");
  const classId = sections.find((s) => s.id === sectionId)?.class_id;
  const allowed = new Set(classSubjects.filter((l) => l.class_id === classId).map((l) => l.subject_id));
  const subjectOptions = subjects.filter((s) => allowed.has(s.id));

  return (
    <ActionForm action={addAssignment} submitLabel="Assign" className="grid gap-4 sm:grid-cols-4">
      {(fe) => (
        <>
          <Field label="Section" name="section_id" errors={fe.section_id}>
            <Select name="section_id" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
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
            hint={sectionId && subjectOptions.length === 0 ? "No subjects linked to this class yet (Setup → Subjects)." : undefined}
          >
            <Select name="subject_id" required disabled={!sectionId}>
              <option value="">Pick a subject</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teacher" name="staff_id" errors={fe.staff_id}>
            <Select name="staff_id" required>
              <option value="">Pick a teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                  {t.designation ? ` (${t.designation})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Periods / week" name="periods_per_week" errors={fe.periods_per_week}>
            <Input name="periods_per_week" type="number" min={0} max={48} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
