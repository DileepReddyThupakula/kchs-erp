import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { holdsDuty, type AppRole, type Duty } from "@/lib/auth/permissions";

export type ColumnKind = "text" | "int" | "money" | "pct" | "date" | "month";
export type ReportColumn = { key: string; header: string; kind?: ColumnKind; /** add this column up in the totals row */ total?: boolean };
export type ReportCell = string | number | null;
export type ReportData = {
  id: string;
  title: string;
  /** e.g. "Academic year 2026-27 · as on 19 Oct 2026" */
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  note?: string;
};

/** What is shown on screen and on paper. */
export function cellText(kind: ColumnKind | undefined, v: ReportCell): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (kind) {
    case "int":
      return new Intl.NumberFormat("en-IN").format(Number(v));
    case "money":
      return formatPaise(Number(v));
    case "pct":
      return `${Number(v).toFixed(1)}%`;
    case "date":
      return formatDate(String(v));
    case "month":
      return new Date(`${String(v).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    default:
      return String(v);
  }
}

/** What goes into Excel / CSV: numbers stay numbers (money in rupees). */
export function exportCell(kind: ColumnKind | undefined, v: ReportCell): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (kind === "money") return Number(v) / 100;
  if (kind === "int" || kind === "pct") return Number(v);
  return kind === "month" ? String(v).slice(0, 7) : String(v);
}

/** The totals line for the columns marked `total` (null when there is none). */
export function totalsRow(d: ReportData): Record<string, ReportCell> | null {
  const cols = d.columns.filter((c) => c.total);
  if (!cols.length || !d.rows.length) return null;
  const out: Record<string, ReportCell> = { [d.columns[0].key]: "Total" };
  for (const c of cols) out[c.key] = d.rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0);
  return out;
}

export const PRINT_FOOTER = "Confidential - for school use";
export function printFooterText(printedOn: string, printedBy: string) {
  return `Printed on ${printedOn} by ${printedBy} · ${PRINT_FOOTER}`;
}

// ---------------------------------------------------------------- which report lives where, who may open it
export type ReportId = "strength" | "demographics" | "admissions" | "fee-dues-class" | "fee-monthly" | "fee-concessions" | "exam-class" | "exam-subject" | "staff-attendance";
export const REPORT_PAGE: Record<ReportId, string> = {
  strength: "/reports/strength",
  demographics: "/reports/strength",
  admissions: "/reports/strength",
  "fee-dues-class": "/reports/fees",
  "fee-monthly": "/reports/fees",
  "fee-concessions": "/reports/fees",
  "exam-class": "/reports/exams",
  "exam-subject": "/reports/exams",
  "staff-attendance": "/reports/staff",
};

type Who = { role: AppRole; duties: readonly Duty[] };
export type HubItem = { id: string; title: string; description: string; href: string; group: "Students" | "Fees" | "Attendance" | "Exams" | "Staff" | "My work"; existing: boolean; show: (w: Who) => boolean };

const admin = (w: Who) => w.role === "admin";
/** Everything the Reports hub can link to. New screens and the screens that already existed (linked, not rebuilt). */
export const HUB: HubItem[] = [
  { id: "strength", title: "Strength by class and section", description: "Students per section: boys, girls, left school.", href: "/reports/strength", group: "Students", existing: false, show: () => true },
  { id: "demographics", title: "Demographics", description: "Students by class, social category and religion (counts only).", href: "/reports/strength?tab=demographics", group: "Students", existing: false, show: (w) => holdsDuty(w, "student_records") },
  { id: "admissions", title: "Admissions and leavers", description: "Who joined and who left in a period.", href: "/reports/strength?tab=admissions", group: "Students", existing: false, show: (w) => holdsDuty(w, "student_records") },
  { id: "gov", title: "Government data export", description: "UDISE+ / AP Child Info format (IDs masked).", href: "/reports/government-export", group: "Students", existing: true, show: admin },
  { id: "fee-summary", title: "Fee summary", description: "Dues by class, collection by month, concessions by fee head.", href: "/reports/fees", group: "Fees", existing: false, show: (w) => holdsDuty(w, "fee_collection") },
  { id: "fee-collection", title: "Collection by day, mode and head", description: "Daily and period collection report.", href: "/fees/reports", group: "Fees", existing: true, show: (w) => holdsDuty(w, "fee_collection") },
  { id: "fee-dues", title: "Dues and defaulters", description: "Outstanding fees by student, with the overdue filter.", href: "/fees/dues", group: "Fees", existing: true, show: (w) => holdsDuty(w, "fee_collection") },
  { id: "fee-receipts", title: "Receipts", description: "Every receipt, cancelled ones included.", href: "/fees/receipts", group: "Fees", existing: true, show: (w) => holdsDuty(w, "fee_collection") },
  { id: "fee-concessions", title: "Concessions given", description: "Each student's concession and its reason.", href: "/fees/concessions", group: "Fees", existing: true, show: admin },
  { id: "att", title: "Attendance reports", description: "Daily summary, monthly register, year summary, low attendance.", href: "/attendance/reports", group: "Attendance", existing: true, show: () => true },
  { id: "staff-att-summary", title: "Staff attendance summary", description: "Present, late, absent and on-leave days per staff member.", href: "/reports/staff", group: "Staff", existing: false, show: admin },
  { id: "staff-att", title: "Staff attendance (daily)", description: "Mark and see staff attendance day by day.", href: "/staff/attendance", group: "Staff", existing: true, show: admin },
  { id: "exam-summary", title: "Results summary", description: "Pass, fail and incomplete per section; subject averages.", href: "/reports/exams", group: "Exams", existing: false, show: () => true },
  { id: "exam-results", title: "Exam results", description: "Results per student with every calculation.", href: "/exams/results", group: "Exams", existing: true, show: () => true },
  { id: "report-cards", title: "Report cards", description: "Print locked report cards.", href: "/exams/report-cards", group: "Exams", existing: true, show: (w) => w.role === "admin" || holdsDuty(w, "all_class_marks") || w.role === "teacher" },
  { id: "my-load", title: "My timetable and duties", description: "Your periods, sections, substitutions and leave.", href: "/reports/my-load", group: "My work", existing: false, show: (w) => w.role !== "admin" },
  { id: "notices", title: "Notices (read / unread)", description: "Your notices and the ones you have read.", href: "/notices", group: "My work", existing: true, show: (w) => w.role !== "admin" },
];
export function hubFor(w: Who): HubItem[] {
  return HUB.filter((h) => h.show(w));
}
