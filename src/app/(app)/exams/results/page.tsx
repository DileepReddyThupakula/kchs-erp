import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { ResultsTable, type ResultRow, type ResultSubject } from "@/components/exams/results-table";
import { getClassSubjects, getExamSections, getScheme, pickSection } from "@/features/exams/queries";

export const metadata = { title: "Exam results" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ section?: string; group?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/exams/results");
  const supabase = await createClient();
  const all = can(me, "marks.enterAll");
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  const sections = await getExamSections(supabase, me, year.id);
  if (!sections.length) return <EmptyState title="No sections">You have no sections to show.</EmptyState>;
  const section = await pickSection(supabase, sections, year.id, sp.section);
  const [scheme, subjects] = await Promise.all([getScheme(supabase, year.id, section.classId), getClassSubjects(supabase, year.id, section.classId)]);
  if (scheme.mode !== "marks") return <EmptyState title={`${section.className} uses grades, not marks`}>There are no marks results for this class. See “Grades & remarks”.</EmptyState>;
  const groups = scheme.groups.filter((g) => g.kind !== "part");
  if (!groups.length) return <EmptyState title="No results set up for this class">The Admin sets up terms and the final result on the Scheme tab.</EmptyState>;
  const group = groups.find((g) => g.id === sp.group) ?? groups[0];

  const [{ data: enr }, { data: sr }, { data: tot }] = await Promise.all([
    supabase.from("student_enrollments").select("student_id, roll_no, students!inner(full_name)").eq("section_id", section.id).eq("status", "active"),
    supabase.from("subject_results").select("student_id, subject_id, scored, max_marks, pct, grade, grade_point, pass_percent, passed, missing, has_absent, locked").eq("group_id", group.id).eq("section_id", section.id),
    all ? supabase.from("student_results").select("student_id, scored, max_marks, pct, grade, grade_point, result").eq("group_id", group.id).eq("section_id", section.id) : Promise.resolve({ data: [] }),
  ]);
  const nm = new Map((enr ?? []).map((e) => [e.student_id, e.students?.full_name ?? ""]));
  const seen = new Set((sr ?? []).map((r) => r.subject_id));
  const cols: ResultSubject[] = subjects.filter((s) => s.type === "scholastic" && (all || seen.size === 0 || seen.has(s.id))).map((s) => ({ id: s.id, name: s.name }));
  const byStudent = new Map<string, ResultRow["cells"]>();
  for (const r of sr ?? []) {
    const m = byStudent.get(r.student_id) ?? {};
    m[r.subject_id] = { scored: Number(r.scored), max: Number(r.max_marks), pct: Number(r.pct), grade: r.grade, gp: r.grade_point == null ? null : Number(r.grade_point), passPercent: Number(r.pass_percent), passed: r.passed, missing: r.missing, absent: r.has_absent };
    byStudent.set(r.student_id, m);
  }
  const totals = new Map((tot ?? []).map((t) => [t.student_id, t]));
  const rows: ResultRow[] = (enr ?? [])
    .map((e) => ({
      studentId: e.student_id,
      roll: e.roll_no,
      name: nm.get(e.student_id) ?? "",
      cells: byStudent.get(e.student_id) ?? {},
      total: totals.has(e.student_id) ? { scored: Number(totals.get(e.student_id)!.scored), max: Number(totals.get(e.student_id)!.max_marks), pct: Number(totals.get(e.student_id)!.pct), grade: totals.get(e.student_id)!.grade, gp: totals.get(e.student_id)!.grade_point == null ? null : Number(totals.get(e.student_id)!.grade_point), result: totals.get(e.student_id)!.result } : null,
    }))
    .sort((a, b) => (a.roll ?? 9999) - (b.roll ?? 9999) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect className="w-56 max-w-full" param="section" label="Section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
        <ParamSelect className="w-56 max-w-full" param="group" label="Result" value={group.id} options={groups.map((g) => ({ value: g.id, label: `${g.name}${g.locked_at ? " · locked" : ""}` }))} />
        {!all && <span className="text-sm text-muted">You see the results of your own subjects only.</span>}
      </div>
      <ResultsTable subjects={cols} rows={rows} showTotals={all} groupName={group.name} groupId={group.id} canExplain={me.role === "admin"} />
    </div>
  );
}
