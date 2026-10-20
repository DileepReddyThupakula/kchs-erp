import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { printFooterText } from "@/features/reports/shared";
import { IdCardPrintPanel } from "@/components/id-cards/print-panel";
import { signedPhotos } from "@/features/id-cards/actions";
import type { Bundle } from "@/features/id-cards/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "ID cards" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The print sheets of a batch (?batch=) or of a few cards (?cards=a,b). Who may open it is decided by the database. */
export default async function PrintIdCards({ searchParams }: { searchParams: Promise<{ batch?: string; cards?: string; issued?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const supabase = await createClient();
  let ids: string[] = [];
  if (sp.batch && UUID.test(sp.batch)) {
    const { data } = await supabase.from("id_cards").select("id").eq("batch_id", sp.batch).eq("status", "issued").order("seq");
    ids = (data ?? []).map((r) => r.id);
  } else if (sp.cards) {
    ids = sp.cards.split(",").filter((x) => UUID.test(x)).slice(0, 60);
  }
  if (!ids.length) redirect("/not-allowed");
  const { data, error } = await supabase.rpc("id_card_print_data", { p_cards: ids });
  if (error || !data) redirect("/not-allowed");
  const bundle = data as unknown as Bundle;
  const photos = await signedPhotos(supabase, bundle.cards.map((c) => c.photo_path));
  const school = await getReceiptSchool();
  return <IdCardPrintPanel ids={ids} bundle={bundle} photos={photos} issuedNow={sp.issued === "1"} school={school} footer={printFooterText(formatDate(todayIst()), me.fullName)} />;
}
