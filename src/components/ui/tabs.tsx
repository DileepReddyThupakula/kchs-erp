import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs (?tab=…), so tabs survive refresh and can be linked. */
export function LinkTabs({ tabs, current }: { tabs: { id: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          role="tab"
          aria-selected={t.id === current}
          className={cn(
            "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
            t.id === current ? "border-gold-500 font-semibold text-navy-900" : "border-transparent text-muted hover:text-navy-800",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-cream-200 px-1.5 text-xs tabular-nums text-navy-800">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
