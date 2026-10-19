"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { exportSheets } from "@/lib/export";
import { cancelCertificate, cancelCheck, exportRegister } from "@/features/certificates/actions";
import type { Kind } from "@/features/certificates/shared";

/** Excel / CSV of the register. The database writes the "exported" entry in the same call. */
export function RegisterExport({ kind, year, disabled }: { kind: Kind; year: string; disabled?: boolean }) {
  const [busy, start] = useTransition();
  const go = (format: "csv" | "xlsx") => start(async () => {
    const r = await exportRegister(kind, year, format);
    if (!r.ok) { toast.error(r.error); return; }
    await exportSheets(`certificate-register-${kind}`, format, [{ name: "Register", headers: r.headers, rows: r.rows, widths: [22, 24, 14, 14, 22, 12, 10, 16, 8, 40, 30] }]);
    toast.success(`Exported ${r.rows.length} entries`);
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || disabled} onClick={() => go("xlsx")} className={buttonClasses("secondary")}><FileSpreadsheet className="size-4" aria-hidden /> Excel</button>
      <button type="button" disabled={busy || disabled} onClick={() => go("csv")} className={buttonClasses("secondary")}><FileText className="size-4" aria-hidden /> CSV</button>
    </div>
  );
}

/** Cancel one certificate (Admin only). A TC also puts the student back; after a year change the Admin picks the class and section. */
export function CancelCertificate({ id, number, sections }: { id: string; number: string; sections: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [section, setSection] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [needs, setNeeds] = useState(false);
  const [busy, start] = useTransition();
  const begin = () => start(async () => {
    const c = await cancelCheck(id);
    if (!c.ok) { toast.error(c.error); return; }
    setWarn(c.check.warning); setNeeds(c.check.needs_section); setOpen(true);
  });
  const confirm = () => start(async () => {
    const r = await cancelCertificate(id, reason, section);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`${number} cancelled`);
    setOpen(false);
    router.refresh();
  });
  if (!open) return <button type="button" onClick={begin} className="text-xs font-medium text-red-700 underline">Cancel</button>;
  return (
    <div role="group" aria-label={`Cancel ${number}`} className="space-y-1.5 rounded-lg border border-red-100 bg-red-50 p-2 text-xs">
      <p className="font-medium text-red-900">Cancel {number}? The number stays in the register as Cancelled.</p>
      {warn && <p className="text-amber-900">{warn}</p>}
      {needs && (
        <select aria-label="Class and section to return to" className="h-8 w-full rounded-md border border-border bg-surface px-1.5" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">Choose the class and section…</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
      <input aria-label="Reason for cancelling" className="h-8 w-full rounded-md border border-border bg-surface px-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="danger" loading={busy} disabled={reason.trim().length < 3 || (needs && !section)} onClick={confirm}>Yes, cancel it</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>No</Button>
      </div>
    </div>
  );
}
