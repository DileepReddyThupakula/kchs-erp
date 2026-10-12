"use client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { saveAcademicYear } from "@/features/setup/actions";
import type { AcademicYear } from "@/types/database";

export function YearForm({ year }: { year?: AcademicYear }) {
  return (
    <ActionForm action={saveAcademicYear} submitLabel={year ? "Save year" : "Add year"} resetOnSuccess={!year} className="grid gap-4 sm:grid-cols-4">
      {(fe) => (
        <>
          {year && <input type="hidden" name="id" value={year.id} />}
          <Field label="Name" name="name" errors={fe.name} hint="e.g. 2026-27">
            <Input id="name" name="name" defaultValue={year?.name} required />
          </Field>
          <Field label="Starts" name="start_date" errors={fe.start_date}>
            <Input id="start_date" name="start_date" type="date" defaultValue={year?.start_date} required />
          </Field>
          <Field label="Ends" name="end_date" errors={fe.end_date}>
            <Input id="end_date" name="end_date" type="date" defaultValue={year?.end_date} required />
          </Field>
          <Field label="Status" name="status" errors={fe.status}>
            <Select id="status" name="status" defaultValue={year?.status ?? "planned"}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
        </>
      )}
    </ActionForm>
  );
}
