import { BookOpenCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { DiaryTabs, type DiaryTabDef } from "@/components/notices/diary-tabs";

/** One "Exams & marks" menu entry; its pages are tabs. */
export default async function ExamsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const admin = me.role === "admin";
  const duty = can(me, "marks.enterAll");
  const supabase = await createClient();
  const { count } = admin || duty ? { count: 1 } : await supabase.from("sections").select("id", { count: "exact", head: true }).eq("class_teacher_id", me.staffId);
  const tabs: DiaryTabDef[] = [
    { id: "marks", label: "Marks entry", href: "/exams/marks" },
    { id: "results", label: "Results", href: "/exams/results" },
    { id: "grades", label: "Grades & remarks", href: "/exams/grades" },
    ...(duty ? [{ id: "locks", label: "Locks", href: "/exams/locks" }] : []),
    ...(admin ? [{ id: "scheme", label: "Scheme", href: "/exams/scheme" }] : []),
    ...((admin || duty || (count ?? 0) > 0) ? [{ id: "cards", label: "Report cards", href: "/exams/report-cards" }] : []),
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Academics" }, { label: "Exams & marks" }]}
        icon={<BookOpenCheck />}
        title="Exams & marks"
        description={admin ? "Set up the scheme, enter marks, see every calculation, lock results and print report cards." : "Enter marks for your own subjects and sections. Totals, grades and results are calculated automatically."}
      />
      <DiaryTabs tabs={tabs} />
      {children}
    </>
  );
}
