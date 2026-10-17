import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { ReportCardSheet, type CardAttendance, type CardData } from "@/components/exams/report-card";
import { ReportPrint } from "@/components/exams/report-print";
import { unmarkedWarning } from "@/features/exams/shared";
import { AttendanceWarning } from "@/components/exams/attendance-warning";

export const metadata = { title: "Report card" };

/** Report cards of a LOCKED result. Opening this page is the print: it is audit-logged, and a card printed before is marked Duplicate.
 *  Access is decided by the database (Admin, the marks duty, or the class teacher of that student's section). */
export default async function PrintReportCard({ searchParams }: { searchParams: Promise<{ student?: string; section?: string; group?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const uuid = /^[0-9a-f-]{36}$/;
  if (!sp.group || !uuid.test(sp.group)) redirect("/not-allowed");
  const supabase = await createClient();
  let ids: string[] = [];
  if (sp.student && uuid.test(sp.student)) ids = [sp.student];
  else if (sp.section && uuid.test(sp.section)) {
    const { data, error } = await supabase.rpc("class_result_list", { p_section: sp.section, p_group: sp.group });
    if (error) redirect("/not-allowed");
    ids = (data ?? []).map((r) => r.student_id);
  }
  if (!ids.length) redirect("/not-allowed");
  const year = await resolveYear();
  const school = await getReceiptSchool();
  const cards: { data: CardData; attendance: CardAttendance }[] = [];
  let worst: ReturnType<typeof unmarkedWarning> = null;
  for (const id of ids) {
    const { data, error } = await supabase.rpc("report_card_data", { p_student: id, p_group: sp.group, p_log: true });
    if (error || !data) {
      if (ids.length === 1) redirect("/not-allowed");
      continue;
    }
    const d = data as unknown as CardData;
    const from = d.group.start_date ?? year?.start_date;
    const to = d.group.end_date ?? year?.end_date;
    let attendance: CardAttendance = null;
    if (from && to) {
      const { data: a } = await supabase.rpc("student_day_totals", { p_student: id, p_from: from, p_to: to });
      const r = a?.[0];
      if (r) {
        const w = unmarkedWarning(Number(r.marked_sessions), Number(r.unmarked_sessions));
        if (w && (!worst || w.pct > worst.pct)) worst = w;
      }
      if (r) attendance = { working: Number(r.working_days), present: Number(r.present_days), absent: Number(r.absent_days), pct: r.pct == null ? null : Number(r.pct), unmarked: r.unmarked_sessions };
    }
    cards.push({ data: d, attendance });
  }
  if (!cards.length) redirect("/not-allowed");
  return (
    <ReportPrint count={cards.length} warning={worst ? <AttendanceWarning {...worst} /> : null}>
      {cards.map((c) => (
        <ReportCardSheet key={c.data.student.id} data={c.data} school={school} attendance={c.attendance} />
      ))}
    </ReportPrint>
  );
}
