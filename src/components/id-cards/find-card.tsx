"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { lookupCard, type Lookup } from "@/features/id-cards/actions";

/** Type or scan a card number. A cancelled card is shown in red, with the reason and the card that replaced it. Every lookup is recorded. */
export function FindByCardNumber({ canOpenStudent }: { canOpenStudent: boolean }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Lookup | null>(null);
  const [busy, start] = useTransition();
  const go = () => start(async () => {
    const r = await lookupCard(q);
    if (!r.ok) { toast.error(r.error); return; }
    setRes(r.result);
  });
  return (
    <Card className="mb-4">
      <h2 className="mb-2 font-semibold text-navy-900">Find by card number</h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input aria-label="Card number" autoComplete="off" className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm shadow-sm" placeholder="Type or scan, e.g. ID/2026-27/0001" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary" loading={busy} disabled={q.trim().length < 3}><Search className="size-4" aria-hidden /> Find</Button>
      </form>
      {res && !res.found && <p role="status" className="mt-3 rounded-lg border border-border bg-cream-50 px-3 py-2 text-sm">No card has this number.</p>}
      {res?.found && res.status === "cancelled" && (
        <div role="alert" data-testid="lookup-cancelled" className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="text-base font-bold uppercase tracking-wide">Cancelled: do not accept this card</p>
          <p>{res.number} · {res.name} ({res.admission_no})</p>
          <p>Reason: {String(res.cancel_kind ?? "").replace(/_/g, " ")}{res.cancel_reason ? `: ${res.cancel_reason}` : ""}.{res.replaced_by ? ` Replaced by ${res.replaced_by}.` : ""}</p>
        </div>
      )}
      {res?.found && res.status === "issued" && (
        <div data-testid="lookup-valid" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-semibold">Valid card {res.number} ({res.year})</p>
          <p>{res.name} · {res.admission_no} · {res.class ?? "no class"}{res.student_status && res.student_status !== "active" ? ` · ${res.student_status}` : ""}</p>
          {canOpenStudent && res.student_id && <Link href={`/students/${res.student_id}`} className="underline">Open the student</Link>}
        </div>
      )}
    </Card>
  );
}
