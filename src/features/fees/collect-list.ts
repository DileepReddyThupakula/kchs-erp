/** Class-wise Collect fee list: row shape and the filtering rules (pure). */
export type CollectRow = {
  studentId: string;
  name: string;
  adm: string;
  classId: string | null;
  sectionId: string | null;
  classLabel: string;
  classOrder: number;
  roll: number | null;
  phone: string | null;
  totalDue: number;
  overdue: number;
  lastPayment: string | null;
};
export type CollectShow = "pending" | "overdue" | "all";

/**
 * Default view = students with pending dues, largest balance first.
 * "overdue" = only those with something past its due date; "all" = everyone.
 */
export function filterCollectRows(rows: CollectRow[], f: { classId?: string; sectionId?: string; show?: CollectShow }): CollectRow[] {
  const show = f.show ?? "pending";
  return rows
    .filter((r) => (!f.classId || r.classId === f.classId) && (!f.sectionId || r.sectionId === f.sectionId))
    .filter((r) => (show === "all" ? true : show === "overdue" ? r.overdue > 0 : r.totalDue > 0))
    .sort((a, b) => b.totalDue - a.totalDue || a.classOrder - b.classOrder || a.name.localeCompare(b.name));
}

export function summarize(rows: CollectRow[]) {
  const pending = rows.filter((r) => r.totalDue > 0);
  return { students: pending.length, outstanding: pending.reduce((a, r) => a + r.totalDue, 0), overdue: rows.reduce((a, r) => a + r.overdue, 0) };
}
