"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CertificateSheet, type SheetSchool } from "./sheet";
import { overrideState, TcChecklist } from "./tc-checklist";
import { issueCertificate, previewCertificate, searchStudents } from "@/features/certificates/actions";
import { BONAFIDE_PURPOSES, KIND_LABEL, LANG_LABEL, LEAVING_REASONS, printWarnings, type Bundle, type Kind, type Lang } from "@/features/certificates/shared";

type Student = { id: string; name: string; admission_no: string; status: string; class: string | null };
const field = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm shadow-sm";

/** Issue a certificate: find the student, fill the few fields, look at the preview and the checks, then issue. The database checks everything again. */
export function IssueForm({ kind, today, school, footer, isAdmin }: { kind: Kind; today: string; school: SheetSchool; footer: string; isAdmin: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Student[] | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [leaving, setLeaving] = useState(today);
  const [reason, setReason] = useState("transfer");
  const [note, setNote] = useState("");
  const [conduct, setConduct] = useState("Good");
  const [remarks, setRemarks] = useState("");
  const [purposeSel, setPurposeSel] = useState(BONAFIDE_PURPOSES[0]);
  const [purposeOther, setPurposeOther] = useState("");
  const [place, setPlace] = useState("");
  const [acceptGaps, setAcceptGaps] = useState(false);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anyway, setAnyway] = useState(false);
  const [anywayReason, setAnywayReason] = useState("");
  const [busy, start] = useTransition();

  const data = () => ({
    ...(kind === "bonafide" ? { purpose: purposeSel === "Other" ? purposeOther : purposeSel } : {}),
    ...(kind === "tc" ? { leaving_date: leaving, leaving_reason: reason, leaving_note: note, conduct, remarks } : {}),
    ...(kind === "study" ? { accept_gaps: acceptGaps } : {}),
    place,
  });
  const search = () => start(async () => {
    const r = await searchStudents(q, kind);
    if (!r.ok) { toast.error(r.error); return; }
    setFound(r.rows);
  });
  const preview = () => student && start(async () => {
    setError(null);
    const r = await previewCertificate(kind, student.id, lang, data());
    if (!r.ok) { setBundle(null); setError(r.error); return; }
    setBundle(r.bundle);
  });
  const { red, canOverride } = overrideState(bundle?.checklist);
  const draftBlock = kind === "tc" && !!bundle?.flags.draft_layout;
  const needAnyway = red.length > 0;
  const issueOk = !!bundle && !draftBlock && (!needAnyway || (canOverride && anyway && anywayReason.trim().length >= 3));
  const issue = () => student && start(async () => {
    const r = await issueCertificate(kind, student.id, lang, data(), anyway && canOverride, anywayReason);
    if (!r.ok) { toast.error(r.error); setError(r.error); return; }
    toast.success(`Issued ${r.number}`);
    router.push(`/print/certificate/${r.id}?issued=1`);
  });

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 font-semibold text-navy-900">1. Student</h2>
        {student ? (
          <p className="flex flex-wrap items-center gap-2 text-sm"><b className="text-navy-900">{student.name}</b> <span className="text-muted">{student.admission_no} · {student.class ?? "no class"} · {student.status}</span>
            <button type="button" className="text-xs font-medium text-navy-700 underline" onClick={() => { setStudent(null); setBundle(null); setFound(null); }}>Change</button></p>
        ) : (
          <div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
              <input aria-label="Search student" className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or admission number" />
              <Button type="submit" variant="secondary" disabled={q.trim().length < 2}><Search className="size-4" aria-hidden /> Find</Button>
            </form>
            {found && (found.length === 0 ? <p className="mt-2 text-sm text-muted">No student found.</p> : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
                {found.map((s) => <li key={s.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-navy-50" onClick={() => setStudent(s)}><span className="font-medium">{s.name}</span><span className="text-xs text-muted">{s.admission_no} · {s.class ?? "no class"} · {s.status}</span></button></li>
                )}
              </ul>
            ))}
          </div>
        )}
      </Card>

      {student && (
        <Card>
          <h2 className="mb-3 font-semibold text-navy-900">2. {KIND_LABEL[kind]}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">Language<select className={field} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>{(Object.keys(LANG_LABEL) as Lang[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</select></label>
            <label className="text-xs text-muted">Place<input className={field} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={60} placeholder="e.g. Yerraguntla" /></label>
            {kind === "bonafide" && (
              <>
                <label className="text-xs text-muted">Purpose<select className={field} value={purposeSel} onChange={(e) => setPurposeSel(e.target.value)}>{BONAFIDE_PURPOSES.map((p) => <option key={p}>{p}</option>)}</select></label>
                {purposeSel === "Other" && <label className="text-xs text-muted">Write the purpose<input className={field} value={purposeOther} onChange={(e) => setPurposeOther(e.target.value)} maxLength={120} /></label>}
              </>
            )}
            {kind === "tc" && (
              <>
                <label className="text-xs text-muted">Date of leaving<input type="date" className={field} value={leaving} max={today} onChange={(e) => setLeaving(e.target.value)} /></label>
                <label className="text-xs text-muted">Reason for leaving<select className={field} value={reason} onChange={(e) => setReason(e.target.value)}>{LEAVING_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
                {reason === "other" && <label className="text-xs text-muted sm:col-span-2">Write the reason<input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></label>}
                <label className="text-xs text-muted">Conduct<input className={field} value={conduct} onChange={(e) => setConduct(e.target.value)} maxLength={60} /></label>
                <label className="text-xs text-muted">Remarks (optional)<input className={field} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={200} /></label>
              </>
            )}
            {kind === "study" && <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2"><input type="checkbox" checked={acceptGaps} onChange={(e) => setAcceptGaps(e.target.checked)} /> If the class history has a gap, list only the years on record</label>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={preview} loading={busy}>Preview and check</Button>
            <span className="text-xs text-muted">Nothing is issued or numbered until you press Issue.</span>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </Card>
      )}

      {bundle && (
        <>
          {kind === "tc" && isAdmin && bundle.checklist && (
            <Card>
              <h2 className="mb-2 font-semibold text-navy-900">3. Checks (only the Admin sees these)</h2>
              <TcChecklist items={bundle.checklist} />
              {needAnyway && (
                <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  {canOverride ? (
                    <>
                      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} /> <span><b>Issue anyway.</b> The dues stay exactly as they are; nothing is cleared. The reason is saved with the TC and in the audit log.</span></label>
                      {anyway && <input aria-label="Reason for issuing anyway" className={field} value={anywayReason} onChange={(e) => setAnywayReason(e.target.value)} placeholder="Why is the TC issued with dues pending?" />}
                    </>
                  ) : <p>Something required is missing (details or class). Fix it first; this cannot be overridden.</p>}
                </div>
              )}
            </Card>
          )}
          {draftBlock && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">The TC layout is still a draft, so a real TC cannot be issued yet. You can preview it. The Admin switches the draft off in Certificates → Settings once the layout matches the real TC.</p>}
          {printWarnings(bundle, lang).length > 0 && (
            <ul aria-label="Warnings" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{printWarnings(bundle, lang).map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="overflow-x-auto rounded-[var(--radius-card)] bg-neutral-200/70 p-4">
            <div className="mx-auto w-fit origin-top-left" style={{ zoom: 0.62 }}><CertificateSheet bundle={bundle} lang={lang} school={school} footer={footer} /></div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={issue} disabled={!issueOk} loading={busy}>Issue {KIND_LABEL[kind]}</Button>
            {busy && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
          </div>
        </>
      )}
    </div>
  );
}
