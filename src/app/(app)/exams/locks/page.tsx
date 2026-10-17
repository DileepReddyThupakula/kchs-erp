import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { LocksList, type LockClass } from "@/components/exams/locks-list";

export const metadata = { title: "Exam locks" };

export default async function LocksPage() {
  const me = await requirePage("/exams/locks");
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">Set up the academic year first.</EmptyState>;
  const [{ data: classes }, { data: comps }, { data: groups }, { data: members }] = await Promise.all([
    supabase.from("classes").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("exam_components").select("id, class_id, name, locked_at, lock_note").eq("academic_year_id", year.id).order("sort_order"),
    supabase.from("result_groups").select("id, class_id, name, kind, locked_at").eq("academic_year_id", year.id).order("sort_order"),
    supabase.from("result_group_members").select("group_id, component_id, child_group_id"),
  ]);
  const pending = new Map<string, number>();
  await Promise.all(
    (comps ?? []).filter((c) => !c.locked_at).map(async (c) => {
      const { data } = await supabase.rpc("exam_pending", { p_component: c.id });
      pending.set(c.id, (data ?? []).reduce((a, p) => a + p.pending, 0));
    }),
  );
  const gm = new Map<string, { components: string[]; children: string[] }>();
  for (const m of members ?? []) {
    const e = gm.get(m.group_id) ?? { components: [], children: [] };
    if (m.component_id) e.components.push(m.component_id);
    if (m.child_group_id) e.children.push(m.child_group_id);
    gm.set(m.group_id, e);
  }
  const subtree = (gid: string, seen = new Set<string>()): string[] => {
    if (seen.has(gid)) return [];
    seen.add(gid);
    const e = gm.get(gid);
    return e ? [...e.components, ...e.children.flatMap((c) => subtree(c, seen))] : [];
  };
  const data: LockClass[] = (classes ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      groups: (groups ?? [])
        .filter((g) => g.class_id === c.id && g.kind !== "part")
        .map((g) => {
          const ids = [...new Set(subtree(g.id))];
          return { id: g.id, name: g.name, locked: !!g.locked_at, pending: ids.reduce((a, id) => a + (pending.get(id) ?? 0), 0), exams: ids.length };
        }),
      exams: (comps ?? []).filter((x) => x.class_id === c.id).map((x) => ({ id: x.id, name: x.name, locked: !!x.locked_at, note: x.lock_note, pending: pending.get(x.id) ?? 0 })),
    }))
    .filter((c) => c.groups.length || c.exams.length);
  return <LocksList classes={data} canChange={me.role === "admin"} />;
}
