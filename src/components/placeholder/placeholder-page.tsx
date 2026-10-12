import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Construction, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { canOpenPage, findPage, moduleName, whoCanUse } from "@/lib/site-map";
import { Badge, Card, PageHeader } from "@/components/ui/card";

/**
 * Shared "coming soon" page for every planned page in src/lib/site-map.ts.
 * Permissions are checked BEFORE anything renders: someone who may not use
 * the page gets /not-allowed, exactly like a real page.
 */
export async function PlaceholderPage({ path }: { path: string }) {
  const page = findPage(path);
  if (!page || page.status !== "planned") notFound();
  const me = await requireStaff();
  if (!canOpenPage(page, me)) redirect("/not-allowed");

  const Icon = page.icon;
  const isTeacherView = me.role === "teacher" && page.access.teacher && !(page.access.duty && me.duties.includes(page.access.duty));
  const description = isTeacherView && page.teacherDescription ? page.teacherDescription : page.description;
  const group = me.role === "admin" ? page.menu.admin : page.menu.teacher;

  return (
    <>
      <PageHeader
        breadcrumbs={[...(group && group !== "top" ? [{ label: group }] : []), { label: page.name }]}
        icon={<Icon />}
        title={page.name}
        description={description}
        actions={
          <Badge tone="gold">
            <Construction className="size-3.5" aria-hidden /> Coming soon
          </Badge>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed border-cream-400 bg-cream-50 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-navy-900 text-gold-400 shadow-sm">
            <Icon className="size-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold text-navy-900">{page.name} is coming soon</p>
          <p className="max-w-lg text-sm text-muted">{description}</p>
          <p className="text-xs text-muted">
            Planned in the <span className="font-semibold text-navy-800">{moduleName(page.module)}</span> module.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-navy-900">
            <Users className="size-4 text-navy-500" aria-hidden /> Who can use it
          </h2>
          <ul className="space-y-1.5 text-sm">
            {whoCanUse(page).map((w) => (
              <li key={w} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-peacock-600" aria-hidden /> {w}
              </li>
            ))}
          </ul>
          <h2 className="mb-1 mt-4 font-semibold text-navy-900">Module</h2>
          <p className="text-sm text-muted">{moduleName(page.module)}</p>
        </Card>
      </div>
    </>
  );
}

export function placeholderMetadata(path: string) {
  return { title: findPage(path)?.name ?? "Not found" };
}

