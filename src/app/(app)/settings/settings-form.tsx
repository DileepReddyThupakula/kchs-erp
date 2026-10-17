"use client";
import { startTransition, useActionState } from "react";
import { updateSettings, uploadBrandingImage } from "@/features/settings/actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { initialActionState } from "@/lib/utils";
import type { SchoolSettings } from "@/types/database";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SettingsForm({ settings: s, editable }: { settings: SchoolSettings; editable: boolean }) {
  const [state, action, pending] = useActionState(updateSettings, initialActionState);
  const fe = state.fieldErrors ?? {};
  const text = (name: keyof SchoolSettings, label: string, hint?: string) => (
    <Field label={label} name={name} hint={hint} errors={fe[name]}>
      <Input id={name} name={name} defaultValue={(s[name] as string | null) ?? ""} disabled={!editable} />
    </Field>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">School</h2>
        {text("name", "School name")}
        {text("short_name", "Short name", "Shown in the menu bar")}
        <Field label="Motto" name="motto" hint="Shown on the login page" errors={fe.motto}>
          <Input id="motto" name="motto" defaultValue={((s.extra as { motto?: string } | null)?.motto) ?? ""} disabled={!editable} />
        </Field>
        {text("board", "Board / curriculum")}
        {text("affiliation_no", "Recognition / affiliation no.")}
        {text("udise_code", "UDISE code", "11 digits")}
        {text("principal_name", "Principal name")}
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Address & contact</h2>
        {text("address_line1", "Address line 1")}
        {text("address_line2", "Address line 2")}
        {text("city", "Town / city")}
        {text("district", "District")}
        {text("state", "State")}
        {text("pincode", "Pincode")}
        {text("phone", "Phone")}
        {text("email", "Email")}
        {text("website", "Website")}
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Academic calendar</h2>
        <Field label="Working days" errors={fe.working_days} className="sm:col-span-2">
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="working_days" value={i + 1} defaultChecked={s.working_days.includes(i + 1)} disabled={!editable} />
                {d}
              </label>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="second_saturday_holiday" defaultChecked={s.second_saturday_holiday} disabled={!editable} />
          2nd Saturday of every month is a holiday (generated automatically for new academic years)
        </label>
        <Field label="Periods per day" name="periods_per_day" errors={fe.periods_per_day}>
          <Input id="periods_per_day" name="periods_per_day" type="number" min={1} max={15} defaultValue={s.periods_per_day} disabled={!editable} />
        </Field>
        <Field label="Mediums" name="mediums" hint="Comma-separated, e.g. English, Telugu" errors={fe.mediums}>
          <Input id="mediums" name="mediums" defaultValue={s.mediums.join(", ")} disabled={!editable} />
        </Field>
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Numbering</h2>
        {text("admission_no_prefix", "Admission number prefix")}
        {text("receipt_no_prefix", "Fee receipt prefix")}
        {text("circular_prefix", "Circular number prefix", "Circulars are numbered PREFIX/2026-27/001. Empty = the school short name.")}
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Automatic Telugu translation</h2>
        <Field label="Monthly limit (characters)" name="translation_monthly_cap" hint="Translation switches itself off at this limit and starts again next month. Lines then show “Translation pending” and can be typed by hand." errors={fe.translation_monthly_cap}>
          <Input id="translation_monthly_cap" name="translation_monthly_cap" type="number" min={0} step={1000} defaultValue={s.translation_monthly_cap ?? 1500000} disabled={!editable} />
        </Field>
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">WhatsApp group labels</h2>
        {text("staff_group_name", "Staff WhatsApp group name", "Only a label in the notice send checklist, e.g. “KCHS staff group”. Class parent groups are named under Classes & sections.")}
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Exams</h2>
        <Field label="Default pass mark (%)" name="default_pass_percent" hint="A subject passes at this percentage unless its own pass mark is set on the Exams → Scheme tab (for example Hindi)." errors={fe.default_pass_percent}>
          <Input id="default_pass_percent" name="default_pass_percent" type="number" min={0} max={100} step="0.5" defaultValue={s.default_pass_percent ?? 35} disabled={!editable} />
        </Field>
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">Diary</h2>
        <Field label="Diary submission deadline" name="diary_deadline" hint="Teachers submit their subject's diary before this time. Classes still incomplete after it are flagged late." errors={fe.diary_deadline}>
          <Input id="diary_deadline" name="diary_deadline" type="time" defaultValue={(s.diary_deadline ?? "15:30").slice(0, 5)} disabled={!editable} />
        </Field>
      </Card>
      {editable && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
          <FormMessage state={state} />
        </div>
      )}
    </form>
  );
}

export function BrandingUpload({ kind }: { kind: "logo" | "signature" }) {
  const [state, action] = useActionState(uploadBrandingImage, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full text-sm" />
      <SubmitButton variant="secondary" pendingText="Uploading…">
        Upload
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
