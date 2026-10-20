import { Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { printFooterText } from "@/features/reports/shared";
import { PageHeader } from "@/components/ui/card";
import { IssueCardsForm } from "@/components/id-cards/issue-form";
import type { SectionOption } from "@/features/id-cards/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Issue ID cards" };

export default async function IssuePage() {
  const me = await requirePage("/students/id-cards");
  const supabase = await createClient();
  const { data } = await supabase.rpc("id_card_sections");
  const j = (data as unknown as { year: string; sections: SectionOption[] } | null) ?? { year: "", sections: [] };
  const school = await getReceiptSchool();
  const today = todayIst();
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "ID cards", href: "/students/id-cards" }, { label: "Issue" }]} icon={<Printer />} title="Issue ID cards" description={`Cards for ${j.year}. The numbers are given only when you press Issue.`} />
      <IssueCardsForm sections={j.sections} school={school} footer={printFooterText(formatDate(today), me.fullName)} isAdmin={me.role === "admin"} />
    </>
  );
}
