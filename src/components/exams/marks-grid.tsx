"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Save } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { saveMarks } from "@/features/exams/actions";
import { fmtNum, fmtPct } from "@/features/exams/shared";

export type GridStudent = { id: string; roll: number | null; name: string; adm: string };
export type GridResult = { scored: number; max: number; pct: number; grade: string | null; gp: number | null; passPercent: number; passed: boolean; missing: number; absent: boolean; locked: boolean };
type Cell = { status: "marked" | "absent" | "na" | "none"; marks: string };

/** Enter marks for one exam, one subject, one section. The results beside each row are calculated by the database after saving. */
export function MarksGrid({
  sectionId,
  examId,
  subjectId,
  examName,
  subjectName,
  max,
  overridden,
  locked,
  lockNote,
  students,
  marks,
  groups,
  results,
  pendingHere,
}: {
  sectionId: string;
  examId: string;
  subjectId: string;
  examName: string;
  subjectName: string;
  max: number;
  overridden: boolean;
  locked: boolean;
  lockNote: string | null;
  students: GridStudent[];
  marks: Record<string, { status: "marked" | "absent" | "na"; marks: number | null }>;
  groups: { id: string; name: string; kind: string }[];
  results: Record<string, Record<string, GridResult>>;
  pendingHere: number;
}) {
  const router = useRouter();
  const init = useMemo(() => Object.fromEntries(students.map((s) => [s.id, marks[s.id] ? ({ status: marks[s.id].status, marks: marks[s.id].marks == null ? "" : String(marks[s.id].marks) } as Cell) : ({ status: "none", marks: "" } as Cell)])), [students, marks]);
  const [cells, setCells] = useState<Record<string, Cell>>(init);
  const [busy, setBusy] = useState(false);
  // the results shown are those of the result group that CONTAINS this exam (a term first), so a change is visible straight away
  const [shown, setShown] = useState(groups[0]?.id ?? "");
  const shownGroup = groups.find((g) => g.id === shown);

  const dirty = students.filter((s) => cells[s.id].status !== init[s.id].status || cells[s.id].marks !== init[s.id].marks);
  const notEntered = students.filter((s) => cells[s.id].status === "none").length;
  const bad = (c: Cell) => c.status === "marked" && (c.marks === "" || Number.isNaN(Number(c.marks)) || Number(c.marks) < 0 || Number(c.marks) > max || Math.round(Number(c.marks) * 10) / 10 !== Number(c.marks));

  function set(id: string, patch: Partial<Cell>) {
    setCells((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  }
  async function save() {
    const rows = dirty.filter((s) => cells[s.id].status !== "none").map((s) => ({ studentId: s.id, status: cells[s.id].status as "marked" | "absent" | "na", marks: cells[s.id].status === "marked" ? Number(cells[s.id].marks) : null }));
    if (!rows.length) return toast.error("Nothing to save.");
    if (dirty.some((s) => bad(cells[s.id]))) return toast.error(`Marks must be between 0 and ${fmtNum(max)}, with at most one decimal.`);
    setBusy(true);
    const r = await saveMarks({ componentId: examId, sectionId, subjectId, rows });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? "Saved.");
    router.refresh();
  }

  return (
    <Card className="space-y-3 p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold text-navy-900">
          {examName} · {subjectName} <span className="font-normal text-muted">(out of {fmtNum(max)}{overridden ? ", set for this subject" : ""})</span>
        </h2>
        {locked && (
          <Badge tone="warning">
            <Lock className="size-3" /> Locked
          </Badge>
        )}
        <span className="flex-1" />
        {!locked && notEntered > 0 && <Badge tone="warning">{notEntered} not entered</Badge>}
        {!locked && pendingHere === 0 && notEntered === 0 && <Badge tone="success">All entered</Badge>}
      </div>
      {locked && <p className="mx-4 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">This exam is locked, so marks cannot change. Only Admin can unlock it (with a reason).{lockNote ? ` Last unlock note: ${lockNote}` : ""}</p>}
      {groups.length === 0 ? (
        <p className="mx-4 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">This exam is not part of any result yet, so no total is calculated. The Admin adds it to a term on the Scheme tab.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-4 text-sm">
          <span className="text-muted">{examName} counts towards:</span>
          {groups.map((g) => (
            <button key={g.id} type="button" aria-pressed={shown === g.id} onClick={() => setShown(g.id)} className={`rounded-full border px-2.5 py-0.5 ${shown === g.id ? "border-navy-900 bg-navy-900 font-semibold text-gold-400" : "border-border bg-surface hover:bg-navy-50"}`}>
              {g.name}
            </button>
          ))}
          <span className="text-muted">The total on the right is for <b className="text-navy-900">{shownGroup?.name}</b>.</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-navy-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Roll</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Marks</th>
              <th className="px-3 py-2">{shownGroup ? `${shownGroup.name} total (${subjectName})` : "Total"}</th>
              <th className="px-3 py-2">%</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((s) => {
              const c = cells[s.id];
              const r = results[s.id]?.[shown];
              return (
                <tr key={s.id} className={c.status === "none" ? "bg-amber-50/40" : ""}>
                  <td className="px-3 py-1.5 tabular-nums">{s.roll ?? "—"}</td>
                  <td className="px-3 py-1.5 font-medium text-navy-900">
                    {s.name}
                    <span className="block text-xs font-normal text-muted">{s.adm}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Input
                        aria-label={`Marks for ${s.name}`}
                        inputMode="decimal"
                        className="h-9 w-20 tabular-nums"
                        value={c.status === "marked" ? c.marks : ""}
                        placeholder={c.status === "absent" ? "AB" : c.status === "na" ? "N/A" : ""}
                        disabled={locked || c.status === "absent" || c.status === "na"}
                        aria-invalid={bad(c)}
                        onChange={(e) => set(s.id, { status: e.target.value === "" ? "none" : "marked", marks: e.target.value })}
                      />
                      <button type="button" disabled={locked} onClick={() => set(s.id, c.status === "absent" ? { status: "none", marks: "" } : { status: "absent", marks: "" })} className={`h-9 rounded-lg border px-2 text-xs font-semibold ${c.status === "absent" ? "border-red-700 bg-red-700 text-white" : "border-border bg-surface hover:bg-navy-50"} disabled:opacity-50`} title="Absent: counts as 0, shown as AB">
                        AB
                      </button>
                      <button type="button" disabled={locked} onClick={() => set(s.id, c.status === "na" ? { status: "none", marks: "" } : { status: "na", marks: "" })} className={`h-9 rounded-lg border px-2 text-xs font-semibold ${c.status === "na" ? "border-navy-900 bg-navy-900 text-white" : "border-border bg-surface hover:bg-navy-50"} disabled:opacity-50`} title="Not applicable: left out of the total and the maximum">
                        N/A
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{r ? <b>{fmtNum(r.scored)} / {fmtNum(r.max)}</b> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted">{r ? fmtPct(r.pct) : ""}</td>
                  <td className="px-3 py-1.5">{r && r.missing === 0 ? <Badge tone={r.passed ? "success" : "danger"}>{r.grade ?? "—"}</Badge> : ""}</td>
                  <td className="px-3 py-1.5">
                    {r ? (
                      r.missing > 0 ? (
                        <span title={`${r.missing} exam(s) of ${shownGroup?.name ?? "this result"} are not entered yet; they are left out, not counted as 0`}>
                          <Badge tone="warning">Incomplete</Badge>
                        </span>
                      ) : (
                        <span className={r.passed ? "font-medium text-peacock-700" : "font-medium text-red-700"}>{r.passed ? "Pass" : "Fail"}</span>
                      )
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  There are no students in this section.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Button loading={busy} disabled={!dirty.length} onClick={save}>
            <Save className="size-4" /> Save {dirty.length ? `(${dirty.length} changed)` : ""}
          </Button>
          <span className="text-xs text-muted">AB = absent (counts as 0, shown as AB). N/A = not applicable (left out of the total and the maximum). The total on the right updates after saving. An exam that is not entered is left out (never counted as 0) and the result shows Incomplete.</span>
        </div>
      )}
    </Card>
  );
}
