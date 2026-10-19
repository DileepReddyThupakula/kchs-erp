import Link from "next/link";
import { Printer } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { fmtNum, fmtPct } from "@/features/exams/shared";
import { lineResult, type MarksGroup } from "@/features/students/marks-summary";

const RESULT = { pass: { text: "Pass", tone: "success" }, fail: { text: "Fail", tone: "danger" }, incomplete: { text: "Incomplete", tone: "warning" } } as const;

/** Read-only marks and results of one student. What is listed was already limited by the database to what this person may see. */
export function MarksPanel({ studentId, yearName, className, groups, ownOnly }: { studentId: string; yearName: string | null; className: string | null; groups: MarksGroup[]; ownOnly: boolean }) {
  if (!groups.length) {
    return (
      <EmptyState title="No marks to show">
        {className ? `Nothing for ${className} (${yearName}) that you may see: no result has marks entered yet, or the subjects are not yours.` : "This student is not enrolled this year."}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {className} · {yearName}. {ownOnly ? "You see the subjects you teach." : "Marks are never typed here: they come from the Exams & marks module."}
      </p>
      {groups.map((g) => (
        <Card key={g.id}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-navy-900">
              {g.name} {g.locked ? <Badge tone="neutral">Locked</Badge> : <Badge tone="warning">Not locked yet</Badge>}
            </h2>
            {g.source === "card" && g.locked && (
              <Link href={`/print/report-card?student=${studentId}&group=${g.id}`} target="_blank" className={buttonClasses("secondary", "sm")}>
                <Printer className="size-4" aria-hidden /> Report card
              </Link>
            )}
          </div>
          {g.lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1.5 pr-3">Subject</th>
                    <th className="py-1.5 pr-3 text-right">Marks</th>
                    <th className="py-1.5 pr-3 text-right">%</th>
                    <th className="py-1.5 pr-3">Grade</th>
                    <th className="py-1.5">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {g.lines.map((l) => {
                    const r = lineResult(l);
                    return (
                      <tr key={l.subject}>
                        <td className="py-1.5 pr-3 font-medium text-navy-900">{l.subject}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{l.scored == null ? "—" : `${fmtNum(l.scored)} / ${fmtNum(l.max ?? 0)}`}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{l.pct == null ? "—" : fmtPct(l.pct)}</td>
                        <td className="py-1.5 pr-3">{l.grade ?? "—"}</td>
                        <td className="py-1.5">{r ? <Badge tone={RESULT[r].tone}>{RESULT[r].text}</Badge> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {g.total && (
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-1.5 pr-3">Total</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{`${fmtNum(g.total.scored)} / ${fmtNum(g.total.max)}`}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPct(g.total.pct)}</td>
                      <td className="py-1.5 pr-3">{g.total.grade ?? "—"}</td>
                      <td className="py-1.5">
                        <Badge tone={RESULT[g.total.result].tone}>{RESULT[g.total.result].text}</Badge>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {g.grades.length > 0 && (
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {g.grades.map((c) => (
                <li key={c.subject}>
                  <span className="font-medium text-navy-900">{c.subject}</span>: {c.grade ? `${c.grade}${c.label ? ` (${c.label})` : ""}` : "—"}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
