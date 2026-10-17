import { NotebookPen } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/card";
import { DiaryTabs, type DiaryTabDef } from "@/components/notices/diary-tabs";

/** One "Diary" entry in the menu; its pages are tabs. Editors (Admin, notices & diary duty) and teachers get different tabs. */
export default async function DiaryLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const editor = can(me, "notices.edit");
  const tabs: DiaryTabDef[] = [
    ...(editor ? [{ id: "class", label: "Class diary", href: "/diary/class" }] : []),
    ...(me.role !== "admin" ? [{ id: "submit", label: "Submit diary", href: "/diary/submit" }] : []),
    { id: "published", label: "Published diary", href: "/diary/published" },
    ...(editor ? [{ id: "entries", label: "All entries", href: "/diary/entries" }] : []),
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Diary" }]}
        icon={<NotebookPen />}
        title="Diary"
        description={editor ? "Review each class's subjects together, publish, and send to the class WhatsApp group." : "Submit your own subjects' homework and read the published diary of your sections."}
      />
      <DiaryTabs tabs={tabs} />
      {children}
    </>
  );
}
