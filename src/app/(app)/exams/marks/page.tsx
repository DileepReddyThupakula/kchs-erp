import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { MarksGrid, type GridStudent, type GridResult } from "@/components/exams/marks-grid";
import { schemeFromJson, type MarksPage } from "@/features/exams/queries";
import { groupsContaining } from "@/features/exams/shared";

export const metadata = { title: "Marks entry" };

export default async function MarksPage({ searchParams }: { searchParams: Promise<{ section?: string; subject?: string; exam?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/exams/marks");
  const supabase = await createClient();
  const all = can(me, "marks.enterAll");
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  // ONE database call for the whole page: the sections and subjects this person may enter, the scheme, the students, the marks,
  // the results and (marks duty) the pending count. Row-level security and the function decide; nothing is widened here.
  const { data, error } = await supabase.rpc("marks_page", { p_year: year.id, p_section: sp.section || undefined, p_component: sp.exam || undefined, p_subject: sp.subject || undefined });
  if (error) throw error;
  const page = data as unknown as MarksPage;
  const allowed = page.sections;
  if (!allowed.length || !page.section || !page.scheme) return <EmptyState title="No sections to enter marks for">{all ? "There are no sections this year." : "You are not assigned to teach any subject in a section yet. The Admin sets this under Teacher assignments."}</EmptyState>;
  const section = page.section;
  const scheme = schemeFromJson(page.scheme);
  if (scheme.mode !== "marks") return <EmptyState title={`${section.className} uses grades, not marks`}>Use the “Grades &amp; remarks” tab for this class.</EmptyState>;
  if (!scheme.components.length) return <EmptyState title="No exams set up for this class">{me.role === "admin" ? "Open the Scheme tab and apply the starting scheme." : "The Admin must set up the exams for this class first (Scheme tab)."}</EmptyState>;
  const mySubjects = page.subjects ?? [];
  if (!mySubjects.length) return <EmptyState title="Nothing to enter here">You do not teach a marks subject in {section.label}.</EmptyState>;
  const subject = mySubjects.find((s) => s.id === page.subject_id) ?? mySubjects[0];
  const exam = scheme.components.find((c) => c.id === page.component_id) ?? scheme.components[0];
  const override = scheme.subjectMax.find((o) => o.component_id === exam.id && o.subject_id === subject.id)?.max_marks;
  const max = override ?? exam.max_marks;

  const students: GridStudent[] = (page.students ?? []).map((e) => ({ id: e.id, roll: e.roll, name: e.name, adm: e.adm }));
  const results: Record<string, Record<string, GridResult>> = {};
  for (const r of page.results ?? []) (results[r.student_id] ??= {})[r.group_id] = { scored: Number(r.scored), max: Number(r.max_marks), pct: Number(r.pct), grade: r.grade, gp: r.grade_point == null ? null : Number(r.grade_point), passPercent: Number(r.pass_percent), passed: r.passed, missing: r.missing, absent: r.has_absent, locked: r.locked };
  const pendingHere = Number(page.pending ?? 0);
  const marks = Object.fromEntries(Object.entries(page.marks ?? {}).map(([k, m]) => [k, { status: m.status, marks: m.marks == null ? null : Number(m.marks) }]));

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
        marks={marks}
        groups={groupsContaining(exam.id, scheme.members, scheme.groups).map((g) => ({ id: g.id, name: g.name, kind: g.kind }))}
        results={results}
        pendingHere={pendingHere}
      />
    </div>
  );
}
