import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NoticePrint } from "@/components/notices/print-sheet";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getAudienceText } from "@/features/notices/queries";
import { fmtLong } from "@/features/notices/shared";

export const metadata = { title: "Circular" };

/** A4 circular on the school letterhead. Visibility follows the notice rules (RLS): only Admin and the notices & diary duty can print. */
export default async function PrintNotice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCapability("notices.edit"); // printing: Admin and the notices & diary duty only
  const supabase = await createClient();
  const { data: n } = await supabase.from("notices").select("*").eq("id", id).maybeSingle();
  if (!n) redirect("/not-allowed");
  const [school, audience] = await Promise.all([getReceiptSchool(), getAudienceText(supabase, [n])]);
  return <NoticePrint school={school} circularNo={n.circular_no} dateLong={fmtLong(n.publish_date)} title={n.title} body={n.body} audienceLine={audience.get(n.id) ?? ""} draft={n.status === "draft"} />;
}
