import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_PAGE_SIZE, auditRpcArgs, type AuditActor, type AuditFilters, type AuditPage, type AuditRow } from "./shared";

/** One page of entries, cut in the database (never the whole log). Admin only: the database refuses anyone else. */
export async function getAuditPage(supabase: SupabaseClient, f: AuditFilters): Promise<AuditPage> {
  const { data } = await supabase.rpc("audit_entries", { ...auditRpcArgs(f), p_limit: AUDIT_PAGE_SIZE, p_offset: (f.page - 1) * AUDIT_PAGE_SIZE });
  return (data as AuditPage | null) ?? { total: 0, limit: AUDIT_PAGE_SIZE, offset: 0, rows: [] };
}

export async function getAuditActors(supabase: SupabaseClient): Promise<AuditActor[]> {
  const { data } = await supabase.rpc("audit_actors");
  return (data as AuditActor[] | null) ?? [];
}

/** Every change to one record (a student, a receipt, a staff member), newest first. */
export async function getRecordHistory(supabase: SupabaseClient, table: string, record: string): Promise<AuditRow[]> {
  const { data } = await supabase.rpc("audit_record_history", { p_table: table, p_record: record, p_limit: 200 });
  return (data as AuditRow[] | null) ?? [];
}
