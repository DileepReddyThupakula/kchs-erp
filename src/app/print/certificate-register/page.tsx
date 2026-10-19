import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { printFooterText } from "@/features/reports/shared";
import { ReportPrintSheet } from "@/components/attendance/print-sheet";
import { fmtDate, KIND_SHORT, KINDS, type Kind } from "@/features/certificates/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Certificate register" };

/** A4 print of the register. Opening this page is the print: the database function logs it (who, which register, how many rows). */
export default async function PrintRegister({ searchParams }: { searchParams: Promise<{ kind?: string; year?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  if (!(KINDS as string[]).includes(sp.kind ?? "") || !/^[0-9a-f-]{36}$/.test(sp.year ?? "")) redirect("/not-allowed");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certificate_register_export", { p_kind: sp.kind as Kind, p_year: sp.year!, p_format: "print" });
  if (error || !data) redirect("/not-allowed");
  const reg = data as unknown as { rows: { number: string; student: string; admission_no: string; issue_date: string; issued_by: string | null; status: string; copies: number; purpose: string | null }[] };
  const { data: yr } = await supabase.from("academic_years").select("name").eq("id", sp.year!).single();
  const school = await getReceiptSchool();
  return (
    <ReportPrintSheet school={school} title={`${KIND_SHORT[sp.kind as Kind].toUpperCase()} CERTIFICATE REGISTER`} subtitle={yr?.name ?? ""}
      headers={["Number", "Student", "Admission no", "Date", "Issued by", "Copies", "Status"]}
      rows={reg.rows.map((r) => [r.number, r.student, r.admission_no, fmtDate(r.issue_date), r.issued_by ?? "", r.copies, r.status === "cancelled" ? "Cancelled" : "Issued"])}
      footer={printFooterText(formatDate(todayIst()), me.fullName)} />
  );
}
