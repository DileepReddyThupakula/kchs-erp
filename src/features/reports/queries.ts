import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { ReportData, ReportId } from "./shared";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type ReportParams = { yearId: string; yearName: string; from?: string; to?: string; upto?: string; exam?: string; today: string;
  /** The rows the one-call page function already fetched for the exam reports; otherwise they are fetched here. */
  examPage?: { rows: Record<string, unknown>[]; forbidden?: boolean } };

/** The result of asking for a report: the data, or "not allowed" (the database refused). */
export type ReportResult = { data: ReportData } | { forbidden: true } | { error: string };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function forbidden(error: { code?: string; message: string } | null) {
  return error && (error.code === "42501" || /not allowed/i.test(error.message));
}

/** The names of the result groups (Term 1, Term 2, Final) that exist this year, in order. */
export async function getExamNames(supabase: Supa, yearId: string): Promise<string[]> {
  const { data } = await supabase.from("result_groups").select("name, kind, sort_order").eq("academic_year_id", yearId).in("kind", ["term", "final"]).order("sort_order");
  return [...new Set((data ?? []).map((g) => g.name))];
}

/** One report, as rows. The database function decides what this person may see; nothing is filtered here. */
export async function getReport(supabase: Supa, id: ReportId, p: ReportParams): Promise<ReportResult> {
  const year = `Academic year ${p.yearName}`;
  switch (id) {
    case "strength": {
      const { data, error } = await supabase.rpc("report_strength", { p_year: p.yearId });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Strength by class and section", subtitle: `${year} · as on ${formatDate(p.today)}`,
          columns: [
            { key: "class", header: "Class" }, { key: "section", header: "Section" },
            { key: "active", header: "Active", kind: "int", total: true }, { key: "boys", header: "Boys", kind: "int", total: true }, { key: "girls", header: "Girls", kind: "int", total: true },
            { key: "other", header: "Other", kind: "int", total: true }, { key: "left", header: "Left school", kind: "int", total: true },
          ],
          rows: (data ?? []).map((r) => ({ class: r.class_name, section: r.section_name, active: r.active, boys: r.boys, girls: r.girls, other: r.other, left: r.left_school })),
        },
      };
    }
    case "demographics": {
      const { data, error } = await supabase.rpc("report_demographics", { p_year: p.yearId });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Demographics: social category and religion", subtitle: `${year} · active students · counts only`,
          columns: [{ key: "class", header: "Class" }, { key: "category", header: "Social category" }, { key: "religion", header: "Religion" }, { key: "students", header: "Students", kind: "int", total: true }],
          rows: (data ?? []).map((r) => ({ class: r.class_name, category: r.social_category, religion: r.religion, students: r.students })),
        },
      };
    }
    case "admissions": {
      const from = p.from ?? p.today.slice(0, 7) + "-01";
      const to = p.to ?? p.today;
      const { data, error } = await supabase.rpc("report_admissions", { p_year: p.yearId, p_from: from, p_to: to });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Admissions and leavers", subtitle: `${formatDate(from)} to ${formatDate(to)}`,
          columns: [
            { key: "kind", header: "Type" }, { key: "adm", header: "Adm no" }, { key: "name", header: "Student" }, { key: "class", header: "Class" }, { key: "section", header: "Section" },
            { key: "date", header: "Date", kind: "date" }, { key: "status", header: "Status" },
          ],
          rows: (data ?? []).map((r) => ({ kind: r.kind === "admitted" ? "Admitted" : "Left", adm: r.admission_no, name: r.full_name, class: r.class_name, section: r.section_name, date: r.on_date, status: r.status })),
          note: "This list has student names: use it on screen, in Excel or on paper only.",
        },
      };
    }
    case "fee-dues-class": {
      const upto = p.upto ?? p.today;
      const { data, error } = await supabase.rpc("report_fee_dues_by_class", { p_year: p.yearId, p_upto: upto });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Fee dues by class", subtitle: `${year} · dues up to ${formatDate(upto)}`,
          columns: [{ key: "class", header: "Class" }, { key: "students", header: "Students", kind: "int" }, { key: "billed", header: "Billed", kind: "money", total: true }, { key: "paid", header: "Paid", kind: "money", total: true }, { key: "overdue", header: "Overdue", kind: "money", total: true }],
          rows: (data ?? []).map((r) => ({ class: r.class_name, students: r.students, billed: num(r.billed_paise), paid: num(r.paid_paise), overdue: num(r.overdue_paise) })),
          note: "Billed is after concessions. Overdue is what was due on or before the date and is still unpaid.",
        },
      };
    }
    case "fee-monthly": {
      const { data, error } = await supabase.rpc("report_fee_collection_monthly", { p_year: p.yearId });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Fee collection by month", subtitle: year,
          columns: [
            { key: "month", header: "Month", kind: "month" }, { key: "receipts", header: "Receipts", kind: "int", total: true }, { key: "collected", header: "Collected", kind: "money", total: true },
            { key: "cash", header: "Cash", kind: "money", total: true }, { key: "upi", header: "UPI", kind: "money", total: true }, { key: "cheque", header: "Cheque", kind: "money", total: true }, { key: "bank", header: "Bank transfer", kind: "money", total: true },
            { key: "cancelled", header: "Cancelled", kind: "int", total: true }, { key: "cancelledAmt", header: "Cancelled amount", kind: "money", total: true },
          ],
          rows: (data ?? []).map((r) => ({ month: r.month, receipts: r.receipts, collected: num(r.collected_paise), cash: num(r.cash_paise), upi: num(r.upi_paise), cheque: num(r.cheque_paise), bank: num(r.bank_paise), cancelled: r.cancelled, cancelledAmt: num(r.cancelled_paise) })),
          note: "Cancelled receipts are shown but not counted in Collected.",
        },
      };
    }
    case "fee-concessions": {
      const { data, error } = await supabase.rpc("report_fee_concessions", { p_year: p.yearId });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Concessions by fee head", subtitle: year,
          columns: [{ key: "head", header: "Fee head" }, { key: "kind", header: "Kind" }, { key: "students", header: "Students", kind: "int", total: true }, { key: "total", header: "Concession given", kind: "money", total: true }],
          rows: (data ?? []).map((r) => ({ head: r.fee_head, kind: r.kind, students: r.students, total: num(r.total_paise) })),
        },
      };
    }
    case "exam-class":
    case "exam-subject": {
      const exam = p.exam;
      if (!exam) return { data: { id, title: id === "exam-class" ? "Results by section" : "Results by subject", subtitle: year, columns: [], rows: [], note: "No result has been set up yet." } };
      type ClassRow = { class_name: string; section_name: string; students: number; passed: number; failed: number; incomplete: number; avg_pct: number | string | null; grades: unknown };
      type SubjectRow = { class_name: string; section_name: string; subject_name: string; students: number; passed: number; failed: number; incomplete: number; avg_pct: number | string | null };
      let fetched: Record<string, unknown>[];
      if (p.examPage) {
        if (p.examPage.forbidden) return { forbidden: true };
        fetched = p.examPage.rows;
      } else {
        const { data: groups } = await supabase.from("result_groups").select("id").eq("academic_year_id", p.yearId).eq("name", exam).in("kind", ["term", "final"]);
        const ids = (groups ?? []).map((g) => g.id);
        if (id === "exam-class") {
          const all = await Promise.all(ids.map((g) => supabase.rpc("report_class_results", { p_group: g })));
          if (all.length && all.every((r) => r.error && forbidden(r.error))) return { forbidden: true };
          fetched = all.flatMap((r) => r.data ?? []);
        } else {
          fetched = (await Promise.all(ids.map((g) => supabase.rpc("report_subject_results", { p_group: g })))).flatMap((r) => r.data ?? []);
        }
      }
      if (id === "exam-class") {
        const rows = fetched as unknown as ClassRow[];
        return {
          data: {
            id, title: `Results by section: ${exam}`, subtitle: year,
            columns: [
              { key: "class", header: "Class" }, { key: "section", header: "Section" }, { key: "students", header: "Students", kind: "int", total: true }, { key: "passed", header: "Passed", kind: "int", total: true },
              { key: "failed", header: "Failed", kind: "int", total: true }, { key: "incomplete", header: "Incomplete", kind: "int", total: true }, { key: "avg", header: "Average %", kind: "pct" }, { key: "grades", header: "Grades" },
            ],
            rows: rows.map((r) => ({
              class: r.class_name, section: r.section_name, students: r.students, passed: r.passed, failed: r.failed, incomplete: r.incomplete, avg: num(r.avg_pct),
              grades: Object.entries((r.grades ?? {}) as Record<string, number>).sort(([a], [b]) => a.localeCompare(b)).map(([g, n]) => `${g}: ${n}`).join(", "),
            })),
            note: "Incomplete = a mark has not been entered yet. No ranking and no class average is printed on report cards.",
          },
        };
      }
      const rows = fetched as unknown as SubjectRow[];
      return {
        data: {
          id, title: `Results by subject: ${exam}`, subtitle: year,
          columns: [
            { key: "class", header: "Class" }, { key: "section", header: "Section" }, { key: "subject", header: "Subject" }, { key: "students", header: "Students", kind: "int", total: true },
            { key: "passed", header: "Passed", kind: "int", total: true }, { key: "failed", header: "Failed", kind: "int", total: true }, { key: "incomplete", header: "Incomplete", kind: "int", total: true }, { key: "avg", header: "Average %", kind: "pct" },
          ],
          rows: rows.map((r) => ({ class: r.class_name, section: r.section_name, subject: r.subject_name, students: r.students, passed: r.passed, failed: r.failed, incomplete: r.incomplete, avg: num(r.avg_pct) })),
        },
      };
    }
    case "staff-attendance": {
      const from = p.from ?? p.today.slice(0, 7) + "-01";
      const to = p.to ?? p.today;
      const { data, error } = await supabase.rpc("report_staff_attendance", { p_from: from, p_to: to });
      if (error) return forbidden(error) ? { forbidden: true } : { error: error.message };
      return {
        data: {
          id, title: "Staff attendance summary", subtitle: `${formatDate(from)} to ${formatDate(to)}`,
          columns: [{ key: "name", header: "Staff member" }, { key: "present", header: "Present", kind: "int", total: true }, { key: "late", header: "Late", kind: "int", total: true }, { key: "absent", header: "Absent", kind: "int", total: true }, { key: "leave", header: "On leave", kind: "int", total: true }, { key: "unmarked", header: "Not marked", kind: "int", total: true }],
          rows: (data ?? []).map((r) => ({ name: r.full_name, present: r.present, late: r.late, absent: r.absent, leave: r.on_leave, unmarked: r.unmarked })),
          note: "“Not marked” counts every calendar day in the period with no entry, Sundays and holidays included.",
        },
      };
    }
  }
}

/** The URL parameters of a report page, as the report takes them. */
export function paramsFromUrl(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) || undefined;
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(one(k) ?? "") ? one(k) : undefined);
  return { from: date("from"), to: date("to"), upto: date("upto"), exam: one("exam")?.slice(0, 40), year: one("year"), tab: one("tab") };
}
