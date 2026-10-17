import Link from "next/link";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { GradesGrid, RemarksGrid } from "@/components/exams/grades-grid";
import { getClassSubjects, getExamSections, getMyPairs, getScheme, pickSection } from "@/features/exams/queries";

export const metadata = { title: "Grades & remarks" };

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ section?: string; term?: string; subject?: string; view?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/exams/grades");
  const supabase = await createClient();
  const all = can(me, "marks.enterAll");
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  const [sections, pairs] = await Promise.all([getExamSections(supabase, me, year.id), getMyPairs(supabase, me)]);
  if (!sections.length) return <EmptyState title="No sections">You have no sections to show.</EmptyState>;
  const section = await pickSection(supabase, sections, year.id, sp.section);
  const scheme = await getScheme(supabase, year.id, section.classId);
  const terms = scheme.groups.filter((g) => g.kind === "term");
  if (!terms.length) return <EmptyState title="No terms set up for this class">The Admin sets up the terms on the Scheme tab.</EmptyState>;
  const term = terms.find((t) => t.id === sp.term) ?? terms[0];
  const isClassTeacher = section.classTeacherId === me.staffId;
  const canRemarks = all || isClassTeacher;
  const view = sp.view === "remarks" && canRemarks ? "remarks" : "grades";
  const subjects = await getClassSubjects(supabase, year.id, section.classId);
  const gradeSubjects = subjects.filter((s) => (scheme.mode === "marks" ? s.type === "co_scholastic" : true) && (all || pairs.some((p) => p.section_id === section.id && p.subject_id === s.id)));
  const subject = gradeSubjects.find((s) => s.id === sp.subject) ?? gradeSubjects[0];

  const { data: enr } = await supabase.from("student_enrollments").select("student_id, roll_no").eq("section_id", section.id).eq("status", "active");
  const ids = (enr ?? []).map((e) => e.student_id);
  const { data: studs } = ids.length ? await supabase.from("students").select("id, full_name").in("id", ids) : { data: [] };
  const nm = new Map((studs ?? []).map((s) => [s.id, s.full_name]));
  const students = (enr ?? []).map((e) => ({ id: e.student_id, roll: e.roll_no, name: nm.get(e.student_id) ?? "" })).sort((a, b) => (a.roll ?? 9999) - (b.roll ?? 9999) || a.name.localeCompare(b.name));
  const { data: dgs } = await supabase.from("descriptive_grades").select("code, label").order("sort_order");

  const tabLink = (v: string, label: string) => (
    <Link href={`/exams/grades?section=${section.id}&term=${term.id}&view=${v}`} className={`rounded-full border px-3 py-1 text-sm ${view === v ? "border-navy-900 bg-navy-900 text-gold-400" : "border-border bg-surface hover:bg-navy-50"}`}>
      {label}
    </Link>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect className="w-56 max-w-full" param="section" label="Section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
        <ParamSelect className="w-56 max-w-full" param="term" label="Term" value={term.id} options={terms.map((t) => ({ value: t.id, label: `${t.name}${t.locked_at ? " · locked" : ""}` }))} />
        {tabLink("grades", scheme.mode === "marks" ? "Co-scholastic grades" : "Grades")}
        {canRemarks && tabLink("remarks", "Class teacher remarks")}
      </div>
      {view === "grades" ? (
        !subject ? (
          <EmptyState title="No subject to grade">{scheme.mode === "marks" ? "You do not teach a co-scholastic subject in this section." : "You do not teach a subject in this section."}</EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ParamSelect className="w-56 max-w-full" param="subject" label="Subject" value={subject.id} options={gradeSubjects.map((s) => ({ value: s.id, label: s.name }))} />
              <span className="text-sm text-muted">{scheme.mode === "marks" ? "A grade for the term (not added into the marks)." : "Grades and remarks for the term."}</span>
            </div>
            <GradesGridLoader supabase={supabase} sectionId={section.id} termId={term.id} subjectId={subject.id} subjectName={subject.name} termName={term.name} locked={!!term.locked_at} students={students} grades={dgs ?? []} needGrade={scheme.mode === "grades"} />
          </>
        )
      ) : (
        <RemarksLoader supabase={supabase} termId={term.id} termName={term.name} locked={!!term.locked_at} students={students} />
      )}
    </div>
  );
}

async function GradesGridLoader({ supabase, sectionId, termId, subjectId, subjectName, termName, locked, students, grades, needGrade }: { supabase: Awaited<ReturnType<typeof createClient>>; sectionId: string; termId: string; subjectId: string; subjectName: string; termName: string; locked: boolean; students: { id: string; roll: number | null; name: string }[]; grades: { code: string; label: string }[]; needGrade: boolean }) {
  const { data } = await supabase.from("grade_entries").select("student_id, grade, remark").eq("group_id", termId).eq("subject_id", subjectId).eq("section_id", sectionId);
  return <GradesGrid key={`${sectionId}-${termId}-${subjectId}`} sectionId={sectionId} termId={termId} subjectId={subjectId} subjectName={subjectName} termName={termName} locked={locked} students={students} grades={grades} needGrade={needGrade} entries={Object.fromEntries((data ?? []).map((e) => [e.student_id, { grade: e.grade ?? "", remark: e.remark ?? "" }]))} />;
}

async function RemarksLoader({ supabase, termId, termName, locked, students }: { supabase: Awaited<ReturnType<typeof createClient>>; termId: string; termName: string; locked: boolean; students: { id: string; roll: number | null; name: string }[] }) {
  const [{ data: rem }, { data: bank }] = await Promise.all([
    supabase.from("report_remarks").select("student_id, bank_id, remark_en, remark_te").eq("group_id", termId),
    supabase.from("remark_bank").select("id, text_en, text_te, te_verified").eq("is_active", true).order("sort_order"),
  ]);
  return <RemarksGrid key={termId} termId={termId} termName={termName} locked={locked} students={students} bank={(bank ?? []).map((b) => ({ id: b.id, en: b.text_en, te: b.text_te ?? "", verified: b.te_verified }))} remarks={Object.fromEntries((rem ?? []).map((r) => [r.student_id, { bankId: r.bank_id, en: r.remark_en, te: r.remark_te ?? "" }]))} />;
}
