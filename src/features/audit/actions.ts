"use server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";

/** Every export is written to the audit log (what, how many rows, format). */
export async function logExport(what: string, rowCount: number, format: string, details?: Record<string, unknown>) {
  await logReport(what, format === "csv" ? "csv" : "xlsx", details ?? {}, rowCount);
}

/** Every export and print of a report goes to the audit log: who, which report, format, filters, rows. */
export async function logReport(report: string, format: "screen" | "csv" | "xlsx" | "print" | "pdf", filters: Record<string, unknown> = {}, rows?: number) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.rpc("log_report", { p_report: report.slice(0, 80), p_format: format, p_filters: JSON.parse(JSON.stringify(filters)), p_rows: rows });
}
