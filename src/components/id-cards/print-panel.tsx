"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Printer } from "lucide-react";
import { toast } from "sonner";
import { CardSheet } from "./sheet";
import type { CardSchool } from "./card-face";
import { printCards } from "@/features/id-cards/actions";
import { chunk, PER_SHEET, sheetOrder, type Bundle } from "@/features/id-cards/shared";

const sel = "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm";

/**
 * The print page: exact 86 x 54 mm cards, 10 per A4. The sheets come out front, back, front, back (the backs are mirrored so they line up when printed
 * double-sided, flipped on the long edge). The first print right after issuing is the original (recorded at issue); a repeat is allowed only for the
 * same person within 10 minutes (a printer jam), otherwise the cards must be replaced.
 */
export function IdCardPrintPanel({ ids, bundle, photos, issuedNow, school, footer }: { ids: string[]; bundle: Bundle; photos: Record<string, string>; issuedNow: boolean; school: CardSchool; footer: string }) {
  const router = useRouter();
  const [sides, setSides] = useState<"both" | "front" | "back">("both");
  const [used, setUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cards = bundle.cards;
  const sheets = chunk(cards, PER_SHEET);
  const order = sheetOrder(cards.length, sides);
  const free = issuedNow && !used;
  const missing = bundle.school.missing;
  const pendingPhotos = cards.filter((c) => c.photo_pending).length;

  const print = () => {
    setError(null);
    if (free) { setUsed(true); setTimeout(() => window.print(), 50); return; }
    start(async () => {
      const r = await printCards(ids);
      if (!r.ok) { setError(r.error); toast.error(r.error); return; }
      setTimeout(() => { window.print(); router.refresh(); }, 100);
    });
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 portrait; margin: 0; } @media print { body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } article { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div className="mx-auto mb-4 max-w-[210mm] space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-navy-900">ID cards: {cards.length} card{cards.length === 1 ? "" : "s"}, {sheets.length} sheet{sheets.length === 1 ? "" : "s"}</h1>
            <p className="text-xs text-muted">Print at 100% (no “fit to page”) on A4. For both sides, choose double-sided, flip on the long edge. Cut along the small marks in the margins. Every print is recorded.</p>
          </div>
          <Link href="/students/id-cards" className="text-sm font-medium text-navy-700 underline">Back to ID cards</Link>
        </div>
        {missing.length > 0 && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>School details missing in Settings: {missing.join(", ")}. <Link href="/settings" className="underline">Fix in School settings</Link></span></p>
        )}
        {pendingPhotos > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{pendingPhotos} card(s) have a “photo pending” box.</p>}
        {error && (
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{error} <Link href="/students/id-cards/register" className="underline">Open the register to replace a card</Link></p>
        )}
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-soft)]">
          <label className="text-xs text-muted">Sheets
            <select aria-label="Which sides" className={`${sel} ml-2`} value={sides} onChange={(e) => setSides(e.target.value as typeof sides)}>
              <option value="both">Fronts and backs (front, back, front, back…)</option>
              <option value="front">Fronts only</option>
              <option value="back">Backs only</option>
            </select>
          </label>
          <button type="button" onClick={print} disabled={pending || cards.length === 0} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60">
            <Printer className="size-4" aria-hidden /> {free ? "Print the cards" : "Print the same sheets again"}
          </button>
        </div>
      </div>
      <div className="space-y-4 overflow-x-auto print:space-y-0 print:overflow-visible">
        {order.map(({ sheet, side }) => (
          <div key={`${sheet}-${side}`} className="mx-auto w-fit shadow-md print:shadow-none">
            <CardSheet cards={sheets[sheet] ?? []} side={side} school={school} photos={photos} footer={footer} principal={bundle.school.principal_name} />
          </div>
        ))}
      </div>
    </div>
  );
}
