"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireStaff } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/utils";

const uuid = z.string().uuid();
export type ExResult<T = unknown> = ({ ok: true; message?: string } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function msg(err: { code?: string; message: string }): string {
  return friendlyDbError(err);
}
const refresh = () => revalidatePath("/exams", "layout");

async function adminRpc<T>(fn: () => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>, ok: string): Promise<ExResult<{ data: T | null }>> {
  await requireCapability("exams.scheme");
  const { data, error } = await fn();
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: ok, data };
}

// ---------------------------------------------------------------- scheme (Admin)
export async function applyDefaultScheme(yearId: string, classId: string) {
  if (!uuid.safeParse(yearId).success || !uuid.safeParse(classId).success) return fail("Choose a class.");
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("apply_default_scheme", { p_year: yearId, p_class: classId }), "Starting scheme created. Check it, then change whatever your school uses.");
}
export async function saveComponent(input: { id?: string; yearId: string; classId: string; name: string; maxMarks: number; sortOrder?: number }) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("save_exam_component", { p: { id: input.id ?? null, academic_year_id: input.yearId, class_id: input.classId, name: input.name, max_marks: input.maxMarks, sort_order: input.sortOrder ?? 0 } }), "Exam saved.");
}
export async function deleteComponent(id: string) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("delete_exam_component", { p_id: id }), "Exam deleted.");
}
export async function setSubjectMax(componentId: string, subjectId: string, max: number | null) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("set_subject_max", { p_component: componentId, p_subject: subjectId, p_max: max }), max == null ? "Back to the exam's maximum." : "Maximum for this subject saved.");
}
export type GroupInput = { id?: string; yearId: string; classId: string; name: string; kind: "part" | "term" | "final"; method: "sum" | "average" | "best_n"; bestN?: number | null; scaleTo?: number | null; startDate?: string | null; endDate?: string | null; sortOrder?: number; members: { componentId?: string; childGroupId?: string; scaleTo?: number | null }[] };
export async function saveGroup(input: GroupInput) {
  const supabase = await createClient();
  return adminRpc(
    () =>
      supabase.rpc("save_result_group", {
        p: {
          id: input.id ?? null,
          academic_year_id: input.yearId,
          class_id: input.classId,
          name: input.name,
          kind: input.kind,
          method: input.method,
          best_n: input.method === "best_n" ? (input.bestN ?? 1) : null,
          scale_to: input.scaleTo ?? null,
          start_date: input.startDate || null,
          end_date: input.endDate || null,
          sort_order: input.sortOrder ?? 0,
          members: input.members.map((m) => ({ component_id: m.componentId ?? null, child_group_id: m.childGroupId ?? null, scale_to: m.scaleTo ?? null })),
        },
      }),
    "Result saved. Everything was recalculated.",
  );
}
export async function deleteGroup(id: string) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("delete_result_group", { p_id: id }), "Result deleted.");
}
export async function setPassMark(yearId: string, classId: string, subjectId: string, percent: number | null) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("set_pass_mark", { p_year: yearId, p_class: classId, p_subject: subjectId, p_percent: percent }), "Pass mark saved. Results were recalculated.");
}
export async function setClassMode(yearId: string, classId: string, mode: "marks" | "grades" | "remarks") {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("set_class_mode", { p_year: yearId, p_class: classId, p_mode: mode }), "Saved.");
}
export async function saveGradeBands(bands: { grade: string; min_pct: number; max_pct: number; grade_point: number; is_fail: boolean }[]) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("save_grade_bands", { p: bands }), "Grading scale saved. Open results were recalculated; locked results keep their grades.");
}
export async function saveDescriptiveGrades(list: { code: string; label: string }[]) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("save_descriptive_grades", { p: list }), "Grades saved.");
}
export async function saveRemarkBank(list: { id?: string; text_en: string; text_te: string; te_verified: boolean }[]) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("save_remark_bank", { p: list }), "Remarks saved.");
}

// ---------------------------------------------------------------- locks (Admin)
export async function lockGroup(groupId: string) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("lock_result_group", { p_group: groupId }), "Locked. Marks and results cannot change until Admin unlocks them.");
}
export async function lockComponent(componentId: string) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("lock_exam_component", { p_component: componentId }), "Locked.");
}
export async function unlockGroup(groupId: string, reason: string) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("unlock_result_group", { p_group: groupId, p_reason: reason }), "Unlocked.");
}
export async function unlockComponent(componentId: string, reason: string) {
  const supabase = await createClient();
  return adminRpc(() => supabase.rpc("unlock_exam_component", { p_component: componentId, p_reason: reason }), "Unlocked.");
}

// ---------------------------------------------------------------- entering marks, grades, remarks
export async function saveMarks(input: { componentId: string; sectionId: string; subjectId: string; rows: { studentId: string; status: "marked" | "absent" | "na"; marks?: number | null }[] }): Promise<ExResult<{ count: number }>> {
  await requireStaff();
  if (![input.componentId, input.sectionId, input.subjectId].every((x) => uuid.safeParse(x).success)) return fail("Choose the exam, section and subject.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_marks", {
    p_component: input.componentId,
    p_section: input.sectionId,
    p_subject: input.subjectId,
    p_rows: input.rows.map((r) => ({ student_id: r.studentId, status: r.status, marks: r.status === "marked" ? r.marks : null })),
  });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, count: data, message: `${data} mark(s) saved. Totals and grades were calculated.` };
}
export async function clearMark(componentId: string, studentId: string, subjectId: string): Promise<ExResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_mark", { p_component: componentId, p_student: studentId, p_subject: subjectId });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Cleared." };
}
export async function saveGrades(input: { groupId: string; sectionId: string; subjectId: string; rows: { studentId: string; grade: string; remark: string }[] }): Promise<ExResult<{ count: number }>> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_grades", {
    p_group: input.groupId,
    p_section: input.sectionId,
    p_subject: input.subjectId,
    p_rows: input.rows.map((r) => ({ student_id: r.studentId, grade: r.grade || null, remark: r.remark || null })),
  });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, count: data, message: `${data} saved.` };
}
export async function saveRemark(input: { groupId: string; studentId: string; bankId: string | null; en: string; te: string }): Promise<ExResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_report_remark", { p_group: input.groupId, p_student: input.studentId, p_bank: input.bankId, p_en: input.en || null, p_te: input.te || null });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Remark saved." };
}

/** Admin only: how one result was calculated (the steps are not readable by teachers or the duty). */
export async function getCalc(studentId: string, groupId: string, subjectId: string): Promise<ExResult<{ detail: { calc: unknown; scored: number; max: number; pct: number; grade: string | null; grade_point: number | null; pass_percent: number; passed: boolean; missing: number } | null }>> {
  await requireCapability("exams.scheme");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("subject_result_calc", { p_student: studentId, p_group: groupId, p_subject: subjectId });
  if (error) return fail(msg(error));
  return { ok: true, detail: (data as never) ?? null };
}
