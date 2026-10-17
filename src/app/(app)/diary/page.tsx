import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

/** The old /diary address: sends people to the right tab (old links with ?tab=, ?section= and ?date= keep working). */
export default async function DiaryIndex({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; section?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const editor = can(me, "notices.edit");
  const qs = (keys: (keyof typeof sp)[]) => {
    const p = new URLSearchParams();
    for (const k of keys) if (sp[k]) p.set(k, sp[k]!);
    return p.size ? `?${p}` : "";
  };
  if (sp.tab === "entries") redirect(`/diary/entries${qs(["from", "to"])}`);
  if (sp.tab === "quick") redirect(editor ? "/diary/class" : "/diary/published");
  if (sp.section || sp.date || sp.tab === "day") redirect(`/diary/published${qs(["section", "date"])}`);
  redirect(editor ? "/diary/class" : me.role === "admin" ? "/diary/published" : "/diary/submit");
}
