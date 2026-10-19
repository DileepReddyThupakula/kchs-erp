"use server";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/features/students/page-guard";
import { todayIst } from "@/features/fees/shared";
import { AUDIT_EXPORT_MAX, auditRpcArgs, changesText, formatAuditTime, KIND_LABEL, parseAuditFilters, type AuditRow } from "./shared";

export type AuditExport = { error: string } | { headers: string[]; rows: (string | null)[][] };

/**
 * Rows for the Excel / CSV file. The database function writes the "exported" entry in the same call, so an export can never be unlogged.
 * Over 4,000 entries it refuses and asks for a narrower date range.
 */
export async function exportAuditLog(params: Record<string, string>, format: "csv" | "xlsx"): Promise<AuditExport> {
  await requirePage("/audit-log");
  const f = parseAuditFilters(params, todayIst());
  const supabase = await createClient();
  const args = auditRpcArgs(f);
  const probe = await supabase.rpc("audit_entries", { ...args, p_limit: 1 });
  if (probe.error) return { error: "Could not read the audit log." };
  if (((probe.data as { total: number } | null)?.total ?? 0) > AUDIT_EXPORT_MAX) return { error: `More than ${AUDIT_EXPORT_MAX.toLocaleString("en-IN")} entries. Narrow the date range and try again.` };
  const { data, error } = await supabase.rpc("audit_export", { p_format: format, ...args });
  if (error) return { error: "The export did not work. Try a narrower date range." };
  const rows = (data as AuditRow[] | null) ?? [];
  return {
    headers: ["When (India time)", "Person", "Role", "Kind", "What happened", "Record", "Changed fields (before → after)"],
    rows: rows.map((r) => [formatAuditTime(r.at), r.actor_name, r.actor_role, KIND_LABEL[r.kind] ?? r.kind, r.summary, r.record_label ?? r.record_id, changesText(r.changes)]),
  };
}
