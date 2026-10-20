"use client";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { AlertCircle, Lock, Save } from "lucide-react";
import { saveStudentForm } from "@/features/students/actions";
import { GROUP_LABEL, maskId, RELATIONS } from "@/features/students/fields";
import type { SectionOption, StudentProfileData } from "@/features/students/queries";
import type { StudentDocumentType, StudentFieldDefinition } from "@/types/database";
import { FormSection } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { initialActionState } from "@/lib/utils";

const SECTIONS = [
  ["basic", "Basic"],
  ["class", "Class"],
  ["family", "Family"],
  ["address", "Address"],
  ["government", "Government details"],
  ["previous", "Previous school"],
  ["facilities", "Facilities"],
  ["documents", "Documents"],
] as const;

function DefinitionInput({
  def,
  value,
  masked,
  errors,
}: {
  def: StudentFieldDefinition;
  value: unknown;
  masked?: string;
  errors?: string[];
}) {
  const name = `${def.sensitive ? "x" : "d"}.${def.key}`;
  const label = `${def.label}${def.required_for_gov ? " *" : ""}`;
  const common = { id: name, name, "aria-invalid": !!errors?.length };
  if (def.sensitive) {
    return (
      <Field label={label} name={name} errors={errors} hint={masked ? "Leave blank to keep the saved number" : def.help ?? undefined}>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input {...common} className="pl-9 font-mono" inputMode="numeric" autoComplete="off" placeholder={masked ? maskId(masked) : "Enter number"} />
        </div>
        {masked && (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name={`${name}.clear`} className="accent-navy-700" /> Remove the saved number
          </label>
        )}
      </Field>
    );
  }
  switch (def.field_type) {
    case "number":
      return (
        <Field label={label} name={name} errors={errors} hint={def.help ?? undefined}>
          <Input {...common} type="number" step="any" defaultValue={(value as number | undefined) ?? ""} />
        </Field>
      );
    case "date":
      return (
        <Field label={label} name={name} errors={errors}>
          <Input {...common} type="date" defaultValue={(value as string | undefined) ?? ""} />
        </Field>
      );
    case "boolean":
      return (
        <Field label={label} name={name} errors={errors}>
          <Select {...common} defaultValue={value === true ? "yes" : value === false ? "no" : ""}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
      );
    case "select":
      return (
        <Field label={label} name={name} errors={errors} hint={def.help ?? undefined}>
          <Select {...common} defaultValue={(value as string | undefined) ?? ""}>
            <option value="">—</option>
            {def.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "multiselect":
      return (
        <Field label={label} errors={errors} className="sm:col-span-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {def.options?.map((o) => (
              <label key={o} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name={name} value={o} defaultChecked={Array.isArray(value) && value.includes(o)} className="accent-navy-700" />
                {o}
              </label>
            ))}
          </div>
        </Field>
      );
    default:
      return (
        <Field label={label} name={name} errors={errors} hint={def.help ?? undefined}>
          <Input {...common} defaultValue={(value as string | undefined) ?? ""} />
        </Field>
      );
  }
}

