import { fmtNum, stepText, type Calc, type CalcStep } from "@/features/exams/shared";

const METHOD = { sum: "added up", average: "averaged", best_n: "best taken" } as const;

function Steps({ steps, depth = 0 }: { steps: CalcStep[]; depth?: number }) {
  return (
    <ul className={depth ? "ml-4 border-l border-border pl-3" : ""}>
      {steps.map((s, i) => (
        <li key={i} className="py-0.5">
          {s.status === "group" ? (
            <>
              <span className="font-medium">{s.label}</span>: {s.method ? <span className="text-muted">{METHOD[s.method as keyof typeof METHOD] ?? s.method}</span> : null} = {fmtNum(s.raw)} of {fmtNum(s.raw_max)}
              {s.scaled_to != null && <span>, scaled to {fmtNum(s.scaled_to)} = {fmtNum(s.v)} of {fmtNum(s.mx)}</span>}
              {s.steps && <Steps steps={s.steps} depth={depth + 1} />}
            </>
          ) : (
            <span className={s.status === "absent" ? "text-red-700" : s.status === "missing" ? "text-amber-800" : s.status === "na" ? "text-muted" : ""}>
              {stepText(s)}
              {s.taken === false && <span className="text-muted"> (not among the best, not used)</span>}
              {s.taken === true && <span className="text-peacock-700"> (best, used)</span>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The stored calculation of one subject result, step by step, so Admin can check every number. */
export function CalcView({ calc, passPercent, pct, scored, max, grade, gradePoint, passed }: { calc: Calc; passPercent: number; pct: number; scored: number; max: number; grade: string | null; gradePoint: number | null; passed: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <Steps steps={calc.steps ?? []} />
      <p className="mt-1 border-t border-border pt-1">
        {calc.method === "average" ? "Average" : calc.method === "best_n" ? `Best ${calc.best_n ?? ""}` : "Total"}
        {calc.scale_to != null ? `, scaled to ${fmtNum(calc.scale_to)}` : ""}: <b>{fmtNum(scored)}</b> of <b>{fmtNum(max)}</b> = {fmtNum(Math.round(pct * 100) / 100)}%
      </p>
      <p>
        Grade <b>{grade ?? "—"}</b> (grade point {gradePoint ?? "—"}) · pass mark {fmtNum(passPercent)}% → <b className={passed ? "text-peacock-700" : "text-red-700"}>{passed ? "Pass" : "Fail"}</b>
      </p>
    </div>
  );
}
