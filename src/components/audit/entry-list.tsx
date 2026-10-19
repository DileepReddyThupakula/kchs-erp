import { Badge } from "@/components/ui/card";
import { formatAuditTime, KIND_LABEL, showValue, type AuditRow } from "@/features/audit/shared";

/** Entries as the Admin reads them: when, who, what happened, and only the fields that changed (before → after). IDs arrive already masked. */
export function AuditEntryList({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">When</th>
            <th className="px-3 py-2 font-semibold">Who</th>
            <th className="px-3 py-2 font-semibold">What happened</th>
            <th className="px-3 py-2 font-semibold">Changed (before → after)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{formatAuditTime(r.at)}</td>
              <td className="px-3 py-2">
                <span className="font-medium text-navy-900">{r.actor_id || r.kind === "access" ? r.actor_name : "System (no person signed in)"}</span>
                {r.actor_role && <span className="ml-1 text-xs text-muted">({r.actor_role.replace("computer_staff", "office")})</span>}
              </td>
              <td className="px-3 py-2">
                <Badge tone="neutral">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                <p className="mt-1">{r.summary}</p>
              </td>
              <td className="px-3 py-2">
                {r.changes.length === 0 ? (
                  <span className="text-muted">—</span>
                ) : (
                  <ul className="space-y-0.5">
                    {r.changes.slice(0, 12).map((c) => (
                      <li key={c.field}>
                        <span className="text-muted">{c.field}: </span>
                        <span className="text-red-700 line-through decoration-red-300">{showValue(c.before)}</span> → <span className="font-medium text-emerald-800">{showValue(c.after)}</span>
                      </li>
                    ))}
                    {r.changes.length > 12 && <li className="text-xs text-muted">and {r.changes.length - 12} more fields</li>}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
