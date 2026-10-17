import { BookOpenCheck } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { ParamSelect } from "@/components/ui/param-select";
import { YearPicker } from "@/components/ui/year-picker";
import { AlsoSee, ReportBody } from "@/components/reports/page-parts";
import { getExamNames, getReport, paramsFromUrl } from "@/features/reports/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Results summary" };

export default async function ExamReports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = paramsFromUrl(await searchParams);
  const me = await requirePage("/reports/exams");
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(sp.year)]);
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Exams" }]}
      icon={<BookOpenCheck />}
      title="Results summary"
      description={me.role === "admin" || me.duties.includes("all_class_marks") ? "How each section and subject did in a term. Totals only: no ranking of students and no comparison of teachers." : "How your own sections and subjects did. Only what you teach is shown."}
      filters={<YearPicker years={years} value={year?.id} />}
    />
  );
  if (!year) return <>{header}<EmptyState title="No academic year yet">Set up the academic year first.</EmptyState></>;
  const supabase = await createClient();
  const names = await getExamNames(supabase, year.id);
  const exam = names.includes(sp.exam ?? "") ? sp.exam! : names[0];
  const tab = sp.tab === "sections" ? "exam-class" : "exam-subject";
  const res = await getReport(supabase, tab, { yearId: year.id, yearName: year.name, exam, today: todayIst() });
  const sectionsOk = !("forbidden" in (await getReport(supabase, "exam-class", { yearId: year.id, yearName: year.name, exam, today: todayIst() })));
  const query = new URLSearchParams({ year: year.id, ...(exam ? { exam } : {}) }).toString();
  return (
    <>
      {header}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {names.length > 0 && <ParamSelect className="w-44" param="exam" label="Result" value={exam ?? ""} options={names.map((n) => ({ value: n, label: n }))} />}
      </div>
      <LinkTabs
        current={tab === "exam-class" ? "sections" : "subjects"}
        tabs={[{ id: "subjects", label: "By subject", href: `/reports/exams?year=${year.id}${exam ? `&exam=${encodeURIComponent(exam)}` : ""}` }, ...(sectionsOk ? [{ id: "sections", label: "By section", href: `/reports/exams?year=${year.id}&tab=sections${exam ? `&exam=${encodeURIComponent(exam)}` : ""}` }] : [])]}
      />
      <ReportBody res={res} id={tab} query={query} filters={{ year: year.name, exam: exam ?? null, tab }} />
      <AlsoSee links={[{ href: "/exams/results", label: "Exam results per student" }, { href: "/exams/report-cards", label: "Report cards" }]} />
    </>
  );
}
