import Link from "next/link";
import { formatPaise } from "@/lib/money";
import { Card } from "@/components/ui/card";

export type FeeBlock = { collected_today_paise: number | string; receipts_today: number; overdue_paise: number | string; defaulters?: number } | null;

/** Today's fee numbers. Rendered ONLY when the database sent them, i.e. for someone with fee access. */
export function FeeTiles({ fees }: { fees: FeeBlock }) {
  if (!fees) return null;
  const tiles = [
    { label: "Collected today", value: formatPaise(Number(fees.collected_today_paise)), href: "/fees/reports" },
    { label: "Receipts today", value: String(fees.receipts_today), href: "/fees/receipts" },
    { label: "Overdue now", value: formatPaise(Number(fees.overdue_paise)), href: "/fees/dues" },
    ...(fees.defaulters !== undefined ? [{ label: "Students owing", value: String(fees.defaulters), href: "/fees/dues" }] : []),
  ];
  return (
    <section aria-label="Fees today" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="rounded-[var(--radius-card)]">
          <Card className="h-full transition-[box-shadow,border-color] hover:border-gold-300 hover:shadow-[var(--shadow-lift)]">
            <p className="text-2xl font-semibold tabular-nums text-navy-900">{t.value}</p>
            <p className="text-sm text-muted">{t.label}</p>
          </Card>
        </Link>
      ))}
    </section>
  );
}
