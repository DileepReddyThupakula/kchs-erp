"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveSettings } from "@/features/id-cards/actions";

/** Admin only. Each switch takes effect on every card at once and is recorded in the audit log. */
export function IdCardSettingsPanel({ prefix, showPhone, showBlood, year }: { prefix: string; showPhone: boolean; showBlood: boolean; year: string }) {
  const router = useRouter();
  const [p, setP] = useState(prefix);
  const [ph, setPh] = useState(showPhone);
  const [bg, setBg] = useState(showBlood);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveSettings(p, ph, bg);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Saved");
    router.refresh();
  });
  return (
    <Card>
      <div className="space-y-4 text-sm">
        <label className="block text-xs text-muted">Card number prefix (for example {p || "ID"}/{year}/0001)
          <input aria-label="Card number prefix" className="mt-1 block h-10 w-40 rounded-lg border border-border bg-surface px-3 text-sm shadow-sm" value={p} maxLength={12} onChange={(e) => setP(e.target.value)} />
        </label>
        <fieldset className="space-y-2">
          <legend className="font-medium text-navy-900">What the back of the card shows</legend>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4 accent-navy-700" checked={ph} onChange={(e) => setPh(e.target.checked)} /> <span>One parent phone number (the primary contact). Switching it off removes it from every card at once.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4 accent-navy-700" checked={bg} onChange={(e) => setBg(e.target.checked)} /> <span>Blood group (only when it is saved on the student). Switching it off removes it from every card at once.</span></label>
        </fieldset>
        <p className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-800">The card never shows a home address, date of birth, government ID, fees, marks or attendance. The QR holds only the card number. Please tell parents what the card carries (a short notice or a line in the admission form).</p>
        <Button type="button" onClick={save} loading={busy}>Save</Button>
      </div>
    </Card>
  );
}
