import Link from "next/link";
import { redirect } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { canOpenPage, findPage, MODULES, PAGES, whoCanUse } from "@/lib/site-map";
import { Card, PageHeader, StatusChip } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Roadmap" };

function Progress({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-peacock-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-muted">
        {done}/{total} · {pct}%
      </span>
    </div>
  );
}

/** Every module with its pages and status, straight from src/lib/site-map.ts. Admin only. */
export default async function RoadmapPage() {
  const me = await requireStaff();
  if (!canOpenPage(findPage("/roadmap")!, me)) redirect("/not-allowed");
  const built = PAGES.filter((p) => p.status === "built").length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Roadmap" }]}
        icon={<MapIcon />}
        title="Roadmap"
        description="Every module and page of the ERP, and what is built so far."
      />
      <Card className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold text-navy-900">Overall progress</h2>
          <span className="text-sm text-muted">
            {built} of {PAGES.length} pages built
          </span>
        </div>
        <Progress done={built} total={PAGES.length} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {MODULES.map((m) => {
          const pages = PAGES.filter((p) => p.module === m.id);
          const done = pages.filter((p) => p.status === "built").length;
          const status = done === pages.length ? "built" : done > 0 ? "in_progress" : "planned";
          return (
            <Card key={m.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-navy-900">{m.name}</h2>
                <StatusChip
                  status={status === "built" ? "active" : status === "in_progress" ? "current" : "planned"}
                  label={status === "built" ? "Built" : status === "in_progress" ? "In progress" : "Planned"}
                />
              </div>
              <Progress done={done} total={pages.length} className="mb-3" />
              <ul className="divide-y divide-border text-sm">
                {pages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <li key={p.path} className="flex items-center gap-3 py-2">
                      <Icon className="size-4 shrink-0 text-navy-500" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Link href={p.path} className="font-medium text-navy-800 hover:underline">
                          {p.name}
                        </Link>
                        <p className="truncate text-xs text-muted">{whoCanUse(p).join(" · ")}</p>
                      </div>
                      <StatusChip status={p.status === "built" ? "active" : "planned"} label={p.status === "built" ? "Built" : "Planned"} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
