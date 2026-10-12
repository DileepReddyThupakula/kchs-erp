"use client";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveStaff } from "@/features/staff/actions";
import type { Staff } from "@/types/database";

/** Grouped staff form, used inside a drawer (sticky Save/Cancel bar). */
export function StaffForm({ staff: s, onDone }: { staff?: Staff | null; onDone: () => void }) {
  return (
    <ActionForm key={s?.id ?? "new"} action={saveStaff} layout="drawer" submitLabel={s ? "Save changes" : "Add staff member"} onCancel={onDone} onSuccess={onDone}>
      {(fe) => {
        const text = (name: keyof Staff, label: string, type = "text", required = false, hint?: string) => (
          <Field label={label} name={name} errors={fe[name]} hint={hint}>
            <Input id={name} name={name} type={type} defaultValue={(s?.[name] as string | null) ?? ""} required={required} />
          </Field>
        );
        return (
          <>
            {s && <input type="hidden" name="id" value={s.id} />}
            <FormSection title="Identity">
              {text("employee_code", "Employee code", "text", true)}
              {text("full_name", "Full name", "text", true, "Telugu script is fine too")}
              <Field label="Gender" name="gender" errors={fe.gender}>
                <Select id="gender" name="gender" defaultValue={s?.gender ?? ""}>
                  <option value="">—</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              {text("dob", "Date of birth", "date")}
            </FormSection>
            <FormSection title="Contact">
              {text("phone", "Mobile", "tel", false, "10 digits")}
              {text("email", "Email", "email")}
              <Field label="Address" name="address" errors={fe.address} className="sm:col-span-2">
                <Textarea id="address" name="address" rows={2} defaultValue={s?.address ?? ""} />
              </Field>
            </FormSection>
            <FormSection title="Job">
              {text("designation", "Designation")}
              {text("department", "Department")}
              {text("qualification", "Qualification")}
              {text("date_of_joining", "Date of joining", "date")}
              <Field label="Status" name="status" errors={fe.status}>
                <Select id="status" name="status" defaultValue={s?.status ?? "active"}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="left">Left</option>
                </Select>
              </Field>
            </FormSection>
          </>
        );
      }}
    </ActionForm>
  );
}
