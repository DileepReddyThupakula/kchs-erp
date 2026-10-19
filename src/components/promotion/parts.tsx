import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { formatPaise } from "@/lib/money";
import { nextYearSum, type CheckItem, type ClassTotals, type Preview, type RolloverSummary, type UndoInfo } from "@/features/promotion/shared";

/** Plain words: what Confirm does, and what it never does. */
export function WhatConfirmDoes({ from, to }: { from: string; to: string }) {
  return (
    <Card className="mb-4 border-navy-100 bg-navy-50/40">
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-navy-900"><ShieldCheck className="size-4 text-navy-500" aria-hidden /> What “Confirm” does, and what it never does</h2>
      <div className="grid gap-4 text-sm md:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-navy-900">Confirm will:</p>
          <ul className="list-disc space-y-1 pl-5 text-navy-800">
            <li>create the {to} sections (same letters), place every student and give roll numbers;</li>
            <li>carry over the medium, class teachers and subject-teacher assignments (you can change them afterwards);</li>
            <li>carry over fee plans, and make the {to} fees from the new fee structure;</li>
            <li>mark passed-out and left students, then close {from} and make {to} the current year.</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium text-navy-900">Confirm will never:</p>
          <ul className="list-disc space-y-1 pl-5 text-navy-800">
            <li>delete or change anything from {from}: attendance, marks, receipts, report cards, fees;</li>
            <li>wipe or merge unpaid old fees: they stay as a separate “previous year balance”;</li>
            <li>copy fee concessions (approve them again for {to});</li>
            <li>run by itself: nothing happens until you press Confirm.</li>
          </ul>
          <p className="mt-2 text-xs text-muted">You can undo it until anything is recorded in {to}.</p>
        </div>
      </div>
    </Card>
  );
}

/** One row per class: the numbers to check against last year. */
export function TotalsTable({ classes }: { classes: ClassTotals[] }) {
  const rows = classes.filter((c) => c.last_year + c.next_year + c.left_midyear > 0);
  return (
    <div className="mb-4 overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
      <table className="w-full min-w-[640px] text-sm" aria-label="Totals per class">
        <caption className="px-3 pt-3 text-left text-sm font-semibold text-navy-900">Totals per class: check them against last year</caption>
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Class</th><th className="px-3 py-2 text-right">This year</th><th className="px-3 py-2 text-right" title="Already left before the rollover: not in the list">Left earlier</th>
            <th className="px-3 py-2 text-right">Moving up</th><th className="px-3 py-2 text-right">Repeating</th><th className="px-3 py-2 text-right">Passed out / left</th>
            <th className="px-3 py-2 text-right">New</th><th className="px-3 py-2 text-right">Next year</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((c) => (
            <tr key={c.class_id}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium text-navy-900">{c.class}</th>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.last_year}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted">{c.left_midyear}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.promoted_out}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.detained}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.passed_out + c.left}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.new_in}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-navy-900" title={nextYearSum(c)}>{c.next_year}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 pb-3 pt-1 text-xs text-muted">Next year = moving up from the class below + repeating + new admissions. Hover a number to see the sum.</p>
    </div>
  );
}

/** The final summary shown right above the Confirm box. */
export function SummaryBlock({ s, toName }: { s: RolloverSummary; toName: string }) {
  const leavers = s.passed_out + s.left;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" aria-label="Summary before you confirm">
      <div><dt className="text-muted">Moving up</dt><dd className="font-semibold text-navy-900">{s.promoted} students{s.promoted_by_class.length > 0 && <span className="font-normal text-muted"> ({s.promoted_by_class.map((c) => `${c.count} to ${c.class}`).join(", ")})</span>}</dd></div>
      <div><dt className="text-muted">Detained (repeat the class)</dt><dd className="font-semibold text-navy-900">{s.detained}</dd></div>
      <div><dt className="text-muted">Leaving (passed out or left school)</dt><dd className="font-semibold text-navy-900">{leavers}<span className="font-normal text-muted"> ({s.passed_out} passed out, {s.left} left)</span></dd></div>
      <div><dt className="text-muted">New sections created in {toName}</dt><dd className="font-semibold text-navy-900">{s.new_sections_created}</dd></div>
      <div><dt className="text-muted">Old unpaid fees carried as “previous year balance”</dt><dd className="font-semibold text-navy-900">{formatPaise(s.carried_dues_paise)}<span className="font-normal text-muted"> ({s.carried_dues_students} students)</span></dd></div>
      <div><dt className="text-muted">Teacher assignments copied</dt><dd className="font-semibold text-navy-900">{s.assignments_to_copy}</dd></div>
    </dl>
  );
}

const ICON = { ok: CheckCircle2, fail: XCircle, warn: AlertTriangle } as const;
const TONE = { ok: "text-emerald-600", fail: "text-red-600", warn: "text-amber-600" } as const;

/** Green / red / amber items, each with a link to fix it. */
export function Checklist({ items }: { items: CheckItem[] }) {
  return (
    <Card className="mb-4">
      <h2 className="mb-2 font-semibold text-navy-900">Before you confirm</h2>
      <ul className="divide-y divide-border text-sm" aria-label="Checklist">
        {items.map((c) => {
          const Icon = ICON[c.status];
          return (
            <li key={c.key} data-status={c.status} className="flex items-start gap-3 py-2">
              <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[c.status]}`} aria-label={c.status === "ok" ? "Green" : c.status === "fail" ? "Red" : "Warning"} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-navy-900">{c.label}</span>
                <span className="block text-xs text-muted">{c.detail}</span>
              </span>
              {c.status !== "ok" && <Link href={c.href} className="shrink-0 text-xs font-medium text-navy-700 underline">{c.status === "fail" ? "Fix this" : "Look"}</Link>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Undo: allowed or blocked, always with the reason in plain words. */
export function UndoNotice({ undo }: { undo: UndoInfo }) {
  if (undo.allowed) return <p className="text-sm text-muted">Nothing has been recorded in the new year yet, so this rollover can still be undone.</p>;
  return (
    <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p className="font-semibold">Undo is blocked because:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{undo.reasons.map((r) => <li key={r.key}>{r.text}</li>)}</ul>
      <p className="mt-2 text-red-900">{undo.instead ?? "Fix individual students by hand instead."}</p>
    </div>
  );
}

export function RunBadge({ status }: { status: "applied" | "undone" }) {
  return status === "applied" ? <Badge tone="success">Done</Badge> : <Badge tone="neutral">Undone</Badge>;
}
export type { Preview };
