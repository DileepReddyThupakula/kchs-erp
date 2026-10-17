import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { getSchoolSettings } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { SchemeEditor } from "@/components/exams/scheme-editor";
import { GlobalLists } from "@/components/exams/global-lists";
import { getClassSubjects, getScheme } from "@/features/exams/queries";

export const metadata = { title: "Exam scheme" };

export default async function SchemePage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  await requirePage("/exams/scheme");
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">Set up the academic year first.</EmptyState>;
  const [{ data: classes }, { data: bands }, { data: dgs }, { data: bank }, settings] = await Promise.all([
    supabase.from("classes").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("grade_bands").select("grade, min_pct, max_pct, grade_point, is_fail").order("min_pct", { ascending: false }),
    supabase.from("descriptive_grades").select("code, label").order("sort_order"),
    supabase.from("remark_bank").select("id, text_en, text_te, te_verified").eq("is_active", true).order("sort_order"),
    getSchoolSettings(),
  ]);
  const cls = (classes ?? []).find((c) => c.id === sp.class) ?? (classes ?? [])[0];
  if (!cls) return <EmptyState title="No classes">Add classes under School setup first.</EmptyState>;
  const [scheme, subjects] = await Promise.all([getScheme(supabase, year.id, cls.id), getClassSubjects(supabase, year.id, cls.id)]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect className="w-56 max-w-full" param="class" label="Class" value={cls.id} options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
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
        defaultPass={Number(settings?.default_pass_percent ?? 35)}
        yearStart={year.start_date}
        yearEnd={year.end_date}
      />
      <GlobalLists bands={(bands ?? []).map((b) => ({ ...b, min_pct: Number(b.min_pct), max_pct: Number(b.max_pct), grade_point: Number(b.grade_point) }))} grades={dgs ?? []} bank={(bank ?? []).map((b) => ({ id: b.id, text_en: b.text_en, text_te: b.text_te ?? "", te_verified: b.te_verified }))} />
    </div>
  );
}
