"use client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveStaff } from "@/features/staff/actions";
import type { Staff } from "@/types/database";

export function StaffForm({ staff: s }: { staff?: Staff }) {
  return (
    <ActionForm action={saveStaff} submitLabel={s ? "Save" : "Add staff member"} className="grid gap-4 sm:grid-cols-2">
      {(fe) => {
        const text = (name: keyof Staff, label: string, type = "text", required = false) => (
          <Field label={label} name={name} errors={fe[name]}>
            <Input id={name} name={name} type={type} defaultValue={(s?.[name] as string | null) ?? ""} required={required} />
          </Field>
        );
        return (
          <>
            {s && <input type="hidden" name="id" value={s.id} />}
            {text("employee_code", "Employee code", "text", true)}
            {text("full_name", "Full name", "text", true)}
            <Field label="Gender" name="gender" errors={fe.gender}>
              <Select id="gender" name="gender" defaultValue={s?.gender ?? ""}>
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            {text("dob", "Date of birth", "date")}
            {text("phone", "Mobile", "tel")}
            {text("email", "Email", "email")}
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
            <Field label="Address" name="address" errors={fe.address} className="sm:col-span-2">
              <Textarea id="address" name="address" rows={2} defaultValue={s?.address ?? ""} />
            </Field>
          </>
        );
      }}
    </ActionForm>
  );
}
