import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { buildMarksSummary, type MarksGroup } from "./marks-summary";

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * The marks tab of a student profile, from checked sources only:
 *  - subject_results / student_results: row-level security gives a teacher only their own subjects (R18), the marks duty and Admin everything;
 *  - report_card_data(): the existing checked function (Admin, the marks duty, the class teacher of that section; locked results only),
 *    used here read-only and WITHOUT writing a print entry.
 * Nothing about fees is read here.
 */
export async function getStudentMarks(supabase: Supa, studentId: string): Promise<{ yearName: string | null; className: string | null; groups: MarksGroup[] }> {
  const year = await resolveYear();
  if (!year) return { yearName: null, className: null, groups: [] };
  const { data: en } = await supabase.from("student_enrollments").select("section_id").eq("student_id", studentId).eq("academic_year_id", year.id).maybeSingle();
  if (!en) return { yearName: year.name, className: null, groups: [] };
  const { data: sec } = await supabase.from("sections").select("class_id, classes(name)").eq("id", en.section_id).maybeSingle();
  if (!sec) return { yearName: year.name, className: null, groups: [] };
  const [{ data: groups }, { data: names }, { data: rows }, { data: totals }] = await Promise.all([
    supabase.from("result_groups").select("id, name, kind, locked_at, sort_order").eq("academic_year_id", year.id).eq("class_id", sec.class_id).order("sort_order"),
    supabase.rpc("subject_names"),
    supabase.from("subject_results").select("group_id, subject_id, scored, max_marks, pct, grade, passed, missing").eq("student_id", studentId).eq("academic_year_id", year.id),
    supabase.from("student_results").select("group_id, scored, max_marks, pct, grade, result").eq("student_id", studentId).eq("academic_year_id", year.id),
  ]);
  const locked = (groups ?? []).filter((g) => (g.kind === "term" || g.kind === "final") && g.locked_at);
  const cards = new Map<string, never>();
  await Promise.all(
    locked.map(async (g) => {
      const { data, error } = await supabase.rpc("report_card_data", { p_student: studentId, p_group: g.id, p_log: false });
      if (!error && data) cards.set(g.id, data as never);
    }),
  );
  return {
    yearName: year.name,
    className: (sec.classes as { name: string } | null)?.name ?? null,
    groups: buildMarksSummary({ groups: groups ?? [], subjectNames: new Map((names ?? []).map((n) => [n.id, n.name])), rows: rows ?? [], totals: totals ?? [], cards }),
  };
}
