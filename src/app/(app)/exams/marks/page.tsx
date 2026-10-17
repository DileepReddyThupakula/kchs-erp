import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { MarksGrid, type GridStudent, type GridResult } from "@/components/exams/marks-grid";
import { getClassSubjects, getExamSections, getMyPairs, getScheme, pickSection } from "@/features/exams/queries";
import { groupsContaining } from "@/features/exams/shared";

export const metadata = { title: "Marks entry" };

export default async function MarksPage({ searchParams }: { searchParams: Promise<{ section?: string; subject?: string; exam?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/exams/marks");
  const supabase = await createClient();
  const all = can(me, "marks.enterAll");
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  const [sections, pairs] = await Promise.all([getExamSections(supabase, me, year.id), getMyPairs(supabase, me)]);
  const allowed = all ? sections : sections.filter((s) => pairs.some((p) => p.section_id === s.id));
  if (!allowed.length) return <EmptyState title="No sections to enter marks for">{all ? "There are no sections this year." : "You are not assigned to teach any subject in a section yet. The Admin sets this under Teacher assignments."}</EmptyState>;
  const section = await pickSection(supabase, allowed, year.id, sp.section);
  const [scheme, subjects] = await Promise.all([getScheme(supabase, year.id, section.classId), getClassSubjects(supabase, year.id, section.classId)]);
  if (scheme.mode !== "marks") return <EmptyState title={`${section.className} uses grades, not marks`}>Use the “Grades & remarks” tab for this class.</EmptyState>;
  if (!scheme.components.length) return <EmptyState title="No exams set up for this class">{me.role === "admin" ? "Open the Scheme tab and apply the starting scheme." : "The Admin must set up the exams for this class first (Scheme tab)."}</EmptyState>;
  const mySubjects = subjects.filter((s) => s.type === "scholastic" && (all || pairs.some((p) => p.section_id === section.id && p.subject_id === s.id)));
  if (!mySubjects.length) return <EmptyState title="Nothing to enter here">You do not teach a marks subject in {section.label}.</EmptyState>;
  const subject = mySubjects.find((s) => s.id === sp.subject) ?? mySubjects[0];
  const exam = scheme.components.find((c) => c.id === sp.exam) ?? scheme.components[0];
  const override = scheme.subjectMax.find((o) => o.component_id === exam.id && o.subject_id === subject.id)?.max_marks;
  const max = override ?? exam.max_marks;

  // everything the grid needs, asked for at the same time (one round trip instead of six)
  const [{ data: enr }, { data: mk }, { data: res }, { data: pend }] = await Promise.all([
    supabase.from("student_enrollments").select("student_id, roll_no, students!inner(full_name, admission_no)").eq("section_id", section.id).eq("status", "active"),
    supabase.from("marks").select("student_id, status, marks").eq("component_id", exam.id).eq("subject_id", subject.id).eq("section_id", section.id),
    supabase
      .from("subject_results")
      .select("student_id, group_id, scored, max_marks, pct, grade, grade_point, pass_percent, passed, missing, has_absent, locked")
      .eq("subject_id", subject.id)
      .eq("section_id", section.id),
    all ? supabase.rpc("exam_pending", { p_component: exam.id }) : Promise.resolve({ data: null }),
  ]);
  const students: GridStudent[] = (enr ?? [])
    .map((e) => ({ id: e.student_id, roll: e.roll_no, name: e.students?.full_name ?? "", adm: e.students?.admission_no ?? "" }))
    .sort((a, b) => (a.roll ?? 9999) - (b.roll ?? 9999) || a.name.localeCompare(b.name));
  const results: Record<string, Record<string, GridResult>> = {};
  for (const r of res ?? []) (results[r.student_id] ??= {})[r.group_id] = { scored: Number(r.scored), max: Number(r.max_marks), pct: Number(r.pct), grade: r.grade, gp: r.grade_point == null ? null : Number(r.grade_point), passPercent: Number(r.pass_percent), passed: r.passed, missing: r.missing, absent: r.has_absent, locked: r.locked };
  const pendingHere = (pend ?? []).filter((p) => p.section_id === section.id && p.subject_id === subject.id).reduce((a, p) => a + p.pending, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect className="w-56 max-w-full" param="section" label="Section" value={section.id} options={allowed.map((s) => ({ value: s.id, label: s.label }))} />
        <ParamSelect className="w-56 max-w-full" param="exam" label="Exam" value={exam.id} options={scheme.components.map((c) => ({ value: c.id, label: `${c.name} (out of ${c.max_marks})${c.locked_at ? " · locked" : ""}` }))} />
        <ParamSelect className="w-56 max-w-full" param="subject" label="Subject" value={subject.id} options={mySubjects.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      <MarksGrid
        key={`${section.id}-${exam.id}-${subject.id}`}
        sectionId={section.id}
        examId={exam.id}
        subjectId={subject.id}
        examName={exam.name}
        subjectName={subject.name}
        max={max}
        overridden={override != null}
        locked={!!exam.locked_at}
        lockNote={exam.lock_note}
        students={students}
        marks={Object.fromEntries((mk ?? []).map((m) => [m.student_id, { status: m.status, marks: m.marks == null ? null : Number(m.marks) }]))}
        groups={groupsContaining(exam.id, scheme.members, scheme.groups).map((g) => ({ id: g.id, name: g.name, kind: g.kind }))}
        results={results}
        pendingHere={pendingHere}
      />
    </div>
  );
}
