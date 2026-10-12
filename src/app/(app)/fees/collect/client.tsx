"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FilePlus2, Printer, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Badge, Card, EmptyState, StatusChip } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { StudentPicker, type PickerStudent } from "@/components/fees/student-picker";
import { cn, formatDate } from "@/lib/utils";
import { formatPaise, parseRupees, rupeesInput } from "@/lib/money";
import { collectFeeAction, createMiscReceiptAction, getStudentFeeDues, type CollectResult } from "@/features/fees/actions";
import { MODES, todayIst } from "@/features/fees/shared";
import type { DueRow } from "@/features/fees/queries";

type Student = PickerStudent & { status: string; phones: string[] };

export function CollectClient({ students, initialStudent, isAdmin, miscHeads }: { students: Student[]; initialStudent?: string; isAdmin: boolean; miscHeads: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState<string | null>(initialStudent && students.some((s) => s.id === initialStudent) ? initialStudent : null);
  const [dues, setDues] = useState<DueRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false); // synchronous guard: a double-click can never send two requests
  const [done, setDone] = useState<{ receiptId: string; receiptNo: string; amount: number; repeated?: boolean } | null>(null);
  const [miscOpen, setMiscOpen] = useState(false);
  const student = students.find((s) => s.id === studentId) ?? null;

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const res = await getStudentFeeDues(id);
    setLoading(false);
    if (res.error) toast.error(res.error);
    setDues(res.dues ?? []);
  }, []);
  useEffect(() => {
    if (studentId) void load(studentId);
  }, [studentId, load]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return students.filter((s) => `${s.name} ${s.adm} ${s.phones.join(" ")}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, students]);

  const open = (dues ?? []).filter((d) => d.balance > 0);
  const outstanding = open.reduce((a, d) => a + d.balance, 0);
  const selected = open.filter((d) => chosen.has(d.id));
  const payable = selected.length ? selected.reduce((a, d) => a + d.balance, 0) : outstanding;
  const paise = parseRupees(amount);
  const today = todayIst();

  function pick(id: string) {
    setStudentId(id);
    setQ("");
    setDone(null);
    setChosen(new Set());
    setAmount("");
    setReference("");
    setNotes("");
    setMode("cash");
    setDues(null);
  }
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
  const effectiveAmount = amount === "" ? payable : (paise ?? NaN);

  async function submit() {
    if (lock.current || !student) return;
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) return toast.error("Enter the amount being paid.");
    if (effectiveAmount > payable) return toast.error(`The amount is more than what is due (${formatPaise(payable)}).`);
    if (mode !== "cash" && !reference.trim()) return toast.error("Enter the reference number (UPI id, cheque no. or transaction id).");
    lock.current = true;
    setBusy(true);
    let res: CollectResult;
    try {
      res = await collectFeeAction({ studentId: student.id, amountPaise: effectiveAmount, mode, reference: reference.trim(), notes: notes.trim(), dueIds: [...chosen] });
    } catch {
      res = { ok: false, error: "Could not reach the server. Check the receipts list before trying again." };
    }
    setBusy(false);
    lock.current = false;
    if (!res.ok) return toast.error(res.error);
    toast.success(res.repeated ? `This payment was already saved as ${res.receiptNo}.` : `Receipt ${res.receiptNo} saved.`);
    setDone({ receiptId: res.receiptId, receiptNo: res.receiptNo, amount: effectiveAmount, repeated: res.repeated });
    setChosen(new Set());
    setAmount("");
    setReference("");
    setNotes("");
    void load(student.id);
  }

  return (
    <div className="space-y-4">
      {/* search */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="fee-search" className="mb-1.5 block text-sm font-medium">
              Find student
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                id="fee-search"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, admission number or phone…"
                className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-navy-500 focus:ring-3 focus:ring-gold-300/40"
              />
              {results.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lift)]">
                  {results.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => pick(s.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-cream-50">
                        <span className="flex-1">
                          <span className="font-medium text-navy-900">{s.name}</span> <span className="font-mono text-xs text-muted">{s.adm}</span>
                        </span>
                        <span className="text-xs text-muted">{s.classLabel}</span>
                        {s.status !== "active" && <StatusChip status={s.status} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button variant="secondary" onClick={() => setMiscOpen(true)}>
              <FilePlus2 className="size-4" /> Miscellaneous receipt
            </Button>
          )}
        </div>
      </Card>

      {!student && <EmptyState title="Search for a student">Type at least two letters of the name, or the admission number or phone, to see their dues.</EmptyState>}

      {student && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-navy-900">{student.name}</h2>
              <p className="text-sm text-muted">
                <span className="font-mono">{student.adm}</span> · {student.classLabel}
                {student.phones[0] && <> · {student.phones[0]}</>}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {student.status !== "active" && <StatusChip status={student.status} />}
              <div className="text-right">
                <p className="text-xs text-muted">Total outstanding</p>
                <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(outstanding)}</p>
              </div>
            </div>
          </Card>

          {done && (
            <Card className="border-peacock-200 bg-peacock-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-medium text-peacock-800">
                  <CheckCircle2 className="size-5" aria-hidden /> {done.repeated ? "Already saved:" : "Saved:"} receipt {done.receiptNo} for {formatPaise(done.amount)}
                </p>
                <div className="flex gap-2">
                  <Link href={`/print/receipt/${done.receiptId}?copy=original`} target="_blank" className={buttonClasses("primary")}>
                    <Printer className="size-4" aria-hidden /> Print receipt
                  </Link>
                  <Link href={`/fees/receipts/${done.receiptId}`} className={buttonClasses("secondary")}>
                    View
                  </Link>
                </div>
              </div>
            </Card>
          )}

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
              <p className="border-t border-border bg-cream-50 px-4 py-2 text-xs text-muted">
                No dues ticked = the payment goes to the oldest dues first. Tick specific dues to pay only those.
              </p>
            </Card>

            <Card>
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-navy-900">
                <Wallet className="size-4 text-navy-500" aria-hidden /> Payment
              </h3>
              <div className="space-y-3">
                <Field label={`Amount (₹) — up to ${formatPaise(payable)}`} name="pay-amount">
                  <Input id="pay-amount" inputMode="decimal" value={amount} placeholder={rupeesInput(payable)} onChange={(e) => setAmount(e.target.value)} disabled={outstanding === 0} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(rupeesInput(payable))} disabled={outstanding === 0}>
                    Pay full {selected.length ? "selected" : "balance"}
                  </Button>
                </div>
                <Field label="Payment mode" name="pay-mode">
                  <Select id="pay-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                {mode !== "cash" && (
                  <Field label={mode === "upi" ? "UPI transaction id" : mode === "cheque" ? "Cheque number" : "Transaction reference"} name="pay-ref">
                    <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                )}
                <Field label="Note (optional)" name="pay-notes">
                  <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
                <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={busy || outstanding === 0}>
                  {busy ? "Saving…" : `Collect ${Number.isFinite(effectiveAmount) && effectiveAmount > 0 ? formatPaise(effectiveAmount) : ""}`}
                </Button>
                {outstanding === 0 && dues !== null && <p className="text-center text-xs text-peacock-700">Nothing is due. All fees are paid.</p>}
              </div>
            </Card>
          </div>
        </>
      )}

      {isAdmin && <MiscModal open={miscOpen} onClose={() => setMiscOpen(false)} heads={miscHeads} students={students} initialStudent={student?.id} />}
    </div>
  );
}

function MiscModal({ open, onClose, heads, students, initialStudent }: { open: boolean; onClose: () => void; heads: { id: string; name: string }[]; students: Student[]; initialStudent?: string }) {
  const [headId, setHeadId] = useState("");
  const [newHead, setNewHead] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [pick, setPick] = useState<string[]>(initialStudent ? [initialStudent] : []);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [done, setDone] = useState<{ id: string; no: string } | null>(null);

  async function save() {
    if (lock.current) return;
    const p = parseRupees(amount);
    if (!p || p <= 0) return toast.error("Enter the amount.");
    if (!headId && newHead.trim().length < 2) return toast.error("Pick a fee head or type a new one.");
    if (mode !== "cash" && !reference.trim()) return toast.error("Enter the reference number.");
    if (!pick[0] && payer.trim().length < 2) return toast.error("Choose a student or enter the payer's name.");
    lock.current = true;
    setBusy(true);
    const res = await createMiscReceiptAction({ feeHeadId: headId === "__new" ? "" : headId, newHeadName: headId === "__new" || !headId ? newHead : "", amountPaise: p, mode, reference: reference.trim(), studentId: pick[0] ?? "", payerName: payer.trim(), notes: notes.trim() });
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
    setDone(null);
  }

  return (
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
              <Select id="m-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {mode !== "cash" && (
              <Field label="Reference" name="m-ref">
                <Input id="m-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            )}
          </div>
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
  );
}
