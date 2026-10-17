/** Pure helpers for Exams & marks (server + client). */
export type Mode = "marks" | "grades" | "remarks";
export const MODE_LABEL: Record<Mode, string> = { marks: "Marks", grades: "Grades and remarks", remarks: "Remarks only" };
export const METHOD_LABEL = { sum: "Add up", average: "Average", best_n: "Best of N" } as const;
export const KIND_LABEL = { part: "Part", term: "Term", final: "Final" } as const;

/** 17.5, 20, 33.33: no trailing zeros. */
export function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * 100) / 100);
}
export function fmtPct(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  return Number.isFinite(v) ? `${(Math.round(v * 10) / 10).toFixed(1)}%` : "";
}

export type CompLite = { id: string; name: string; max_marks: number };
export type MemberLite = { id: string; group_id: string; component_id: string | null; child_group_id: string | null; scale_to: number | null; sort_order: number };
export type GroupLite = { id: string; name: string; kind: "part" | "term" | "final"; method: "sum" | "average" | "best_n"; best_n: number | null; scale_to: number | null };

/** The maximum of a group (same arithmetic as the database, so the screen can show "= 100"). */
export function groupMax(g: GroupLite, members: MemberLite[], comps: Map<string, CompLite>, groups: Map<string, GroupLite>, seen = new Set<string>()): number {
  if (seen.has(g.id)) return 0;
  seen.add(g.id);
  const maxes = members
    .filter((m) => m.group_id === g.id)
    .map((m) => {
      const base = m.component_id ? (comps.get(m.component_id)?.max_marks ?? 0) : groups.get(m.child_group_id!) ? groupMax(groups.get(m.child_group_id!)!, members, comps, groups, new Set(seen)) : 0;
      return m.scale_to ?? base;
    });
  let v = 0;
  if (maxes.length) {
    if (g.method === "sum") v = maxes.reduce((a, b) => a + b, 0);
    else if (g.method === "average") v = maxes.reduce((a, b) => a + b, 0) / maxes.length;
    else v = [...maxes].sort((a, b) => b - a).slice(0, g.best_n ?? maxes.length).reduce((a, b) => a + b, 0);
  }
  return g.scale_to ?? Math.round(v * 100) / 100;
}

/** "Term 1 = Term 1 FA (/20) + SA1 (/80) = 100": the rule in words, so Admin can check it. */
export function describeGroup(g: GroupLite, members: MemberLite[], comps: Map<string, CompLite>, groups: Map<string, GroupLite>): string {
  const parts = members
    .filter((m) => m.group_id === g.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => {
      const name = m.component_id ? (comps.get(m.component_id)?.name ?? "?") : (groups.get(m.child_group_id!)?.name ?? "?");
      const own = m.component_id ? comps.get(m.component_id)?.max_marks : groupMax(groups.get(m.child_group_id!)!, members, comps, groups);
      const mx = m.scale_to ?? own;
      return `${name}${mx != null ? ` (/${fmtNum(mx)})` : ""}${m.scale_to != null && own != null && m.scale_to !== own ? ` scaled from ${fmtNum(own)}` : ""}`;
    });
  if (!parts.length) return `${g.name}: nothing added yet`;
  const how = g.method === "sum" ? parts.join(" + ") : g.method === "average" ? `average of ${parts.join(", ")}` : `best ${g.best_n ?? 1} of ${parts.join(", ")}`;
  return `${g.name} = ${how}${g.scale_to != null ? `, scaled to ${fmtNum(g.scale_to)}` : ""} → out of ${fmtNum(groupMax(g, members, comps, groups))}`;
}

export const RESULT_TEXT = { pass: "Pass", fail: "Fail", incomplete: "Incomplete" } as const;

/** One step of a stored calculation (see `calc` in subject_results). */
export type CalcStep = { label: string; status: "marked" | "absent" | "missing" | "na" | "group"; raw?: number; raw_max?: number; v?: number | null; mx?: number | null; scaled_to?: number; steps?: CalcStep[]; method?: string; taken?: boolean };
export type Calc = { v: number | null; mx: number | null; method: string; best_n?: number | null; scale_to?: number | null; steps: CalcStep[]; absent?: boolean; missing?: number };

/** Groups (parts, terms, the final) that contain an exam, nearest first: the terms come first so a screen can default to the one that matters. */
export function groupsContaining(componentId: string, members: MemberLite[], groups: (GroupLite & { sort_order?: number })[]): GroupLite[] {
  const found = new Set<string>();
  let frontier = members.filter((m) => m.component_id === componentId).map((m) => m.group_id);
  while (frontier.length) {
    const next: string[] = [];
    for (const g of frontier) {
      if (found.has(g)) continue;
      found.add(g);
      next.push(...members.filter((m) => m.child_group_id === g).map((m) => m.group_id));
    }
    frontier = next;
  }
  const order = { term: 0, final: 1, part: 2 } as const;
  return groups.filter((g) => found.has(g.id)).sort((a, b) => order[a.kind] - order[b.kind] || (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function stepText(s: CalcStep): string {
  if (s.status === "na") return `${s.label}: not applicable (left out)`;
  if (s.status === "missing") return `${s.label}: not entered yet (left out, not counted as 0; the result stays Incomplete)`;
  if (s.status === "absent") return `${s.label}: absent (AB) = 0 of ${fmtNum(s.raw_max)}`;
  const base = `${s.label}: ${fmtNum(s.raw)} of ${fmtNum(s.raw_max)}`;
  return s.scaled_to != null ? `${base}, scaled to ${fmtNum(s.scaled_to)} = ${fmtNum(s.v)} of ${fmtNum(s.mx)}` : base;
}


/** Warn before printing when more than this share of the period's attendance sessions were never marked. */
export const UNMARKED_WARN_SHARE = 0.05;

/** The unmarked-attendance warning (null = nothing to warn about). Pure, so it can be tested. */
export function unmarkedWarning(marked: number, unmarked: number): { unmarked: number; total: number; pct: number } | null {
  const total = marked + unmarked;
  if (total <= 0 || unmarked / total <= UNMARKED_WARN_SHARE) return null;
  return { unmarked, total, pct: Math.round((unmarked / total) * 100) };
}
