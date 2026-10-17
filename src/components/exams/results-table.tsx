"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { CalcView } from "@/components/exams/calc-view";
import { getCalc } from "@/features/exams/actions";
import { fmtNum, fmtPct, RESULT_TEXT, type Calc } from "@/features/exams/shared";

export type ResultSubject = { id: string; name: string };
type Cell = { scored: number; max: number; pct: number; grade: string | null; gp: number | null; passPercent: number; passed: boolean; missing: number; absent: boolean };
export type ResultRow = { studentId: string; roll: number | null; name: string; cells: Record<string, Cell>; total: { scored: number; max: number; pct: number; grade: string | null; gp: number | null; result: "pass" | "fail" | "incomplete" } | null };
type Detail = { calc: unknown; scored: number; max: number; pct: number; grade: string | null; grade_point: number | null; pass_percent: number; passed: boolean; missing: number };

/** Results per student: each subject's total, the grand total, percentage, grade and result. Admin can open "How was this calculated?". */
export function ResultsTable({ subjects, rows, showTotals, groupName, groupId, canExplain }: { subjects: ResultSubject[]; rows: ResultRow[]; showTotals: boolean; groupName: string; groupId: string; canExplain: boolean }) {
  const [open, setOpen] = useState<{ row: ResultRow; subject: ResultSubject; detail: Detail | null } | null>(null);
  async function explain(row: ResultRow, subject: ResultSubject) {
    const r = await getCalc(row.studentId, groupId, subject.id);
    if (!r.ok) return void toast.error(r.error);
    setOpen({ row, subject, detail: r.detail });
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-navy-50 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Roll</th>
            <th className="px-3 py-2">Student</th>
            {subjects.map((s) => (
              <th key={s.id} className="px-3 py-2">
                {s.name}
                <span className="block font-normal normal-case">total · grade</span>
              </th>
            ))}
            {showTotals && (
              <>
                <th className="px-3 py-2">Grand total</th>
                <th className="px-3 py-2">%</th>
                <th className="px-3 py-2">Grade</th>
                <th className="px-3 py-2">Result</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.studentId}>
              <td className="px-3 py-1.5 tabular-nums">{r.roll ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-1.5 font-medium text-navy-900">{r.name}</td>
              {subjects.map((s) => {
                const c = r.cells[s.id];
                return (
                  <td key={s.id} className="whitespace-nowrap px-3 py-1.5">
                    {c ? (
                      <span className="inline-flex flex-wrap items-center gap-x-1.5">
                        <span className={`tabular-nums ${c.missing === 0 && !c.passed ? "text-red-700" : ""}`}>
                          <b>{fmtNum(c.scored)}</b>/{fmtNum(c.max)}
                        </span>
                        {c.missing === 0 ? <span className="text-xs text-muted">{c.grade}</span> : <span className="text-xs text-amber-800" title={`${c.missing} exam(s) not entered yet: left out, not counted as 0`}>incomplete</span>}
                        {c.absent && <span className="text-xs font-semibold text-red-700">AB</span>}
                        {canExplain && (
                          <button type="button" onClick={() => explain(r, s)} className="rounded px-1 text-xs text-navy-700 underline hover:bg-navy-50" title="How was this calculated?">
                            How?
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
              {showTotals && (
                <>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{r.total ? <b>{fmtNum(r.total.scored)}/{fmtNum(r.total.max)}</b> : "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.total ? fmtPct(r.total.pct) : "—"}</td>
                  <td className="px-3 py-1.5">{r.total && r.total.result !== "incomplete" ? r.total.grade : "—"}</td>
                  <td className="px-3 py-1.5">{r.total ? <Badge tone={r.total.result === "pass" ? "success" : r.total.result === "fail" ? "danger" : "warning"}>{RESULT_TEXT[r.total.result]}</Badge> : "—"}</td>
                </>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={subjects.length + 6} className="px-3 py-6 text-center text-muted">
                No students in this section.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-xs text-muted">
        Totals are calculated automatically. An exam that is not entered yet is left out (never counted as 0) and the result shows Incomplete until it is. AB = absent in at least one exam.
        {canExplain ? " Click “How?” to see how a number was calculated." : ""}
      </p>
      {open?.detail && (
        <Modal open onClose={() => setOpen(null)} title={`${open.row.name} · ${open.subject.name} · ${groupName}: how was this calculated?`} footer={<Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
          <CalcView calc={open.detail.calc as Calc} passPercent={Number(open.detail.pass_percent)} pct={Number(open.detail.pct)} scored={Number(open.detail.scored)} max={Number(open.detail.max)} grade={open.detail.grade} gradePoint={open.detail.grade_point == null ? null : Number(open.detail.grade_point)} passed={open.detail.passed} />
        </Modal>
      )}
    </div>
  );
}
