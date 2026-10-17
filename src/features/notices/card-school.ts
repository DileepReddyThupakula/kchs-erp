import "server-only";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getBranding } from "@/lib/branding";
import type { CardSchool } from "@/components/notices/diary-card";

/** School name, logo and motto for the image cards (all from School settings). */
export async function getDiaryCardSchool(): Promise<CardSchool> {
  const [s, b] = await Promise.all([getReceiptSchool(), getBranding()]);
  return { name: s.name, logoUrl: s.logoUrl, motto: b.motto };
}