export function StudentForm({
  sections,
  definitions,
  docTypes,
  yearId,
  existing,
}: {
  sections: SectionOption[];
  definitions: StudentFieldDefinition[];
  docTypes: StudentDocumentType[];
  yearId: string;
  existing?: StudentProfileData;
}) {
  const [state, action, pending] = useActionState(saveStudentForm, initialActionState);
  const fe = state.fieldErrors ?? {};
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [state]);

  const s = existing?.student;
  const g = (rel: string) => existing?.guardians.find((x) => x.relation === rel || (rel === "guardian" && !["father", "mother"].includes(x.relation)));
  const primaryRel = existing?.guardians.find((x) => x.is_primary)?.relation;
  const primary = primaryRel === "father" || primaryRel === "mother" ? primaryRel : primaryRel ? "guardian" : "father";
  const details = existing?.details ?? {};
  const defsIn = (groups: StudentFieldDefinition["field_group"][]) => definitions.filter((d) => groups.includes(d.field_group));
  const errCount = Object.keys(fe).length;

  const guardianBlock = (who: "father" | "mother" | "guardian", title: string) => {
    const cur = g(who);
    const p = `g.${who}`;
    return (
      <FormSection title={title} columns={2}>
        {cur && <input type="hidden" name={`${p}.guardian_id`} value={cur.guardian_id} />}
        <Field label="Name" name={`${p}.full_name`} errors={fe[`${p}.full_name`]}>
          <Input id={`${p}.full_name`} name={`${p}.full_name`} defaultValue={cur?.guardian.full_name ?? ""} />
        </Field>
        <Field label="Mobile" name={`${p}.phone`} errors={fe[`${p}.phone`]} hint="10 digits">
          <Input id={`${p}.phone`} name={`${p}.phone`} type="tel" inputMode="numeric" defaultValue={cur?.guardian.phone ?? ""} />
        </Field>
        {who === "guardian" ? (
          <Field label="Relation" name="g.guardian.relation">
            <Select id="g.guardian.relation" name="g.guardian.relation" defaultValue={cur?.relation ?? "guardian"}>
              {RELATIONS.filter((r) => r !== "father" && r !== "mother").map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Occupation" name={`${p}.occupation`}>
              <Input id={`${p}.occupation`} name={`${p}.occupation`} defaultValue={cur?.guardian.occupation ?? ""} />
            </Field>
            <Field label="Education" name={`${p}.education`}>
              <Input id={`${p}.education`} name={`${p}.education`} defaultValue={cur?.guardian.education ?? ""} />
            </Field>
          </>
        )}
      </FormSection>
    );
  };

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        // handler (not the action prop) so a failed save keeps everything typed
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <div ref={topRef} />
      {existing && <input type="hidden" name="id" value={existing.student.id} />}
      <input type="hidden" name="e.academic_year_id" value={yearId} />

      {/* jump links */}
      <nav aria-label="Form sections" className="sticky top-0 z-10 -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:top-[53px] lg:-mx-8 lg:px-8">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50">
            {label}
          </a>
        ))}
      </nav>

      {errCount > 0 && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="size-4" aria-hidden /> {errCount} field{errCount === 1 ? "" : "s"} need attention. They are marked in red below.
        </p>
      )}

      <div className="space-y-5">
        <div id="basic" className="scroll-mt-28 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <FormSection title="Basic" description="Fields marked * are required.">
            <Field label="Admission number" name="s.admission_no" errors={fe["s.admission_no"]} hint={existing ? undefined : "Leave blank to generate the next number"}>
              <Input id="s.admission_no" name="s.admission_no" defaultValue={s?.admission_no ?? ""} className="font-mono uppercase" />
            </Field>
            <Field label="Full name *" name="s.full_name" errors={fe["s.full_name"]} hint="Telugu script is fine">
              <Input id="s.full_name" name="s.full_name" defaultValue={s?.full_name ?? ""} required />
            </Field>
            <Field label="Gender *" name="s.gender" errors={fe["s.gender"]}>
              <Select id="s.gender" name="s.gender" defaultValue={s?.gender ?? ""} required>
                <option value="" disabled>
                  Pick
                </option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth *" name="s.date_of_birth" errors={fe["s.date_of_birth"]}>
              <Input id="s.date_of_birth" name="s.date_of_birth" type="date" defaultValue={s?.date_of_birth ?? ""} required />
            </Field>
            <Field label="Admission date" name="s.admission_date" errors={fe["s.admission_date"]} hint="Blank = today">
              <Input id="s.admission_date" name="s.admission_date" type="date" defaultValue={s?.admission_date ?? ""} />
            </Field>
            <Field label="Photo" name="photo" errors={fe.photo} hint="JPEG or PNG, at least 300 x 400 pixels, under 5 MB">
              <div className="flex items-center gap-3">
                {existing?.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={existing.photoUrl} alt="" className="size-12 rounded-full object-cover ring-2 ring-gold-300" />
                )}
                <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy-800" />
              </div>
            </Field>
          </FormSection>
        </div>

        <div id="class" className="scroll-mt-28 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <FormSection title="Class (this academic year)">
            <Field label="Class & section" name="e.section_id" errors={fe["e.section_id"]}>
              <Select id="e.section_id" name="e.section_id" defaultValue={existing?.current?.section_id ?? ""}>
                <option value="">Not enrolled yet</option>
                {sections.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Roll number" name="e.roll_no" errors={fe["e.roll_no"]}>
              <Input id="e.roll_no" name="e.roll_no" type="number" min={1} defaultValue={existing?.current?.roll_no ?? ""} />
            </Field>
          </FormSection>
        </div>

        <div id="family" className="scroll-mt-28 space-y-5 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          {!existing && (
            <FormSection title="Sibling already in school?" description="Enter the sibling's admission number to share the same parents. Then the parent fields below are optional.">
              <Field label="Sibling admission number" name="sibling_admission_no" errors={fe.sibling_admission_no}>
                <Input id="sibling_admission_no" name="sibling_admission_no" className="font-mono uppercase" />
              </Field>
            </FormSection>
          )}
          {guardianBlock("father", "Father")}
          {guardianBlock("mother", "Mother")}
          {guardianBlock("guardian", "Guardian (if not father or mother)")}
          <FormSection title="Primary contact" columns={1}>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["father", "mother", "guardian"] as const).map((w) => (
                <label key={w} className="flex items-center gap-1.5 capitalize">
                  <input type="radio" name="primary_contact" value={w} defaultChecked={primary === w} className="accent-navy-700" /> {w}
                </label>
              ))}
            </div>
          </FormSection>
        </div>

        <div id="address" className="scroll-mt-28 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <FormSection title="Address">
            <Field label="Address" name="s.address" errors={fe["s.address"]} className="sm:col-span-2">
              <Textarea id="s.address" name="s.address" rows={2} defaultValue={s?.address ?? ""} />
            </Field>
            <Field label="Village / town" name="s.village_town">
              <Input id="s.village_town" name="s.village_town" defaultValue={s?.village_town ?? ""} />
            </Field>
            <Field label="District" name="s.district">
              <Input id="s.district" name="s.district" defaultValue={s?.district ?? ""} />
            </Field>
            <Field label="Pincode" name="s.pincode" errors={fe["s.pincode"]}>
              <Input id="s.pincode" name="s.pincode" inputMode="numeric" defaultValue={s?.pincode ?? ""} />
            </Field>
          </FormSection>
        </div>

        <div id="government" className="scroll-mt-28 space-y-5 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <p className="text-xs text-muted">* = needed for the government (UDISE+ / AP) return. ID numbers are encrypted and shown masked.</p>
          {(["identity", "social", "disability", "enrolment"] as const).map((grp) => (
            <FormSection key={grp} title={GROUP_LABEL[grp]}>
              {defsIn([grp]).map((d) => (
                <DefinitionInput key={d.key} def={d} value={details[d.key]} masked={existing?.masked[d.key]} errors={fe[`${d.sensitive ? "x" : "d"}.${d.key}`]} />
              ))}
            </FormSection>
          ))}
        </div>

        <div id="previous" className="scroll-mt-28 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <FormSection title="Previous school">
            {defsIn(["previous_school"]).map((d) => (
              <DefinitionInput key={d.key} def={d} value={details[d.key]} masked={existing?.masked[d.key]} errors={fe[`d.${d.key}`]} />
            ))}
          </FormSection>
        </div>

        <div id="facilities" className="scroll-mt-28 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <FormSection title="Facilities & other">
            {defsIn(["facilities", "other"]).map((d) => (
              <DefinitionInput key={d.key} def={d} value={details[d.key]} masked={existing?.masked[d.key]} errors={fe[`d.${d.key}`]} />
            ))}
          </FormSection>
        </div>

        <div id="documents" className="scroll-mt-28 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
          <FormSection title="Documents" description="PDF or image, under 5 MB each. Uploading again adds a new copy.">
            {docTypes.map((t) => {
              const have = existing?.documents.filter((d) => d.doc_type === t.code).length ?? 0;
              return (
                <Field key={t.code} label={`${t.label}${t.required ? " *" : ""}`} name={`doc.${t.code}`} errors={fe[`doc.${t.code}`]} hint={have ? `${have} already uploaded` : undefined}>
                  <input id={`doc.${t.code}`} name={`doc.${t.code}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy-800" />
                </Field>
              );
            })}
          </FormSection>
        </div>
      </div>

      {/* sticky Save / Cancel */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-border bg-cream-50/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <p className="text-sm text-muted">{errCount ? <span className="text-red-700">{errCount} field(s) need attention</span> : existing ? "Changes are saved together." : "Status starts as Active."}</p>
        <div className="flex gap-2">
          <Link href={existing ? `/students/${existing.student.id}` : "/students"} className={buttonClasses("secondary")}>
            Cancel
          </Link>
          <Button type="submit" loading={pending}>
            {!pending && <Save className="size-4" aria-hidden />} {pending ? "Saving…" : existing ? "Save changes" : "Add student"}
          </Button>
        </div>
      </div>
    </form>
  );
}
