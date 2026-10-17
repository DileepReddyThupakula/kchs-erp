import Link from "next/link";
import { Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { Badge, EmptyState } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { ParamSelect } from "@/components/ui/param-select";
import { getExamSections, getScheme, pickSection } from "@/features/exams/queries";
import { fmtNum, fmtPct, RESULT_TEXT, unmarkedWarning } from "@/features/exams/shared";
import { AttendanceWarning } from "@/components/exams/attendance-warning";

export const metadata = { title: "Report cards" };

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ section?: string; group?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/exams/report-cards");
  const supabase = await createClient();
  const all = can(me, "marks.enterAll");
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">Set up the academic year first.</EmptyState>;
  const sections = (await getExamSections(supabase, me, year.id)).filter((s) => all || s.classTeacherId === me.staffId);
  if (!sections.length) return <EmptyState title="No report cards for you">Report cards are printed by Admin, the marks duty, and the class teacher of each section.</EmptyState>;
  const section = await pickSection(supabase, sections, year.id, sp.section);
  const scheme = await getScheme(supabase, year.id, section.classId);
  const groups = scheme.groups.filter((g) => g.kind === "term" || g.kind === "final");
  if (!groups.length) return <EmptyState title="No terms set up for this class">The Admin sets up the terms on the Scheme tab.</EmptyState>;
  const group = groups.find((g) => g.id === sp.group) ?? groups[0];
  const { data: list, error } = await supabase.rpc("class_result_list", { p_section: section.id, p_group: group.id });
  const rows = list ?? [];
  // before printing: are too many attendance sessions of this period unmarked? (every student of a section shares the same sessions)
  const from = group.start_date ?? year.start_date;
  const to = group.end_date ?? year.end_date;
  const sample = group.locked_at && rows[0] && from && to ? (await supabase.rpc("student_day_totals", { p_student: rows[0].student_id, p_from: from, p_to: to })).data?.[0] : null;
  const warn = sample ? unmarkedWarning(Number(sample.marked_sessions), Number(sample.unmarked_sessions)) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect className="w-56 max-w-full" param="section" label="Section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
        <ParamSelect className="w-56 max-w-full" param="group" label="Report card of" value={group.id} options={groups.map((g) => ({ value: g.id, label: `${g.name}${g.locked_at ? "" : " · not locked"}` }))} />
        {group.locked_at && rows.length > 0 && (
          <Link href={`/print/report-card?section=${section.id}&group=${group.id}`} target="_blank" className={buttonClasses("primary")}>
            <Printer className="size-4" aria-hidden /> Print all {rows.length} cards
          </Link>
        )}
      </div>
      {warn && <AttendanceWarning {...warn} />}
      {!group.locked_at && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{group.name} is not locked yet, so its report cards cannot be printed. Admin locks it on the Locks tab once every mark is entered.</p>}
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-navy-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Roll</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">%</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Printed</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td className="px-3 py-1.5 tabular-nums">{r.roll_no ?? "—"}</td>
                <td className="px-3 py-1.5 font-medium text-navy-900">{r.full_name}</td>
                <td className="px-3 py-1.5 tabular-nums">{r.scored == null ? "—" : `${fmtNum(r.scored)}/${fmtNum(r.max_marks)}`}</td>
                <td className="px-3 py-1.5 tabular-nums">{r.pct == null ? "—" : fmtPct(r.pct)}</td>
                <td className="px-3 py-1.5">{r.grade ?? "—"}</td>
                <td className="px-3 py-1.5">{r.result ? <Badge tone={r.result === "pass" ? "success" : r.result === "fail" ? "danger" : "warning"}>{RESULT_TEXT[r.result as keyof typeof RESULT_TEXT]}</Badge> : "—"}</td>
                <td className="px-3 py-1.5 text-xs text-muted">{r.printed ? `${r.printed} time${r.printed === 1 ? "" : "s"}` : "not yet"}</td>
                <td className="px-3 py-1.5 text-right">
                  {group.locked_at && (
                    <Link href={`/print/report-card?student=${r.student_id}&group=${group.id}`} target="_blank" className={buttonClasses("secondary", "sm")}>
                      <Printer className="size-4" aria-hidden /> Print
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Every print is recorded. A card printed again is marked “Duplicate”. Marks, totals, grades, results and attendance come from the database; nothing is typed on the card.</p>
    </div>
  );
}
