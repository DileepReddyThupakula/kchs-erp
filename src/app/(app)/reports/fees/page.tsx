import { BadgeIndianRupee } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { YearPicker } from "@/components/ui/year-picker";
import { DateFilter } from "@/components/reports/date-filter";
import { AlsoSee, ReportBody } from "@/components/reports/page-parts";
import { getReport, paramsFromUrl } from "@/features/reports/queries";
import type { ReportId } from "@/features/reports/shared";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Fee summary" };

const TABS: { id: ReportId; label: string }[] = [
  { id: "fee-dues-class", label: "Dues by class" },
  { id: "fee-monthly", label: "Collection by month" },
  { id: "fee-concessions", label: "Concessions" },
];

/** Admin and office staff with fee access only: the page guard, the menu and the database all say so. */
export default async function FeeSummary({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = paramsFromUrl(await searchParams);
  await requirePage("/reports/fees");
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(sp.year)]);
  const tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "fee-dues-class") as ReportId;
  const header = <PageHeader breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Fees" }]} icon={<BadgeIndianRupee />} title="Fee summary" description="Totals by class, by month and by fee head. No names here: for students who owe money open Dues." filters={<YearPicker years={years} value={year?.id} />} />;
  if (!year) return <>{header}<EmptyState title="No academic year yet">Set up the academic year first.</EmptyState></>;
  const supabase = await createClient();
  const today = todayIst();
  const upto = sp.upto ?? today;
  const res = await getReport(supabase, tab, { yearId: year.id, yearName: year.name, upto, today });
  const query = new URLSearchParams({ year: year.id, ...(tab === "fee-dues-class" ? { upto } : {}) }).toString();
  return (
    <>
      {header}
      <LinkTabs current={tab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, href: `/reports/fees?year=${year.id}&tab=${t.id}` }))} />
      {tab === "fee-dues-class" && <div className="mb-3"><DateFilter mode="asof" upto={upto} /></div>}
      <ReportBody res={res} id={tab} query={query} filters={{ year: year.name, tab, ...(tab === "fee-dues-class" ? { upto } : {}) }} />
      <AlsoSee links={[{ href: "/fees/reports", label: "Collection by day, mode and head" }, { href: "/fees/dues", label: "Dues and defaulters" }, { href: "/fees/receipts", label: "Receipts" }, { href: "/fees/concessions", label: "Concessions list" }]} />
    </>
  );
}
