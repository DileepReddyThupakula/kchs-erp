import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { DraftPanel, NumberingPanel, SignaturePanel, WordingPanel, type SeriesRow, type TemplateRow } from "@/components/certificates/settings-panels";
import { KINDS, type Kind } from "@/features/certificates/shared";

export const metadata = { title: "Certificate settings" };

/** Admin only: numbering, the TC draft switch, wording and Telugu checks, the signature image switch. */
export default async function CertificateSettings() {
  const me = await requirePage("/students/certificates");
  if (me.role !== "admin") redirect("/not-allowed");
  const supabase = await createClient();
  const year = (await getAcademicYears()).find((y) => y.is_current);
  const [{ data: st }, { data: tm }, { data: sr }, { data: issued }] = await Promise.all([
    supabase.from("certificate_settings").select("*").eq("id", 1).single(),
    supabase.from("certificate_templates").select("*"),
    year ? supabase.from("certificate_series").select("kind, next_no, start_no").eq("academic_year_id", year.id) : Promise.resolve({ data: [] }),
    year ? supabase.from("certificates").select("kind").eq("academic_year_id", year.id) : Promise.resolve({ data: [] }),
  ]);
  const templates = KINDS.map((k) => (tm ?? []).find((t) => t.kind === k)).filter(Boolean).map((t) => ({ ...t!, texts: t!.texts as never })) as unknown as TemplateRow[];
  const series: SeriesRow[] = KINDS.map((k) => {
    const s = (sr ?? []).find((x) => x.kind === k);
    return { kind: k as Kind, next_no: s?.next_no ?? 1, start_no: s?.start_no ?? 1, issued: (issued ?? []).filter((c) => c.kind === k).length };
  });
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "Certificates", href: "/students/certificates" }, { label: "Settings" }]} icon={<Settings2 />} title="Certificate settings" description="Admin only. Every change here is recorded in the audit log." />
      <DraftPanel templates={templates} />
      {year && st && <NumberingPanel prefixes={{ tc: st.prefix_tc, bonafide: st.prefix_bonafide, study: st.prefix_study }} series={series} yearId={year.id} yearName={year.name} />}
      <WordingPanel templates={templates} />
      <SignaturePanel on={!!st?.show_signature_image} />
    </>
  );
}
