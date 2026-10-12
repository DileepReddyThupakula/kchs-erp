"use client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { addHoliday } from "@/features/setup/actions";

export function HolidayForm({ yearId, min, max }: { yearId: string; min: string; max: string }) {
  return (
    <ActionForm action={addHoliday} submitLabel="Add holiday" resetOnSuccess className="grid gap-4 sm:grid-cols-3">
      {(fe) => (
        <>
          <input type="hidden" name="academic_year_id" value={yearId} />
          <Field label="Date" name="date" errors={fe.date}>
            <Input id="date" name="date" type="date" min={min} max={max} required />
          </Field>
          <Field label="Holiday name" name="name" errors={fe.name} className="sm:col-span-2">
            <Input id="name" name="name" placeholder="e.g. Sankranti" required />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
