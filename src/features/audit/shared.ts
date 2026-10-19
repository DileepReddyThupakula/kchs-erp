/** Audit log: types, wording and links shared by the page, the History pages and the dashboard cards. Pure, no database calls. */

export type AuditChange = { field: string; before: unknown; after: unknown };
export type AuditRow = {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  kind: string;
  table: string | null;
  table_label: string;
  record_id: string | null;
  record_label: string | null;
  summary: string;
  changes: AuditChange[];
};
export type AuditPage = { total: number; limit: number; offset: number; rows: AuditRow[] };
export type AuditActor = { user_id: string; name: string; role: string | null; last_at: string; status: string };

export const AUDIT_PAGE_SIZE = 50;
/** One export holds at most this many entries (the database refuses to build more in one go). */
export const AUDIT_EXPORT_MAX = 4000;

export const AUDIT_KINDS: { value: string; label: string }[] = [
  { value: "students", label: "Students" },
  { value: "fees", label: "Fees and receipts" },
  { value: "marks", label: "Marks and locks" },
  { value: "attendance", label: "Attendance" },
  { value: "staff", label: "Staff and duties" },
  { value: "exports", label: "Exports and prints" },
  { value: "access", label: "Sign-in and access" },
  { value: "other", label: "Everything else" },
];
export const KIND_LABEL: Record<string, string> = Object.fromEntries(AUDIT_KINDS.map((k) => [k.value, k.label]));

export type AuditFilters = { from: string; to: string; actor: string; kind: string; q: string; table: string; record: string; alert: string; page: number };

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the address bar. Default range = the last 7 days. Anything odd falls back to the default. */
export function parseAuditFilters(sp: Record<string, string | string[] | undefined>, today: string): AuditFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const from = DATE.test(one("from")) ? one("from") : addDays(today, -6);
  const to = DATE.test(one("to")) ? one("to") : today;
  const kind = AUDIT_KINDS.some((k) => k.value === one("kind")) ? one("kind") : "";
  const table = /^[a-z_]{1,60}$/.test(one("table")) ? one("table") : "";
  return {
    from: from <= to ? from : to,
    to,
    actor: UUID.test(one("actor")) ? one("actor") : "",
    kind,
    q: one("q").trim().slice(0, 60),
    table,
    record: one("record").trim().slice(0, 80),
    alert: (ALERT_KEYS as readonly string[]).includes(one("alert")) ? one("alert") : "",
    page: Math.max(1, Math.min(10000, parseInt(one("page") || "1", 10) || 1)),
  };
}

/** The arguments of public.audit_entries / audit_export for these filters. Dates are India time, "to" is the whole last day. */
export function auditRpcArgs(f: AuditFilters) {
  return {
    p_from: `${f.from}T00:00:00+05:30`,
    p_to: `${addDays(f.to, 1)}T00:00:00+05:30`,
    p_actor: f.actor || undefined,
    p_group: f.kind || undefined,
    p_table: f.table || undefined,
    p_record: f.record || undefined,
    p_search: f.q || undefined,
    p_alert: f.alert || undefined,
  };
}

export function auditHref(p: Partial<Record<"from" | "to" | "actor" | "kind" | "q" | "table" | "record" | "alert" | "page", string>>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `/audit-log?${s}` : "/audit-log";
}

/** "Date and time" for the Admin, in India time. */
export function formatAuditTime(at: string) {
  return new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

/** A before/after value as plain text. */
export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** One line per entry for Excel / CSV: only the changed fields. */
export function changesText(changes: AuditChange[]): string {
  return changes.map((c) => `${c.field}: ${showValue(c.before)} → ${showValue(c.after)}`).join("; ");
}

// ------------------------------------------------------------------ dashboard alerts
export const ALERT_KEYS = ["ids_revealed", "receipts_cancelled", "exams_unlocked", "marks_after_unlock", "failed_logins", "duties_changed", "roles_changed", "staff_deactivated"] as const;
export type AlertKey = (typeof ALERT_KEYS)[number];
export type AuditAlert = { key: AlertKey; label: string; severity: string; count: number; latest_at: string | null; rows: { at: string; who: string; text: string }[] };
export type AuditAlerts = { days: number; items: AuditAlert[] };

/** Wording is deliberately calm: a few wrong passwords is usually a forgotten password, not an attack. */
export const ALERT_COPY: Record<AlertKey, { title: string; help: string }> = {
  ids_revealed: { title: "Full ID numbers viewed or exported", help: "Check it was needed for the work." },
  receipts_cancelled: { title: "Fee receipts cancelled", help: "Each one has a reason; read it." },
  exams_unlocked: { title: "Exams or results unlocked", help: "Unlocked results can be edited again." },
  marks_after_unlock: { title: "Marks changed after an unlock", help: "Marks were edited after the exam was unlocked." },
  failed_logins: { title: "Several wrong sign-in attempts on one account", help: "Often just a forgotten password. Look into it if the person says it was not them." },
  duties_changed: { title: "Duties or fee access changed", help: "Who was given or lost a duty." },
  roles_changed: { title: "Staff roles changed", help: "Someone's role was changed." },
  staff_deactivated: { title: "Staff deactivated", help: "These people can no longer sign in." },
};

/** Where each alert opens: the audit log showing ONLY the entries that triggered it, for the same 7 days the card counts. */
export function alertHref(key: AlertKey, today: string): string {
  return auditHref({ from: addDays(today, -6), to: today, alert: key });
}

export function alertRowText(key: AlertKey, text: string): string {
  return key === "failed_logins" ? text.replace("Failed sign-in for", "Wrong sign-in attempt for") : text;
}
