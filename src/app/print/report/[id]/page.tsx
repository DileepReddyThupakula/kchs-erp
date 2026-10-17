import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { canOpenPage, findPage } from "@/lib/site-map";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { getReport, paramsFromUrl } from "@/features/reports/queries";
import { cellText, printFooterText, REPORT_PAGE, totalsRow, type ReportId } from "@/features/reports/shared";
import { ReportPrintSheet } from "@/components/attendance/print-sheet";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Report" };

/** A4 print of a report. Opening this page is the print: it is audit-logged (who, report, filters, rows). The database decides what is in it. */
export default async function PrintReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = paramsFromUrl(await searchParams);
  const me = await requireStaff();
  if (!(id in REPORT_PAGE)) redirect("/not-allowed");
  const page = findPage(REPORT_PAGE[id as ReportId]);
  if (!page || !canOpenPage(page, me)) redirect("/not-allowed");
  const supabase = await createClient();
  const year = await resolveYear(sp.year);
  if (!year) redirect("/not-allowed");
  const today = todayIst();
  const res = await getReport(supabase, id as ReportId, { yearId: year.id, yearName: year.name, from: sp.from, to: sp.to, upto: sp.upto, exam: sp.exam, today });
  if (!("data" in res)) redirect("/not-allowed");
  const d = res.data;
  const school = await getReceiptSchool();
  const totals = totalsRow(d);
  const rows = d.rows.map((r) => d.columns.map((c) => cellText(c.kind, r[c.key])));
  if (totals) rows.push(d.columns.map((c) => (c.key in totals ? cellText(c.kind, totals[c.key]) : "")));
  await supabase.rpc("log_report", { p_report: id, p_format: "print", p_filters: JSON.parse(JSON.stringify({ ...sp, year: year.name })), p_rows: d.rows.length });
  return <ReportPrintSheet school={school} title={d.title.toUpperCase()} subtitle={d.subtitle} headers={d.columns.map((c) => c.header)} rows={rows} note={d.note} compact={d.columns.length > 8} footer={printFooterText(formatDate(today), me.fullName)} />;
}
