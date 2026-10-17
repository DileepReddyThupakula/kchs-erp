import { Users } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { holdsDuty } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { YearPicker } from "@/components/ui/year-picker";
import { DateFilter } from "@/components/reports/date-filter";
import { AlsoSee, ReportBody } from "@/components/reports/page-parts";
import { getReport, paramsFromUrl } from "@/features/reports/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Strength and students reports" };

export default async function StrengthReports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = paramsFromUrl(await searchParams);
  const me = await requirePage("/reports/strength");
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(sp.year)]);
  const records = holdsDuty(me, "student_records");
  const tab = sp.tab === "demographics" && records ? "demographics" : sp.tab === "admissions" && records ? "admissions" : "strength";
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Students" }]}
      icon={<Users />}
      title="Students: strength and demographics"
      description={me.role === "admin" || records ? "Counts by class and section; demographics are counts only (no names, no ID numbers)." : "The strength of the sections you teach."}
      filters={<YearPicker years={years} value={year?.id} />}
    />
  );
  if (!year) return <>{header}<EmptyState title="No academic year yet">Set up the academic year first.</EmptyState></>;
  const supabase = await createClient();
  const today = todayIst();
  const res = await getReport(supabase, tab, { yearId: year.id, yearName: year.name, from: sp.from, to: sp.to, today });
  const from = sp.from ?? today.slice(0, 7) + "-01";
  const to = sp.to ?? today;
  const q = (extra: string) => `/reports/strength?year=${year.id}${extra}`;
  const query = new URLSearchParams({ year: year.id, ...(tab === "admissions" ? { from, to } : {}) }).toString();
  return (
    <>
      {header}
      {records && (
        <LinkTabs
          current={tab}
          tabs={[
            { id: "strength", label: "Strength", href: q("") },
            { id: "demographics", label: "Demographics", href: q("&tab=demographics") },
            { id: "admissions", label: "Admissions and leavers", href: q("&tab=admissions") },
          ]}
        />
      )}
      {tab === "admissions" && <div className="mb-3"><DateFilter mode="range" from={from} to={to} /></div>}
      <ReportBody res={res} id={tab} query={query} filters={{ year: year.name, tab, ...(tab === "admissions" ? { from, to } : {}) }} />
      <AlsoSee links={[{ href: "/reports", label: "All reports" }, ...(me.role === "admin" ? [{ href: "/reports/government-export", label: "Government data export" }] : [])]} />
    </>
  );
}
