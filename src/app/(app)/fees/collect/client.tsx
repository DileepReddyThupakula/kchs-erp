"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, StatusChip } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { UpiConfirm, UpiQrDialog, type QrSettings } from "@/components/fees/upi-qr-dialog";
import { cn, formatDate } from "@/lib/utils";
import { formatPaise, parseRupees, rupeesInput } from "@/lib/money";
import { collectFeeAction, getStudentFeeDues, type CollectResult } from "@/features/fees/actions";
import { MODES, todayIst } from "@/features/fees/shared";
import type { DueRow } from "@/features/fees/queries";

export type PanelStudent = { id: string; name: string; adm: string; classLabel: string; roll: number | null; phone: string | null; status: string };

/** Collection screen for ONE student. `back` is the list address (class / section kept). */
export function CollectPanel({ student, back, qr, requireUpiRef }: { student: PanelStudent; back: string; qr: QrSettings; requireUpiRef: boolean }) {
  const router = useRouter();
  const [dues, setDues] = useState<DueRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [upiOk, setUpiOk] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false); // synchronous guard: a double-click can never send two requests

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const res = await getStudentFeeDues(id);
    setLoading(false);
    if (res.error) toast.error(res.error);
    setDues(res.dues ?? []);
  }, []);
  useEffect(() => {
    void load(student.id);
  }, [student.id, load]);

  const open = (dues ?? []).filter((d) => d.balance > 0);
  const paidTotal = (dues ?? []).reduce((a, d) => a + d.paid, 0);
  const outstanding = open.reduce((a, d) => a + d.balance, 0);
  const selected = open.filter((d) => chosen.has(d.id));
  const payable = selected.length ? selected.reduce((a, d) => a + d.balance, 0) : outstanding;
  const entered = amount === "" ? payable : (parseRupees(amount) ?? NaN);
  const today = todayIst();

  function toggle(id: string) {
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      const sel = open.filter((d) => n.has(d.id));
      setAmount(rupeesInput(sel.length ? sel.reduce((a, d) => a + d.balance, 0) : outstanding));
      return n;
    });
  }

  async function submit() {
    if (lock.current) return;
    if (!Number.isFinite(entered) || entered <= 0) return toast.error("Enter the amount being paid.");
    if (entered > payable) return toast.error(`The amount is more than what is due (${formatPaise(payable)}).`);
    if (mode === "cheque" && !reference.trim()) return toast.error("Enter the cheque number.");
    if (mode === "upi" && requireUpiRef && !reference.trim()) return toast.error("Enter the UPI transaction reference.");
    if (mode === "upi" && !upiOk) return toast.error("Please tick the confirmation that you have seen the payment.");
    lock.current = true;
    setBusy(true);
    let res: CollectResult;
    try {
      res = await collectFeeAction({ studentId: student.id, amountPaise: entered, mode, reference: reference.trim(), notes: notes.trim(), dueIds: [...chosen], upiConfirmed: upiOk });
    } catch {
      res = { ok: false, error: "Could not reach the server. Check the receipts list before trying again." };
    }
    if (!res.ok) {
      setBusy(false);
      lock.current = false;
      return toast.error(res.error);
    }
    toast.success(res.repeated ? `This payment was already saved as ${res.receiptNo}.` : `Receipt ${res.receiptNo} saved.`);
    // back to the class list (class / section still selected); the list shows the receipt with a Print button
    router.push(`${back}${back.includes("?") ? "&" : "?"}saved=${res.receiptId}`);
  }

  const refLabel =
    mode === "cheque" ? "Cheque number" : mode === "upi" ? `UPI transaction ID${requireUpiRef ? "" : " (optional)"}` : mode === "bank_transfer" ? "Transaction reference (optional)" : "";

  return (
    <div className="space-y-4">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Back to the class list
      </Link>

      {/* student summary */}
      <Card className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-xl font-semibold text-navy-900">{student.name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-mono">{student.adm}</span> · {student.classLabel}
            {student.roll != null && <> · Roll {student.roll}</>}
            {student.phone && <> · {student.phone}</>}
          </p>
          {student.status !== "active" && (
            <div className="mt-1">
              <StatusChip status={student.status} />
            </div>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-5 text-right">
          <div>
            <dt className="text-xs text-muted">Total paid</dt>
            <dd className="text-lg font-semibold tabular-nums text-peacock-700">{formatPaise(paidTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Overdue</dt>
            <dd className="text-lg font-semibold tabular-nums text-red-700">{formatPaise(open.filter((d) => d.dueDate < today).reduce((a, d) => a + d.balance, 0))}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Balance due</dt>
            <dd className="text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(outstanding)}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-semibold text-navy-900">Dues</h3>
            {selected.length > 0 && <Badge tone="gold">{selected.length} selected</Badge>}
          </div>
          {loading || dues === null ? (
            <p className="px-4 py-6 text-sm text-muted">Loading dues…</p>
          ) : dues.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No dues for this student. Fees are generated when the student is enrolled and the class fees are set.</p>
          ) : (
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2">Fee</th>
                    <th className="px-3 py-2">Due date</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Concession</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {dues.map((d) => {
                    const payableRow = d.balance > 0;
                    const overdue = payableRow && d.dueDate < today;
                    return (
                      <tr key={d.id} className={cn("border-t border-border", chosen.has(d.id) && "bg-gold-50", !payableRow && "text-muted")}>
                        <td className="px-3 py-1.5">
                          <input type="checkbox" disabled={!payableRow} checked={chosen.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.headName} ${d.label}`} className="size-4 accent-navy-700" />
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className={payableRow ? "font-medium text-navy-900" : ""}>{d.headName}</span>
                          <span className="ml-1.5 text-xs">{d.label}</span>
                          {d.isSpecial && <Badge tone="gold" className="ml-1.5">Special</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          {formatDate(d.dueDate)} {overdue && <Badge tone="danger" className="ml-1">Overdue</Badge>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatPaise(d.amount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.concession ? formatPaise(d.concession) : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.paid ? formatPaise(d.paid) : "—"}</td>
                        <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", payableRow ? "text-navy-900" : "text-peacock-700")}>{payableRow ? formatPaise(d.balance) : "Paid"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-border bg-cream-50 px-4 py-2 text-xs text-muted">No dues ticked = the payment goes to the oldest dues first. Tick specific dues to pay only those.</p>
        </Card>

        <Card>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-navy-900">
            <Wallet className="size-4 text-navy-500" aria-hidden /> Payment
          </h3>
          <div className="space-y-3">
            <Field label={`Amount (₹) — up to ${formatPaise(payable)}`} name="pay-amount">
              <Input id="pay-amount" inputMode="decimal" value={amount} placeholder={rupeesInput(payable)} onChange={(e) => setAmount(e.target.value)} disabled={outstanding === 0} />
            </Field>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(rupeesInput(payable))} disabled={outstanding === 0}>
              Pay full {selected.length ? "selected" : "due"} · {formatPaise(payable)}
            </Button>
            <Field label="Payment mode" name="pay-mode">
              <Select
                id="pay-mode"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setUpiOk(false);
                  setReference("");
                }}
              >
                {MODES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {mode !== "cash" && (
              <Field label={refLabel} name="pay-ref">
                <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            )}
            {mode === "upi" && (
              <>
                <Button type="button" variant="accent" className="w-full" onClick={() => setShowQr(true)} disabled={!Number.isFinite(entered) || entered <= 0}>
                  <QrCode className="size-4" /> Show QR
                </Button>
                <UpiConfirm checked={upiOk} onChange={setUpiOk} />
              </>
            )}
            <Field label="Note (optional)" name="pay-notes">
              <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={busy || outstanding === 0}>
              {busy ? "Saving…" : `Collect ${Number.isFinite(entered) && entered > 0 ? formatPaise(entered) : ""}`}
            </Button>
            {outstanding === 0 && dues !== null && <p className="text-center text-xs text-peacock-700">Nothing is due. All fees are paid.</p>}
          </div>
        </Card>
      </div>

      <UpiQrDialog open={showQr} onClose={() => setShowQr(false)} settings={qr} amountPaise={Number.isFinite(entered) ? entered : 0} studentName={student.name} adm={student.adm} />
    </div>
  );
}
