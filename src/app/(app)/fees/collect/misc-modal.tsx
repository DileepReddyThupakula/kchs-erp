"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { StudentPicker, type PickerStudent } from "@/components/fees/student-picker";
import { UpiConfirm, UpiQrDialog, type QrSettings } from "@/components/fees/upi-qr-dialog";
import { parseRupees } from "@/lib/money";
import { createMiscReceiptAction } from "@/features/fees/actions";
import { MODES } from "@/features/fees/shared";

export function MiscModal({
  open,
  onClose,
  heads,
  students,
  qr,
  requireUpiRef,
}: {
  open: boolean;
  onClose: () => void;
  heads: { id: string; name: string }[];
  students: PickerStudent[];
  qr: QrSettings;
  requireUpiRef: boolean;
}) {
  const [headId, setHeadId] = useState("");
  const [newHead, setNewHead] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [upiOk, setUpiOk] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [done, setDone] = useState<{ id: string; no: string } | null>(null);
  const st = students.find((s) => s.id === pick[0]);

  async function save() {
    if (lock.current) return;
    const p = parseRupees(amount);
    if (!p || p <= 0) return toast.error("Enter the amount.");
    if (!headId && newHead.trim().length < 2) return toast.error("Pick a fee head or type a new one.");
    if (mode === "cheque" && !reference.trim()) return toast.error("Enter the cheque number.");
    if (mode === "upi" && requireUpiRef && !reference.trim()) return toast.error("Enter the UPI transaction reference.");
    if (mode === "upi" && !upiOk) return toast.error("Please tick the confirmation that you have seen the payment.");
    if (!pick[0] && payer.trim().length < 2) return toast.error("Choose a student or enter the payer's name.");
    lock.current = true;
    setBusy(true);
    const res = await createMiscReceiptAction({
      feeHeadId: headId === "__new" ? "" : headId,
      newHeadName: headId === "__new" || !headId ? newHead : "",
      amountPaise: p,
      mode,
      reference: reference.trim(),
      studentId: pick[0] ?? "",
      payerName: payer.trim(),
      notes: notes.trim(),
      upiConfirmed: upiOk,
    });
    setBusy(false);
    lock.current = false;
    if (!res.ok) return toast.error(res.error);
    toast.success(`Receipt ${res.receiptNo} saved.`);
    setDone({ id: res.receiptId, no: res.receiptNo });
  }
  function reset() {
    setHeadId("");
    setNewHead("");
    setAmount("");
    setReference("");
    setPayer("");
    setNotes("");
    setMode("cash");
    setPick([]);
    setUpiOk(false);
    setDone(null);
  }
  const refLabel = mode === "cheque" ? "Cheque number" : mode === "upi" ? `UPI transaction ID${requireUpiRef ? "" : " (optional)"}` : "Transaction reference (optional)";

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (busy) return;
          onClose();
          if (done) reset();
        }}
        title="Miscellaneous receipt"
        footer={
          done ? (
            <>
              <Button variant="secondary" onClick={reset}>
                Another receipt
              </Button>
              <Link href={`/print/receipt/${done.id}?copy=original`} target="_blank" className={buttonClasses("primary")}>
                <Printer className="size-4" /> Print {done.no}
              </Link>
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button loading={busy} onClick={save}>
                Save receipt
              </Button>
            </>
          )
        }
      >
        {done ? (
          <p className="flex items-center gap-2 text-peacock-800">
            <CheckCircle2 className="size-5" /> Receipt {done.no} saved.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-foreground">
            <p className="text-muted">For payments not tied to a due: duplicate ID card, TC fee, stationery…. Uses the same numbered series.</p>
            <Field label="Fee head" name="m-head">
              <Select id="m-head" value={headId} onChange={(e) => setHeadId(e.target.value)}>
                <option value="">— choose —</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
                <option value="__new">+ New fee head…</option>
              </Select>
            </Field>
            {(headId === "__new" || (!headId && newHead)) && (
              <Field label="New fee head name" name="m-newhead">
                <Input id="m-newhead" value={newHead} onChange={(e) => setNewHead(e.target.value)} placeholder="e.g. Duplicate ID card" />
              </Field>
            )}
            <Field label="Amount (₹)" name="m-amount">
              <Input id="m-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payment mode" name="m-mode">
                <Select
                  id="m-mode"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setUpiOk(false);
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
                <Field label={refLabel} name="m-ref">
                  <Input id="m-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              )}
            </div>
            {mode === "upi" && (
              <div className="space-y-2">
                <Button type="button" variant="secondary" onClick={() => setShowQr(true)} disabled={!parseRupees(amount)}>
                  <QrCode className="size-4" /> Show QR
                </Button>
                <UpiConfirm checked={upiOk} onChange={setUpiOk} />
              </div>
            )}
            <div>
              <p className="mb-1.5 text-sm font-medium">Student (optional)</p>
              <StudentPicker students={students} value={pick} onChange={(v) => setPick(v.slice(-1))} />
            </div>
            {!pick[0] && (
              <Field label="Payer's name (if no student)" name="m-payer">
                <Input id="m-payer" value={payer} onChange={(e) => setPayer(e.target.value)} />
              </Field>
            )}
            <Field label="Note (optional)" name="m-notes">
              <Input id="m-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
      <UpiQrDialog open={showQr} onClose={() => setShowQr(false)} settings={qr} amountPaise={parseRupees(amount) ?? 0} studentName={st?.name ?? (payer || null)} adm={st?.adm ?? null} />
    </>
  );
}
