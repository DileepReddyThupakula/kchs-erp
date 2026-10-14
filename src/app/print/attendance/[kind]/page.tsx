import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { canOpenPage, findPage } from "@/lib/site-map";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { ReportPrintSheet } from "@/components/attendance/print-sheet";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getDailyRows, getLowThreshold } from "@/features/attendance/queries";
import { DAY_MARK, monthLabel, monthRange, dayOfWeek } from "@/features/attendance/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Attendance report" };

/** Printable attendance reports. What prints is exactly what the signed-in person may see (RLS). */
export default async function PrintAttendance({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ section?: string; month?: string; range?: string }> }) {
  const { kind } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  const page = findPage("/attendance");
  if (!page || !canOpenPage(page, me)) redirect("/not-allowed");
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year) redirect("/not-allowed");
  const school = await getReceiptSchool();
  const isAny = me.role === "admin" || me.duties.includes("all_class_attendance");
  const all = await getSectionsInfo(supabase, year.id);
  const sections = isAny ? all : all.filter((s) => s.classTeacherId === me.staffId);
  const today = todayIst();

  if (kind === "register") {
    const section = sections.find((s) => s.id === sp.section);
    if (!section) redirect("/not-allowed");
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
    const { from, to, days } = monthRange(month);
    const { data: stats } = await supabase.rpc("section_attendance", { p_section: section.id, p_from: from, p_to: to });
    const daily = await getDailyRows(supabase, (stats ?? []).map((s) => s.student_id), from, to);
    const by = new Map<string, Record<number, string>>();
    for (const d of daily) (by.get(d.studentId) ?? by.set(d.studentId, {}).get(d.studentId)!)[Number(d.date.slice(8, 10))] = d.day;
    const headers = ["Roll", "Student", ...Array.from({ length: days }, (_, i) => String(i + 1)), "Full", "Half", "Abs", "%"];
    const rows = (stats ?? []).map((s) => [
      s.roll_no ?? "",
      s.full_name,
      ...Array.from({ length: days }, (_, i) => {
        const d = i + 1;
        const v = by.get(s.student_id)?.[d];
        if (v) return DAY_MARK[v as keyof typeof DAY_MARK] ?? "?";
        return dayOfWeek(`${month}-${String(d).padStart(2, "0")}`) === 0 ? "·" : "–";
      }),
      s.full_days,
      s.half_days,
      s.absent_days,
      s.pct == null ? "—" : `${s.pct.toFixed(1)}%`,
    ]);
    return (
      <ReportPrintSheet
        school={school}
        title="MONTHLY ATTENDANCE REGISTER"
        subtitle={`${section.label} · ${monthLabel(month)}`}
        headers={headers}
        rows={rows}
        compact
        note="P present both sessions · A absent both · ½M morning only · ½A afternoon only · ? one session marked · – not marked · · Sunday. Each session is half a day; Late counts as present."
      />
    );
  }

  if (kind === "low") {
    const range = sp.range === "year" ? "year" : "month";
    const { from, to } = range === "year" ? { from: year.start_date, to: today } : monthRange(today.slice(0, 7));
    const threshold = await getLowThreshold(supabase);
    const rows: (string | number)[][] = [];
    for (const sec of sections) {
      const { data } = await supabase.rpc("section_attendance", { p_section: sec.id, p_from: from, p_to: to });
      for (const s of data ?? []) if (s.pct !== null && s.pct < threshold) rows.push([sec.label, s.full_name, s.admission_no, `${s.pct.toFixed(1)}%`, `${s.sessions_attended} of ${s.sessions_marked}`, s.absent_days]);
    }
    rows.sort((a, b) => parseFloat(String(a[3])) - parseFloat(String(b[3])));
    return (
      <ReportPrintSheet
        school={school}
        title="LOW ATTENDANCE LIST"
        subtitle={`Below ${threshold}% · ${range === "year" ? `${year.name} to date` : monthLabel(today.slice(0, 7))}`}
        headers={["Section", "Student", "Adm no", "Attendance", "Sessions attended", "Absent days"]}
        rows={rows}
      />
    );
  }
  redirect("/not-allowed");
}
