"use client";
import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui/tabs";

export type DiaryTabDef = { id: string; label: string; href: string };

/** The one "Diary" menu entry opens a page with these tabs. */
export function DiaryTabs({ tabs }: { tabs: DiaryTabDef[] }) {
  const path = usePathname();
  const current = tabs.find((t) => path === t.href || path.startsWith(t.href + "/"))?.id ?? tabs[0]?.id ?? "";
  return <LinkTabs current={current} tabs={tabs} />;
}
