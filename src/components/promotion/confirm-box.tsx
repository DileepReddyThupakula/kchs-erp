"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SummaryBlock } from "./parts";
import { canPressConfirm, redItems, type Preview } from "@/features/promotion/shared";

/** The last step: the summary, the tick, and the new year's name typed out. Confirm stays disabled until all three are right. */
export function ConfirmBox({ preview, busy, onConfirm }: { preview: Preview; busy: boolean; onConfirm: (checked: boolean, typed: string) => void }) {
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState("");
  const red = redItems(preview);
  const ready = canPressConfirm(preview, checked, typed);
  return (
    <Card className="mb-4 border-gold-300">
      <h2 className="mb-3 font-semibold text-navy-900">Confirm the start of {preview.to_year.name}</h2>
      <SummaryBlock s={preview.summary} toName={preview.to_year.name} />
      <div className="mt-4 space-y-3 border-t border-border pt-3">
        {red.length > 0 && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{red.length} item{red.length === 1 ? " is" : "s are"} red in the checklist. Fix {red.length === 1 ? "it" : "them"} first; Confirm stays off until then.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-navy-700" />
          <span>I have checked the totals.</span>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Type the new year name <b className="text-navy-900">{preview.to_year.name}</b> to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Type the new year name" className="mt-1 block h-10 w-full max-w-xs rounded-lg border border-border bg-surface px-3 text-sm shadow-sm" />
        </label>
        <Button type="button" disabled={!ready} loading={busy} onClick={() => onConfirm(checked, typed)}>Confirm: start {preview.to_year.name}</Button>
      </div>
    </Card>
  );
}
