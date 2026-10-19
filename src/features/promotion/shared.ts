/** Promotion / year rollover: types and pure helpers shared by the page, the components and the tests. No database calls here. */

export type Outcome = "promote" | "detain" | "passed_out" | "left" | "new";
export type StudentRow = {
  student_id: string; name: string; admission_no: string; gender: string;
  from_class_id: string | null; from_class: string | null; from_section_id: string | null; from_section: string | null; from_roll: number | null;
  outcome: Outcome; suggested_detain: boolean; is_new: boolean;
  to_class_id: string | null; to_class: string | null; to_section: string | null; to_roll: number | null;
  dues_paise: number; problem: string | null;
};
export type ClassTotals = {
  class_id: string; class: string; sort_order: number; last_year: number; left_midyear: number; promoted_out: number; detained: number; passed_out: number; left: number;
  promoted_in: number; detained_in: number; new_in: number; next_year: number;
};
export type NewSection = { class_id: string; class: string; name: string; exists: boolean; section_id: string | null; medium: string | null; class_teacher_id: string | null; class_teacher: string | null; count: number; over_limit: boolean };
export type CheckItem = { key: string; label: string; status: "ok" | "fail" | "warn"; detail: string; href: string };
export type RolloverSummary = {
  students_total: number; promoted: number; promoted_by_class: { class: string; count: number }[]; detained: number; passed_out: number; left: number; new_admissions: number;
  left_midyear: number; new_sections_created: number; carried_dues_paise: number; carried_dues_students: number; leavers_dues_paise: number; assignments_to_copy: number;
};
export type Preview = {
  from_year: { id: string; name: string }; to_year: { id: string; name: string }; max_size: number; roll_order: "alpha" | "keep";
  summary: RolloverSummary; classes: ClassTotals[]; sections: NewSection[]; students: StudentRow[]; checklist: CheckItem[]; can_confirm: boolean;
};
export type UndoInfo = { allowed: boolean; reasons: { key: string; text: string; count: number }[]; instead?: string | null };
export type RunInfo = {
  id: string; from: string; to: string; from_year_id: string; to_year_id: string; status: "applied" | "undone"; applied_at: string; applied_by: string | null; undone_at: string | null;
  summary: Record<string, number | string | unknown[]>; undo: UndoInfo | null;
};

export const OUTCOME_LABEL: Record<Outcome, string> = { promote: "Move up", detain: "Detained (repeats)", passed_out: "Passed out", left: "Left school", new: "New admission" };
export const CHOICES: Outcome[] = ["promote", "detain", "passed_out", "left"];

/** What the Admin changed in the preview. Sent to the database as the "plan". */
export type Edits = {
  max_size: number;
  roll_order: "alpha" | "keep";
  copy_assignments: boolean;
  students: Record<string, { outcome?: Exclude<Outcome, "new">; to_section?: string; roll_no?: number }>;
  sections: Record<string, { medium?: string; class_teacher_id?: string | null }>;
};
export const DEFAULT_MAX_SIZE = 40;
export const emptyEdits = (): Edits => ({ max_size: DEFAULT_MAX_SIZE, roll_order: "alpha", copy_assignments: true, students: {}, sections: {} });

/** The plan the database function takes. Only real changes are sent. */
export function buildPlan(e: Edits): Record<string, unknown> {
  const students: Record<string, Record<string, unknown>> = {};
  for (const [id, v] of Object.entries(e.students)) {
    const o: Record<string, unknown> = {};
    if (v.outcome) o.outcome = v.outcome;
    if (v.to_section) o.to_section = v.to_section;
    if (v.roll_no && v.roll_no > 0) o.roll_no = v.roll_no;
    if (Object.keys(o).length) students[id] = o;
  }
  const sections: Record<string, Record<string, unknown>> = {};
  for (const [key, v] of Object.entries(e.sections)) {
    const o: Record<string, unknown> = {};
    if (v.medium) o.medium = v.medium;
    if ("class_teacher_id" in v) o.class_teacher_id = v.class_teacher_id ?? null;
    if (Object.keys(o).length) sections[key] = o;
  }
  return { max_size: e.max_size, roll_order: e.roll_order, copy_assignments: e.copy_assignments, students, sections };
}

export function setStudent(e: Edits, id: string, patch: Edits["students"][string]): Edits {
  return { ...e, students: { ...e.students, [id]: { ...e.students[id], ...patch } } };
}
/** One choice for a whole section (or any group of students). */
export function setMany(e: Edits, ids: string[], outcome: Exclude<Outcome, "new">): Edits {
  const students = { ...e.students };
  for (const id of ids) students[id] = { ...students[id], outcome };
  return { ...e, students };
}
export const sectionKey = (classId: string, name: string) => `${classId}:${name}`;
export function setSection(e: Edits, key: string, patch: Edits["sections"][string]): Edits {
  return { ...e, sections: { ...e.sections, [key]: { ...e.sections[key], ...patch } } };
}

/** The checks that must be green before Confirm. "warn" never blocks. */
export function redItems(p: Preview): CheckItem[] {
  return p.checklist.filter((c) => c.status === "fail");
}
/** Confirm needs: nothing red, the totals ticked, and the new year name typed exactly (spaces and capitals do not matter). */
export function canPressConfirm(p: Preview, checked: boolean, typed: string): boolean {
  return p.can_confirm && redItems(p).length === 0 && checked && typed.trim().toLowerCase() === p.to_year.name.trim().toLowerCase();
}

/** "Class 6 should get about 40 − 3 detained/left + new admissions": the sum behind a class's next-year number. */
export function nextYearSum(c: ClassTotals): string {
  return `${c.promoted_in} moving up + ${c.detained_in} repeating + ${c.new_in} new = ${c.next_year}`;
}

/** Groups of students by the section they come from (new admissions last). */
export function groupBySection(rows: StudentRow[]): { key: string; label: string; rows: StudentRow[] }[] {
  const map = new Map<string, { key: string; label: string; rows: StudentRow[] }>();
  for (const r of rows) {
    const key = r.is_new ? "new" : (r.from_section_id ?? "none");
    const label = r.is_new ? "New admissions (already placed in the new year)" : `${r.from_class} – ${r.from_section}`;
    if (!map.has(key)) map.set(key, { key, label, rows: [] });
    map.get(key)!.rows.push(r);
  }
  return [...map.values()];
}
