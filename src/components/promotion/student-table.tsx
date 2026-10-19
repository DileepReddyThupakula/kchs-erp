"use client";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/card";
import { formatPaise } from "@/lib/money";
import { CHOICES, groupBySection, OUTCOME_LABEL, type Outcome, type StudentRow } from "@/features/promotion/shared";

const sel = "h-8 rounded-md border border-border bg-surface px-1.5 text-xs shadow-sm";

/** Every student with the old class/section and the proposed new one. Change one student, or a whole section at once. */
export function StudentTable({
  rows, onOutcome, onSection, onRoll, onMany,
}: {
  rows: StudentRow[];
  onOutcome: (id: string, o: Exclude<Outcome, "new">) => void;
  onSection: (id: string, letter: string) => void;
  onRoll: (id: string, roll: number | null) => void;
  onMany: (ids: string[], o: Exclude<Outcome, "new">) => void;
}) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const classes = useMemo(() => [...new Map(rows.filter((r) => r.from_class_id).map((r) => [r.from_class_id!, r.from_class!])).entries()], [rows]);
  const shown = rows.filter((r) => (!cls || r.from_class_id === cls) && (!q || `${r.name} ${r.admission_no}`.toLowerCase().includes(q.toLowerCase())));
  const groups = groupBySection(shown);
  return (
    <section aria-label="Students">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <h2 className="mr-auto font-semibold text-navy-900">Students ({rows.length})</h2>
        <label className="text-xs text-muted">Class
          <select value={cls} onChange={(e) => setCls(e.target.value)} className={`${sel} ml-1`}>
            <option value="">All classes</option>
            {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or admission no." aria-label="Search students" className={`${sel} w-56`} />
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <details key={g.key} open={groups.length <= 2 || !!q || !!cls} className="rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium text-navy-900">
              <span className="mr-auto">{g.label} <span className="font-normal text-muted">· {g.rows.length} students</span></span>
              {g.key !== "new" && (
                <label className="text-xs font-normal text-muted" onClick={(e) => e.stopPropagation()}>Set the whole section:{" "}
                  <select aria-label={`Set the whole section ${g.label}`} className={sel} value="" onChange={(e) => e.target.value && onMany(g.rows.map((r) => r.student_id), e.target.value as Exclude<Outcome, "new">)}>
                    <option value="">Choose…</option>
                    {CHOICES.map((c) => <option key={c} value={c}>{OUTCOME_LABEL[c]}</option>)}
                  </select>
                </label>
              )}
            </summary>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-3 py-1.5">Student</th><th className="px-3 py-1.5">Now</th><th className="px-3 py-1.5">What happens</th><th className="px-3 py-1.5">Next year</th><th className="px-3 py-1.5">Section</th><th className="px-3 py-1.5">Roll</th><th className="px-3 py-1.5 text-right">Old dues</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {g.rows.map((r) => (
                    <tr key={r.student_id} className={r.problem ? "bg-red-50" : undefined}>
                      <td className="px-3 py-1.5"><span className="font-medium text-navy-900">{r.name}</span> <span className="text-xs text-muted">{r.admission_no}</span>
                        {r.suggested_detain && <Badge tone="warning" className="ml-1.5">Failed a locked result: consider detaining</Badge>}
                        {r.problem && <span role="alert" className="block text-xs text-red-700">{r.problem}</span>}</td>
                      <td className="px-3 py-1.5 text-muted">{r.is_new ? "—" : `${r.from_class} ${r.from_section}${r.from_roll ? ` · ${r.from_roll}` : ""}`}</td>
                      <td className="px-3 py-1.5">
                        {r.is_new ? <Badge tone="info">New admission</Badge> : (
                          <select aria-label={`What happens to ${r.name}`} className={sel} value={r.outcome} onChange={(e) => onOutcome(r.student_id, e.target.value as Exclude<Outcome, "new">)}>
                            {CHOICES.map((c) => <option key={c} value={c}>{OUTCOME_LABEL[c]}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{r.to_class ?? <span className="text-muted">Leaves school</span>}</td>
                      <td className="px-3 py-1.5">{r.to_class ? (
                        <input aria-label={`New section of ${r.name}`} defaultValue={r.to_section ?? ""} key={`${r.student_id}-${r.to_section}`} maxLength={3} className={`${sel} w-12 uppercase`}
                          onBlur={(e) => e.target.value.trim().toUpperCase() !== (r.to_section ?? "") && onSection(r.student_id, e.target.value.trim().toUpperCase())} />
                      ) : "—"}</td>
                      <td className="px-3 py-1.5">{r.to_class ? (
                        <input aria-label={`New roll number of ${r.name}`} type="number" min={1} defaultValue={r.to_roll ?? ""} key={`${r.student_id}-${r.to_roll}`} className={`${sel} w-16`}
                          onBlur={(e) => Number(e.target.value) !== (r.to_roll ?? 0) && onRoll(r.student_id, e.target.value ? Number(e.target.value) : null)} />
                      ) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.dues_paise > 0 ? formatPaise(r.dues_paise) : <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {groups.length === 0 && <p className="rounded-lg border border-border bg-surface px-3 py-4 text-sm text-muted">No students match.</p>}
      </div>
    </section>
  );
}
