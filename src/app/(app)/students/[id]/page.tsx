import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, ClipboardPen, GraduationCap, Pencil, Wallet } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, StatusChip } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { buttonClasses } from "@/components/ui/button-classes";
import { getStudentConfig, getStudentProfile } from "@/features/students/queries";
import { GROUP_LABEL, maskId, missingGovFields, STATUS_LABEL } from "@/features/students/fields";
import { DocumentsPanel, RevealIdsButton, SavedToast, StatusButton } from "./client";

export const metadata = { title: "Student" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-navy-900">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}

export default async function StudentProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; saved?: string }> }) {
  const { id } = await params;
  const { tab = "overview", saved } = await searchParams;
  const me = await requireStaff();
  // RLS decides visibility (scope rule). Not visible -> not allowed, no data.
  const p = await getStudentProfile(id);
  if (!p) redirect("/not-allowed");

  const manage = can(me, "students.edit");
  const govIds = can(me, "students.govIdView");
  const showGov = manage || govIds;
  const supabase = await createClient();
  const { definitions, docTypes } = showGov ? await getStudentConfig(supabase) : { definitions: [], docTypes: [] };
  const s = p.student;
  const missing = manage ? missingGovFields(definitions, p.details ?? {}, new Set(Object.keys(p.masked))) : [];
  const missingDocs = manage ? docTypes.filter((d) => d.required && !p.documents.some((x) => x.doc_type === d.code)).map((d) => d.label) : [];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "family", label: "Family & siblings", count: p.guardians.length },
    ...(showGov ? [{ id: "government", label: "Government details", count: manage ? missing.length || undefined : undefined }] : []),
    ...(manage ? [{ id: "documents", label: "Documents", count: p.documents.length }] : []),
    { id: "history", label: "Enrolment history", count: p.history.length },
    { id: "attendance", label: "Attendance" },
    { id: "fees", label: "Fees" },
    { id: "marks", label: "Marks" },
  ].map((t) => ({ ...t, href: `/students/${id}?tab=${t.id}` }));
  const backHref = manage ? "/students" : "/my/students";

  return (
    <>
      <SavedToast saved={saved} />
      <PageHeader
        breadcrumbs={[{ label: manage ? "Students" : "My students", href: backHref }, { label: s.full_name }]}
        title={s.full_name}
        description={`${s.admission_no}${p.current ? ` · ${p.current.classLabel}${p.current.roll_no ? ` · Roll ${p.current.roll_no}` : ""}` : " · not enrolled this year"}`}
        icon={
          p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="size-10 rounded-xl object-cover" />
          ) : (
            <GraduationCap />
          )
        }
        actions={
          <>
            <StatusChip status={s.status} label={STATUS_LABEL[s.status]} />
            {can(me, "students.status") && <StatusButton id={s.id} status={s.status} />}
            {manage && (
              <Link href={`/students/${id}/edit`} className={buttonClasses("primary")}>
                <Pencil className="size-4" aria-hidden /> Edit
              </Link>
            )}
          </>
        }
      />
      {manage && (missing.length > 0 || missingDocs.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {missing.length > 0 && <Badge tone="warning">{missing.length} required government field(s) missing</Badge>}
          {missingDocs.length > 0 && <Badge tone="warning">Missing: {missingDocs.join(", ")}</Badge>}
        </div>
      )}
      <LinkTabs tabs={tabs} current={tab} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold text-navy-900">Student</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Item label="Admission no" value={<span className="font-mono">{s.admission_no}</span>} />
              <Item label="Gender" value={<span className="capitalize">{s.gender}</span>} />
              <Item label="Date of birth" value={formatDate(s.date_of_birth)} />
              <Item label="Admission date" value={formatDate(s.admission_date)} />
              <Item label="Class (this year)" value={p.current?.classLabel} />
              <Item label="Roll no" value={p.current?.roll_no} />
              {s.status !== "active" && <Item label="Status date" value={formatDate(s.status_date)} />}
              {s.status !== "active" && <Item label="Reason" value={s.status_reason} />}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold text-navy-900">Address & contact</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Item label="Address" value={s.address} />
              <Item label="Village / town" value={s.village_town} />
              <Item label="District" value={s.district} />
              <Item label="Pincode" value={s.pincode} />
              {p.guardians[0] && (
                <Item
                  label={`Primary contact (${p.guardians[0].relation})`}
                  value={
                    <>
                      {p.guardians[0].guardian.full_name}
                      {p.guardians[0].guardian.phone && (
                        <a href={`tel:${p.guardians[0].guardian.phone}`} className="ml-2 tabular-nums text-navy-700 hover:underline">
                          {p.guardians[0].guardian.phone}
                        </a>
                      )}
                    </>
                  }
                />
              )}
            </dl>
          </Card>
        </div>
      )}

      {tab === "family" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="grid gap-4 sm:grid-cols-2">
            {p.guardians.length === 0 && <EmptyState>No parents or guardians recorded.</EmptyState>}
            {p.guardians.map((g) => (
              <Card key={g.guardian_id}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold capitalize text-navy-900">{g.relation}</h3>
                  {g.is_primary && <Badge tone="gold">Primary contact</Badge>}
                </div>
                <dl className="grid gap-2">
                  <Item label="Name" value={g.guardian.full_name} />
                  <Item label="Mobile" value={g.guardian.phone && <a href={`tel:${g.guardian.phone}`} className="tabular-nums text-navy-700 hover:underline">{g.guardian.phone}</a>} />
                  {g.guardian.alt_phone && <Item label="Alternate mobile" value={g.guardian.alt_phone} />}
                  <Item label="Occupation" value={g.guardian.occupation} />
                  {manage && <Item label="Education" value={g.guardian.education} />}
                  <Item label="Address" value={g.guardian.address} />
                </dl>
              </Card>
            ))}
          </div>
          <Card>
            <h3 className="mb-2 font-semibold text-navy-900">Siblings in school</h3>
            {p.siblings.length ? (
              <ul className="space-y-1.5 text-sm">
                {p.siblings.map((sib) => (
                  <li key={sib.id} className="flex items-center justify-between gap-2">
                    <Link href={`/students/${sib.id}`} className="font-medium text-navy-700 hover:underline">
                      {sib.full_name}
                    </Link>
                    <span className="font-mono text-xs text-muted">{sib.admission_no}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None found (siblings share a parent record).</p>
            )}
          </Card>
        </div>
      )}

      {tab === "government" && showGov && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-navy-900">ID numbers</h2>
              {govIds && Object.keys(p.masked).length > 0 && <RevealIdsButton studentId={s.id} />}
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              {definitions.filter((d) => d.sensitive).map((d) => (
                <Item key={d.key} label={d.label} value={p.masked[d.key] ? <span className="font-mono">{maskId(p.masked[d.key])}</span> : null} />
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Shown masked. {govIds ? "Revealing the full number is recorded in the audit log." : "Only the Admin or the “View government IDs” duty can see full numbers."}</p>
          </Card>
          {manage &&
            (["identity", "social", "disability", "enrolment", "previous_school", "facilities", "other"] as const).map((grp) => {
              const defs = definitions.filter((d) => d.field_group === grp && !d.sensitive);
              if (!defs.length) return null;
              return (
                <Card key={grp}>
                  <h2 className="mb-3 font-semibold text-navy-900">{GROUP_LABEL[grp]}</h2>
                  <dl className="grid gap-3 sm:grid-cols-3">
                    {defs.map((d) => {
                      const v = p.details?.[d.key];
                      const shown = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : (v as string | number | undefined);
                      return <Item key={d.key} label={`${d.label}${d.required_for_gov ? " *" : ""}`} value={shown === undefined ? (d.required_for_gov ? <span className="text-amber-800">Missing</span> : null) : shown} />;
                    })}
                  </dl>
                </Card>
              );
            })}
        </div>
      )}

      {tab === "documents" && manage && (
        <DocumentsPanel studentId={s.id} documents={p.documents} docTypes={docTypes.map((d) => ({ code: d.code, label: d.label, required: d.required }))} canDelete={can(me, "records.delete")} />
      )}

      {tab === "history" && (
        <Card>
          <h2 className="mb-3 font-semibold text-navy-900">Enrolment history</h2>
          {p.history.length ? (
            <ul className="divide-y divide-border text-sm">
              {p.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-navy-900">
                    {h.yearName} {h.isCurrent && <Badge tone="gold">Current</Badge>}
                  </span>
                  <span>{h.classLabel}</span>
                  <span className="text-muted">Roll {h.roll_no ?? "—"}</span>
                  <StatusChip status={h.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not enrolled in any year yet.</p>
          )}
        </Card>
      )}

      {(["attendance", "fees", "marks"] as const).includes(tab as "attendance") && (
        <EmptyState title="Coming soon">
          {tab === "attendance" && (<><CalendarCheck className="mr-1 inline size-4" />Attendance for this student will appear here with the Attendance module.</>)}
          {tab === "fees" && (<><Wallet className="mr-1 inline size-4" />Fees, receipts and dues will appear here with the Fees module.</>)}
          {tab === "marks" && (<><ClipboardPen className="mr-1 inline size-4" />Marks and report cards will appear here with the Exams & marks module.</>)}
        </EmptyState>
      )}
    </>
  );
}
