"use client";
import { ActionForm } from "@/components/ui/action-form";
import { saveDuties } from "@/features/staff/actions";
import { DUTY_INFO, dutiesFor, type AppRole, type Duty } from "@/lib/auth/permissions";

/** Admin ticks which duties a teacher or office person has (fee access: office staff only). */
export function DutiesPanel({ staffId, granted, role }: { staffId: string; granted: Duty[]; role: AppRole }) {
  return (
    <ActionForm action={saveDuties} submitLabel="Save duties" className="space-y-3">
      {() => (
        <>
          <input type="hidden" name="staff_id" value={staffId} />
          <ul className="space-y-2">
            {dutiesFor(role).map((d) => (
              <li key={d}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 transition-colors hover:border-navy-200 hover:bg-navy-50 has-[:checked]:border-gold-300 has-[:checked]:bg-gold-50">
                  <input type="checkbox" name="duty" value={d} defaultChecked={granted.includes(d)} className="mt-1 size-4 accent-navy-700" />
                  <span>
                    <span className="block text-sm font-medium text-navy-900">{DUTY_INFO[d].label}</span>
                    <span className="block text-xs text-muted">{DUTY_INFO[d].help}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </ActionForm>
  );
}
