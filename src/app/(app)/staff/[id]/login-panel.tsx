"use client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { changeRole, createLogin, resetPassword } from "@/features/staff/actions";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";

const ROLES = ASSIGNABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));

export function LoginPanel({
  staffId,
  hasLogin,
  role,
  email,
  isSelf,
}: {
  staffId: string;
  hasLogin: boolean;
  role: AppRole | null;
  email: string | null;
  isSelf: boolean;
}) {
  if (!hasLogin) {
    return (
      <ActionForm action={createLogin} submitLabel="Create login" className="space-y-3">
        {(fe) => (
          <>
            <input type="hidden" name="staff_id" value={staffId} />
            <Field label="Login email" name="email" errors={fe.email}>
              <Input name="email" type="email" defaultValue={email ?? ""} required />
            </Field>
            <Field label="Temporary password" name="password" errors={fe.password} hint="At least 10 characters. They choose their own at first sign-in.">
              <Input name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Role" name="app_role" errors={fe.app_role}>
              <Select name="app_role" defaultValue="teacher">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </ActionForm>
    );
  }
  return (
    <div className="space-y-5">
      <ActionForm action={changeRole} submitLabel="Update access" className="space-y-3">
        {(fe) => (
          <>
            <input type="hidden" name="staff_id" value={staffId} />
            <Field label="Role" name="app_role" errors={fe.app_role} hint={isSelf ? "Careful: this is your own account." : undefined}>
              <Select name="app_role" defaultValue={role && (ASSIGNABLE_ROLES as readonly string[]).includes(role) ? role : ""}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
                <option value="">No access (revoke)</option>
              </Select>
            </Field>
          </>
        )}
      </ActionForm>
      <ActionForm action={resetPassword} submitLabel="Set new password" resetOnSuccess className="space-y-3">
        {(fe) => (
          <>
            <input type="hidden" name="staff_id" value={staffId} />
            <Field label="New password" name="password" errors={fe.password}>
              <Input name="password" type="password" autoComplete="new-password" required />
            </Field>
          </>
        )}
      </ActionForm>
    </div>
  );
}
