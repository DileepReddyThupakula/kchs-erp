"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Printer } from "lucide-react";
import { toast } from "sonner";
import { CertificateSheet, type SheetSchool } from "./sheet";
import { printCertificate } from "@/features/certificates/actions";
import { DUPLICATE_REASONS, KIND_LABEL, LANG_LABEL, printWarnings, type Bundle, type Lang } from "@/features/certificates/shared";

export type PrintState = { needs_reason: boolean; copies: number; last_language: Lang; has_telugu_name: boolean };
const sel = "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm";

/**
 * The print page. English, Telugu or both is chosen here. The very first print right after issuing is the original (it was recorded at issue).
 * Every other print goes through the database, which decides if it is a duplicate (a reason is then required), logs it, and numbers the copy.
 * Nothing on this screen is shared, copied or sent anywhere.
 */
export function CertificatePrintPanel({ id, initial, state, issuedNow, school, footer }: { id: string; initial: Bundle; state: PrintState; issuedNow: boolean; school: SheetSchool; footer: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [lang, setLang] = useState<Lang>(state.last_language);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [originalUsed, setOriginalUsed] = useState(false);
  const [justPrinted, setJustPrinted] = useState(false);
  const [showNat, setShowNat] = useState(true);
  const [showRel, setShowRel] = useState(true);
  const [showCaste, setShowCaste] = useState(true);
  const [pending, start] = useTransition();
  const cancelled = bundle.certificate?.status === "cancelled";
  const free = issuedNow && !originalUsed && state.copies === 1;          // the original, recorded when it was issued
  const needsReason = state.needs_reason && !free;
  const warnings = printWarnings(bundle, lang);
  const noTelugu = lang !== "en" && !state.has_telugu_name;
  const blocked = cancelled || noTelugu || (needsReason && (!reason || (reason === "other" && note.trim().length < 3)));
  // before printing, show the mark the copy will carry
  const shown: Bundle = justPrinted || !needsReason ? bundle : { ...bundle, duplicate: { is_duplicate: true, copy_no: state.copies + 1, printed_at: new Date().toISOString(), reason: reason || "—", reason_note: note || null } };

  const print = () => {
    if (free) {
      setOriginalUsed(true);
      setTimeout(() => window.print(), 50);
      return;
    }
    start(async () => {
      const res = await printCertificate(id, lang, reason, note);
      if (!res.ok) { toast.error(res.error); return; }
      setBundle(res.bundle);
      setJustPrinted(true);
      setTimeout(() => { window.print(); router.refresh(); }, 150);
    });
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 portrait; margin: 0; } @media print { body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } article { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div className="mx-auto mb-4 max-w-[210mm] space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-navy-900">{KIND_LABEL[bundle.kind]} {bundle.certificate?.number}</h1>
            <p className="text-xs text-muted">Paper: A4. Choose “Save as PDF” in the print window for a PDF file. Every print is recorded.</p>
          </div>
          <Link href="/students/certificates" className="text-sm font-medium text-navy-700 underline">Back to certificates</Link>
        </div>
        {cancelled && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">This certificate was cancelled{bundle.certificate?.cancel_reason ? `: ${bundle.certificate.cancel_reason}` : ""}. It cannot be printed.</p>}
        {warnings.length > 0 && (
          <ul role="status" aria-label="Warnings" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{w}{w.startsWith("School details missing") && <> <Link href="/settings" className="underline">Fix in School settings</Link></>}</span></li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-soft)]">
          <label className="text-xs text-muted">Language
            <select aria-label="Language" className={`${sel} ml-2`} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {(Object.keys(LANG_LABEL) as Lang[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
            </select>
          </label>
          {bundle.kind === "tc" && (
            <fieldset className="flex items-center gap-3 text-xs text-muted"><legend className="sr-only">Optional lines on the TC</legend>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showNat} onChange={(e) => setShowNat(e.target.checked)} /> Nationality</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showRel} onChange={(e) => setShowRel(e.target.checked)} /> Religion</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showCaste} onChange={(e) => setShowCaste(e.target.checked)} /> Caste</label>
            </fieldset>
          )}
          {needsReason && (
            <div className="flex flex-wrap items-end gap-2" data-testid="duplicate-reason">
              <label className="text-xs text-muted">This will be a DUPLICATE. Reason
                <select aria-label="Reason for the duplicate" className={`${sel} ml-2`} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose…</option>
                  {DUPLICATE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              {reason === "other" && <input aria-label="Write the reason" className={`${sel} w-56`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write the reason" />}
            </div>
          )}
          <button type="button" onClick={print} disabled={blocked || pending} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60">
            <Printer className="size-4" aria-hidden /> {free ? "Print the original" : needsReason ? "Print a duplicate" : "Print again"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <div className="mx-auto w-fit [&>article]:shadow-md">
          <CertificateSheet bundle={shown} lang={lang} school={school} footer={footer} options={{ showNationality: showNat, showReligion: showRel, showCaste }} />
        </div>
      </div>
    </div>
  );
}
