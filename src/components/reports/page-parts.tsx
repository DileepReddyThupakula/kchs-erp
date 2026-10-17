import Link from "next/link";
import { EmptyState } from "@/components/ui/card";
import { ReportView } from "@/components/reports/report-view";
import type { ReportResult } from "@/features/reports/queries";

/** Shows one report result: the table, a "you may not open this" message, or the error. */
export function ReportBody({ res, id, query, filters }: { res: ReportResult; id: string; query: string; filters: Record<string, unknown> }) {
  if ("forbidden" in res) return <EmptyState title="Not available to you">This report is not part of your access.</EmptyState>;
  if ("error" in res) return <p className="text-sm text-red-700">{res.error}</p>;
  return <ReportView data={res.data} printHref={`/print/report/${id}${query ? `?${query}` : ""}`} filters={filters} />;
}

/** "Also see" links to screens that already exist. */
export function AlsoSee({ links }: { links: { href: string; label: string }[] }) {
  return (
    <p className="mt-4 text-sm text-muted">
      Also see:{" "}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 && " · "}
          <Link href={l.href} className="font-medium text-navy-700 underline">
            {l.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
