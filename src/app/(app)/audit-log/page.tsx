import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { todayIst } from "@/features/fees/shared";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { AuditEntryList } from "@/components/audit/entry-list";
import { AuditExportButtons } from "@/components/audit/export-buttons";
import { getAuditActors, getAuditPage } from "@/features/audit/queries";
import { ALERT_COPY, type AlertKey, AUDIT_EXPORT_MAX, AUDIT_KINDS, AUDIT_PAGE_SIZE, auditHref, parseAuditFilters } from "@/features/audit/shared";

export const metadata = { title: "Audit log" };

const field = "h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm";

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("/audit-log"); // Admin only, checked before anything is read
  const today = todayIst();
  const f = parseAuditFilters(await searchParams, today);
  const supabase = await createClient();
  const [page, actors] = await Promise.all([getAuditPage(supabase, f), getAuditActors(supabase)]);

  const params: Record<string, string> = { from: f.from, to: f.to, actor: f.actor, kind: f.kind, q: f.q, table: f.table, record: f.record, alert: f.alert };
  const pages = Math.max(1, Math.ceil(page.total / AUDIT_PAGE_SIZE));
  const link = (n: number) => auditHref({ ...params, page: n > 1 ? String(n) : "" });
  const tooMany = page.total > AUDIT_EXPORT_MAX;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Audit log" }]}
        icon={<ScrollText />}
        title="Audit log"
        description="Who changed what and when. Entries can never be edited or deleted. ID numbers are always masked."
        actions={<AuditExportButtons params={params} disabledReason={tooMany ? `More than ${AUDIT_EXPORT_MAX.toLocaleString("en-IN")} entries: narrow the date range first` : page.total === 0 ? "Nothing to export" : undefined} />}
      />
      <form method="get" className="mb-4 grid gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-soft)] sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-muted">From<input type="date" name="from" defaultValue={f.from} className={field} /></label>
        <label className="text-xs font-medium text-muted">To<input type="date" name="to" defaultValue={f.to} className={field} /></label>
        <label className="text-xs font-medium text-muted">Person
          <select name="actor" defaultValue={f.actor} className={field}>
            <option value="">Everyone</option>
            {actors.map((a) => <option key={a.user_id} value={a.user_id}>{a.name}{a.status !== "active" ? ` (${a.status === "removed" ? "removed" : "left / inactive"})` : ""}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">Kind of action
          <select name="kind" defaultValue={f.kind} className={field}>
            <option value="">All kinds</option>
            {AUDIT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">Search (name, receipt no., report…)<input type="search" name="q" defaultValue={f.q} maxLength={60} className={field} /></label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonClasses("primary", "md", "flex-1")}>Show</button>
          <Link href="/audit-log" className={buttonClasses("secondary", "md")}>Reset</Link>
        </div>
        {f.table && <input type="hidden" name="table" value={f.table} />}
        {f.record && <input type="hidden" name="record" value={f.record} />}
        {f.alert && <input type="hidden" name="alert" value={f.alert} />}
      </form>
      {f.alert && (
        <p className="mb-3 text-sm text-muted">
          Showing only the entries behind “{ALERT_COPY[f.alert as AlertKey].title}”.{" "}
          <Link href={auditHref({ from: f.from, to: f.to })} className="font-medium text-navy-700 underline">Show all</Link>
        </p>
      )}
      {(f.table || f.record) && (
        <p className="mb-3 text-sm text-muted">
          Showing {f.table ? `only “${f.table.replace(/_/g, " ")}” entries` : ""}{f.record ? " for one record" : ""}.{" "}
          <Link href={auditHref({ from: f.from, to: f.to, actor: f.actor, kind: f.kind, q: f.q })} className="font-medium text-navy-700 underline">Show all</Link>
        </p>
      )}
      {tooMany && (
        <p role="status" className="mb-3 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
          This range has {page.total.toLocaleString("en-IN")} entries. You can still read them page by page, but an Excel / CSV file holds up to {AUDIT_EXPORT_MAX.toLocaleString("en-IN")}. Please narrow the date range to export.
        </p>
      )}
      <p className="mb-2 text-sm text-muted" aria-live="polite">{page.total.toLocaleString("en-IN")} {page.total === 1 ? "entry" : "entries"} · page {Math.min(f.page, pages)} of {pages}</p>
      {page.rows.length === 0 ? (
        <EmptyState title="No entries">Nothing was recorded for these filters. Try a wider date range.</EmptyState>
      ) : (
        <AuditEntryList rows={page.rows} />
      )}
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pages">
          {f.page > 1 ? <Link href={link(f.page - 1)} className={buttonClasses("secondary")}>← Newer</Link> : <span />}
          {f.page < pages ? <Link href={link(f.page + 1)} className={buttonClasses("secondary")}>Older →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
