/** A student's marks and results for the profile tab. Pure: built from rows the database already filtered for this person. */
export type MarksLine = { subject: string; scored: number | null; max: number | null; pct: number | null; grade: string | null; passed: boolean | null; missing: number };
export type MarksTotal = { scored: number; max: number; pct: number; grade: string | null; result: "pass" | "fail" | "incomplete" };
export type GradeLine = { subject: string; grade: string | null; label: string | null };
export type MarksGroup = {
  id: string;
  name: string;
  kind: "term" | "final";
  locked: boolean;
  /** "card" = everything on the report card (Admin, the marks duty, the class teacher of a locked result); "own" = only the rows the person's own subjects give. */
  source: "card" | "own";
  lines: MarksLine[];
  total: MarksTotal | null;
  grades: GradeLine[];
};

type Group = { id: string; name: string; kind: string; locked_at: string | null; sort_order?: number };
type SubjectRow = { group_id: string; subject_id: string; scored: number | string; max_marks: number | string; pct: number | string; grade: string | null; passed: boolean; missing: number };
type TotalRow = { group_id: string; scored: number | string; max_marks: number | string; pct: number | string; grade: string | null; result: string };
type Card = {
  mode: "marks" | "grades" | "remarks";
  subjects: { name: string; scored: number | null; max_marks: number | null; pct: number | null; grade: string | null; passed: boolean | null; missing: number | null }[];
  co_scholastic: { name: string; grade: string | null; grade_label: string | null }[];
  total: { scored: number; max: number; pct: number; grade: string | null; result: "pass" | "fail" | "incomplete" } | null;
};

export function buildMarksSummary(opts: {
  groups: Group[];
  subjectNames: Map<string, string>;
  rows: SubjectRow[];
  totals: TotalRow[];
  /** report_card_data() answers, by group id: only present where the database allowed this person to open the card */
  cards: Map<string, Card>;
}): MarksGroup[] {
  const out: MarksGroup[] = [];
  for (const g of opts.groups.filter((x) => x.kind === "term" || x.kind === "final")) {
    const card = opts.cards.get(g.id);
    const base = { id: g.id, name: g.name, kind: g.kind as "term" | "final", locked: !!g.locked_at };
    if (card) {
      out.push({
        ...base,
        source: "card",
        lines: card.subjects.map((s) => ({ subject: s.name, scored: s.scored, max: s.max_marks, pct: s.pct, grade: s.grade, passed: s.passed, missing: s.missing ?? 0 })),
        total: card.total ? { scored: card.total.scored, max: card.total.max, pct: card.total.pct, grade: card.total.grade, result: card.total.result } : null,
        grades: card.mode === "marks" ? [] : card.co_scholastic.map((c) => ({ subject: c.name, grade: c.grade, label: c.grade_label })),
      });
      continue;
    }
    const rows = opts.rows.filter((r) => r.group_id === g.id);
    const t = opts.totals.find((x) => x.group_id === g.id);
    if (!rows.length && !t) continue; // nothing this person may see for this result
    out.push({
      ...base,
      source: "own",
      lines: rows
        .map((r) => ({ subject: opts.subjectNames.get(r.subject_id) ?? "Subject", scored: Number(r.scored), max: Number(r.max_marks), pct: Number(r.pct), grade: r.grade, passed: r.passed, missing: r.missing }))
        .sort((a, b) => a.subject.localeCompare(b.subject)),
      total: t ? { scored: Number(t.scored), max: Number(t.max_marks), pct: Number(t.pct), grade: t.grade, result: t.result as MarksTotal["result"] } : null,
      grades: [],
    });
  }
  return out;
}

export const lineResult = (l: MarksLine): "pass" | "fail" | "incomplete" | null => (l.missing > 0 ? "incomplete" : l.passed === null ? null : l.passed ? "pass" : "fail");
