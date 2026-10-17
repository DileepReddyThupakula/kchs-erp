import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CircularPrint } from "@/components/notices/circular-print";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { circularData } from "@/features/notices/circular";
import { getAudienceText } from "@/features/notices/queries";

export const metadata = { title: "Circular" };

/** A4 circular. Only Admin and the notices & diary duty can print (teachers are refused). */
export default async function PrintNotice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCapability("notices.edit");
  const supabase = await createClient();
  const { data: n } = await supabase.from("notices").select("*").eq("id", id).maybeSingle();
  if (!n) redirect("/not-allowed");
  const [school, audience] = await Promise.all([getReceiptSchool(), getAudienceText(supabase, [n])]);
  return <CircularPrint data={circularData(n, school, audience.get(n.id) ?? "")} />;
}
