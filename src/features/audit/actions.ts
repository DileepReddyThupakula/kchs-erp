"use server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";

/** Every export is written to the audit log (what, how many rows, format). */
export async function logExport(what: string, rowCount: number, format: string, details?: Record<string, unknown>) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.rpc("log_event", {
    p_action: "export",
    p_table: what,
    p_details: { rows: rowCount, format, ...(details ?? {}) },
  });
}
