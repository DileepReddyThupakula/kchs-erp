import { UserCheck } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { DateFilter } from "@/components/reports/date-filter";
import { AlsoSee, ReportBody } from "@/components/reports/page-parts";
import { getReport, paramsFromUrl } from "@/features/reports/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Staff attendance summary" };

export default async function StaffReport({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = paramsFromUrl(await searchParams);
  await requirePage("/reports/staff");
  const supabase = await createClient();
  const today = todayIst();
  const year = (await resolveYear(sp.year)) ?? (await getAcademicYears())[0];
  const from = sp.from ?? today.slice(0, 7) + "-01";
  const to = sp.to ?? today;
  const res = await getReport(supabase, "staff-attendance", { yearId: year?.id ?? "", yearName: year?.name ?? "", from, to, today });
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Staff" }]} icon={<UserCheck />} title="Staff attendance summary" description="Present, late, absent and on-leave days for every active staff member in a period." filters={<DateFilter mode="range" from={from} to={to} />} />
      <ReportBody res={res} id="staff-attendance" query={new URLSearchParams({ from, to }).toString()} filters={{ from, to }} />
      <AlsoSee links={[{ href: "/staff/attendance", label: "Staff attendance (daily)" }, { href: "/staff/leave", label: "Leave" }]} />
    </>
  );
}
