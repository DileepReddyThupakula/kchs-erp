import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { printFooterText } from "@/features/reports/shared";
import { CertificatePrintPanel, type PrintState } from "@/components/certificates/print-panel";
import type { Bundle } from "@/features/certificates/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Certificate" };

/** The print page of one certificate. Who may open it, and what a print records, is decided by the database (a teacher, or an office person without the right kind, gets nothing). */
export default async function PrintCertificate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/not-allowed");
  const supabase = await createClient();
  const [{ data: bundle, error }, { data: state, error: e2 }] = await Promise.all([
    supabase.rpc("certificate_print_data", { p_certificate: id }),
    supabase.rpc("certificate_print_state", { p_certificate: id }),
  ]);
  if (error || e2 || !bundle || !state) redirect("/not-allowed");
  const school = await getReceiptSchool();
  return (
    <CertificatePrintPanel id={id} initial={bundle as unknown as Bundle} state={state as unknown as PrintState} issuedNow={sp.issued === "1"} school={school} footer={printFooterText(formatDate(todayIst()), me.fullName)} />
  );
}
