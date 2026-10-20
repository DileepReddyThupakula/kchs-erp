import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { SchemeEditor } from "@/components/exams/scheme-editor";
import { GlobalLists } from "@/components/exams/global-lists";
import { schemeFromJson, type SchemePage } from "@/features/exams/queries";

export const metadata = { title: "Exam scheme" };

export default async function SchemePage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  await requirePage("/exams/scheme");
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">Set up the academic year first.</EmptyState>;
  // ONE database call: classes, the scheme of the chosen class with its subjects, grade bands, descriptive grades, remark bank
  const { data, error } = await supabase.rpc("exams_scheme_page", { p_year: year.id, p_class: sp.class || undefined });
  if (error) throw error;
  const page = data as unknown as SchemePage;
  const classes = page.classes;
  const cls = classes.find((c) => c.id === page.class_id);
  if (!cls || !page.scheme) return <EmptyState title="No classes">Add classes under School setup first.</EmptyState>;
  const scheme = schemeFromJson(page.scheme);
  const subjects = page.scheme.subjects;
  const bands = page.bands;
  const dgs = page.grades;
  const bank = page.bank;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect className="w-56 max-w-full" param="class" label="Class" value={cls.id} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <span className="text-sm text-muted">Academic year {year.name}. Everything here can be changed; results are recalculated automatically.</span>
      </div>
      <SchemeEditor
        yearId={year.id}
        classId={cls.id}
        className={cls.name}
        mode={scheme.mode}
        components={scheme.components}
        groups={scheme.groups}
        members={scheme.members}
        subjectMax={scheme.subjectMax}
        subjects={subjects.filter((s) => s.type === "scholastic")}
        passMarks={Object.fromEntries(scheme.passMarks)}
        defaultPass={Number(page.default_pass_percent ?? 35)}
        yearStart={year.start_date}
        yearEnd={year.end_date}
      />
      <GlobalLists bands={bands.map((b) => ({ ...b, min_pct: Number(b.min_pct), max_pct: Number(b.max_pct), grade_point: Number(b.grade_point) }))} grades={dgs} bank={bank.map((b) => ({ id: b.id, text_en: b.text_en, text_te: b.text_te ?? "", te_verified: b.te_verified }))} />
    </div>
  );
}
