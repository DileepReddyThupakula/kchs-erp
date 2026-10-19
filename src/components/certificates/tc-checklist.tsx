import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { formatPaise } from "@/lib/money";
import type { CheckItem } from "@/features/certificates/shared";

const ICON = { ok: CheckCircle2, fail: XCircle, warn: AlertTriangle } as const;
const TONE = { ok: "text-emerald-600", fail: "text-red-600", warn: "text-amber-600" } as const;

/** The TC checks, green / amber / red, each with a link to fix it. Shown to the Admin only (it shows the dues). */
export function TcChecklist({ items }: { items: CheckItem[] }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface text-sm shadow-[var(--shadow-soft)]" aria-label="Checks before issuing the TC">
      {items.map((c) => {
        const Icon = ICON[c.status];
        return (
          <li key={c.key} data-status={c.status} className="flex items-start gap-3 px-3 py-2">
            <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[c.status]}`} aria-label={c.status === "ok" ? "Green" : c.status === "fail" ? "Red" : "Amber"} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-navy-900">{c.label}</span>
              <span className="block text-xs text-muted">{c.detail}{c.key === "dues" && (c.amount_paise ?? 0) > 0 ? `: ${formatPaise(c.amount_paise)}` : ""}</span>
            </span>
            {c.status !== "ok" && <Link href={c.href} className="shrink-0 text-xs font-medium text-navy-700 underline">{c.key === "dues" ? "Collect fee" : "Fix this"}</Link>}
          </li>
        );
      })}
    </ul>
  );
}

/** Only unpaid dues can be overridden. Missing details or no class never can. */
export function overrideState(items: CheckItem[] | null | undefined): { red: CheckItem[]; canOverride: boolean } {
  const red = (items ?? []).filter((c) => c.status === "fail");
  return { red, canOverride: red.length > 0 && red.every((c) => c.key === "dues") };
}
