import Link from "next/link";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ALERT_COPY, alertHref, alertRowText, formatAuditTime, type AuditAlerts } from "@/features/audit/shared";

/** The 8 "worth a look" cards for the Admin (last 7 days). Calm wording; each card opens the same entries in the audit log. */
export function AuditAlertCards({ alerts, today }: { alerts: AuditAlerts; today: string }) {
  const total = alerts.items.reduce((n, a) => n + a.count, 0);
  return (
    <section aria-label="Worth a look" className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <ShieldAlert className="size-4 text-navy-500" aria-hidden /> Worth a look · last {alerts.days} days
        </h2>
        <Link href="/audit-log" className="text-sm font-medium text-navy-700 hover:underline">Open the audit log</Link>
      </div>
      {total === 0 && <p className="mb-2 text-sm text-muted">Nothing unusual was recorded in the last {alerts.days} days.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {alerts.items.map((a) => {
          const copy = ALERT_COPY[a.key];
          const some = a.count > 0;
          return (
            <li key={a.key}>
              <Card className={some ? "h-full border-gold-300 bg-gold-50/60" : "h-full"}>
                <Link href={alertHref(a.key, today)} className="block" aria-label={`${copy.title}: ${a.count}. Open in the audit log`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-navy-900">{copy.title}</h3>
                    {some ? <span className="rounded-full bg-navy-900 px-2 py-0.5 text-xs font-semibold text-gold-300">{a.count}</span> : <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="None" />}
                  </div>
                  <p className="mt-1 text-xs text-muted">{some ? copy.help : "None in this period."}</p>
                </Link>
                {some && (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                    {a.rows.slice(0, 3).map((r, i) => (
                      <li key={i} className="text-navy-800">
                        <span className="text-muted">{formatAuditTime(r.at)} · {r.who} — </span>
                        {alertRowText(a.key, r.text)}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
