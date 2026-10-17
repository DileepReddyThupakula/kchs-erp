import Link from "next/link";
import { BarChart3, ExternalLink } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { hubFor, type HubItem } from "@/features/reports/shared";

export const metadata = { title: "Reports" };

const ORDER: HubItem["group"][] = ["Students", "Fees", "Attendance", "Exams", "Staff", "My work"];

/** The Reports hub: only the reports this person may open. Screens that already existed are linked, not rebuilt. */
export default async function ReportsPage() {
  const me = await requirePage("/reports");
  const items = hubFor(me);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Reports" }]} icon={<BarChart3 />} title="Reports" description="Pick a report. You can print it or export it to Excel; every export and print is recorded in the audit log. Reports are never shared by WhatsApp." />
      <div className="space-y-6">
        {ORDER.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <section key={g} aria-label={g}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((i) => (
                  <Link key={i.id} href={i.href} className="group rounded-[var(--radius-card)]">
                    <Card className="h-full transition-[box-shadow,border-color] group-hover:border-gold-300 group-hover:shadow-[var(--shadow-lift)]">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-navy-900">{i.title}</h3>
                        {i.existing && (
                          <Badge tone="neutral">
                            <ExternalLink className="mr-1 inline size-3" aria-hidden />
                            Opens its own page
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted">{i.description}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
