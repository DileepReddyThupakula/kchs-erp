"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { exportSheets } from "@/lib/export";
import { cancelCard, exportRegister, replaceCard } from "@/features/id-cards/actions";

export const REPLACE_REASONS = [
  { value: "lost", label: "Lost" }, { value: "damaged", label: "Damaged" }, { value: "parent_request", label: "Parent request" }, { value: "other", label: "Other (write it below)" },
];

/** Excel / CSV of the register. The database writes the "exported" entry in the same call. */
export function RegisterExport({ year, disabled }: { year: string; disabled?: boolean }) {
  const [busy, start] = useTransition();
  const go = (format: "csv" | "xlsx") => start(async () => {
    const r = await exportRegister(year, format);
    if (!r.ok) { toast.error(r.error); return; }
    await exportSheets("id-card-register", format, [{ name: "Register", headers: r.headers, rows: r.rows, widths: [22, 24, 16, 12, 8, 12, 12, 20, 8, 22, 22, 30, 10] }]);
    toast.success(`Exported ${r.rows.length} cards`);
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || disabled} onClick={() => go("xlsx")} className={buttonClasses("secondary")}><FileSpreadsheet className="size-4" aria-hidden /> Excel</button>
      <button type="button" disabled={busy || disabled} onClick={() => go("csv")} className={buttonClasses("secondary")}><FileText className="size-4" aria-hidden /> CSV</button>
    </div>
  );
}

/** Replace (lost / damaged: a new number, the old card is cancelled) and, for the Admin, cancel. Both need a reason. */
export function CardActions({ id, number, isAdmin, noPhoto }: { id: string; number: string; isAdmin: boolean; noPhoto: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"replace" | "cancel" | null>(null);
  const [reason, setReason] = useState("lost");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const done = (msg: string) => { toast.success(msg); setMode(null); setNote(""); router.refresh(); };
  const replace = () => start(async () => {
    const r = await replaceCard(id, reason, reason === "other" ? note : "", noPhoto ? note : "");
    if (!r.ok) { toast.error(r.error); return; }
    done(`${number} replaced by ${r.number}`);
    router.push(`/print/id-cards?cards=${r.cardId}&issued=1`);
  });
  const cancel = () => start(async () => {
    const r = await cancelCard(id, note);
    if (!r.ok) { toast.error(r.error); return; }
    done(`${number} cancelled`);
  });
  if (!mode) {
    return (
      <span className="flex flex-wrap gap-3 text-xs font-medium">
        <button type="button" className="text-navy-700 underline" onClick={() => { setMode("replace"); setReason("lost"); }}>Replace</button>
        {isAdmin && <button type="button" className="text-red-700 underline" onClick={() => setMode("cancel")}>Cancel</button>}
      </span>
    );
  }
  return (
    <div role="group" aria-label={`${mode === "replace" ? "Replace" : "Cancel"} ${number}`} className="space-y-1.5 rounded-lg border border-border bg-cream-50 p-2 text-xs">
      {mode === "replace" ? (
        <>
          <p className="font-medium text-navy-900">Replace {number}? The new card gets a new number and {number} is cancelled.</p>
          <select aria-label="Reason" className="h-8 w-full rounded-md border border-border bg-surface px-1.5" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPLACE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {(reason === "other" || noPhoto) && <input aria-label={noPhoto && reason !== "other" ? "Why the card has no photo" : "Write the reason"} className="h-8 w-full rounded-md border border-border bg-surface px-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder={noPhoto ? "Why the photo is still pending" : "Write the reason"} />}
        </>
      ) : (
        <>
          <p className="font-medium text-red-900">Cancel {number}? Use this only for a card issued by mistake. For a lost card, use Replace.</p>
          <input aria-label="Reason for cancelling" className="h-8 w-full rounded-md border border-border bg-surface px-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (required)" />
        </>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "cancel" ? "danger" : "primary"} loading={busy} disabled={mode === "cancel" ? note.trim().length < 3 : (reason === "other" || noPhoto) && note.trim().length < 3}
          onClick={mode === "cancel" ? cancel : replace}>{mode === "cancel" ? "Yes, cancel it" : "Replace the card"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>No</Button>
      </div>
    </div>
  );
}
