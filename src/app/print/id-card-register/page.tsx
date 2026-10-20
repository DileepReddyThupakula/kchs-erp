import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { printFooterText } from "@/features/reports/shared";
import { ReportPrintSheet } from "@/components/attendance/print-sheet";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "ID card register" };

/** A4 print of the register. Opening this page is the print: the database function logs it. */
export default async function PrintIdRegister({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  if (!/^[0-9a-f-]{36}$/.test(sp.year ?? "")) redirect("/not-allowed");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("id_card_register_export", { p_year: sp.year!, p_format: "print" });
  if (error || !data) redirect("/not-allowed");
  const reg = data as unknown as { rows: { number: string; student: string; admission_no: string; class: string; section: string; status: string; issued_at: string; replaced_by: string | null }[] };
  const { data: yr } = await supabase.from("academic_years").select("name").eq("id", sp.year!).single();
  const school = await getReceiptSchool();
  return (
    <ReportPrintSheet school={school} title="ID CARD REGISTER" subtitle={yr?.name ?? ""} headers={["Card number", "Student", "Admission no", "Class", "Issued on", "Status"]}
      rows={reg.rows.map((r) => [r.number, r.student, r.admission_no, `${r.class} ${r.section}`, formatDate(String(r.issued_at).slice(0, 10)), r.status === "cancelled" ? `Cancelled${r.replaced_by ? ` (replaced by ${r.replaced_by})` : ""}` : "Issued"])}
      footer={printFooterText(formatDate(todayIst()), me.fullName)} />
  );
}
