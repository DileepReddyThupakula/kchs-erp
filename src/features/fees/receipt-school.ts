import "server-only";
import { getSchoolSettings } from "@/lib/settings";
import { getBranding } from "@/lib/branding";
import type { ReceiptSchool } from "@/components/fees/receipt";

/** Letterhead values come from School settings; empty fields are simply not printed. */
export async function getReceiptSchool(): Promise<ReceiptSchool> {
  const [s, brand] = await Promise.all([getSchoolSettings(), getBranding()]);
  const address = [s?.address_line1, s?.address_line2, s?.city, s?.district && `${s.district} District`, s?.state, s?.pincode].filter(Boolean).join(", ");
  return {
    name: s?.name ?? brand.name,
    address,
    phone: s?.phone ?? null,
    udise: s?.udise_code ?? null,
    recognition: s?.affiliation_no ?? null,
    logoUrl: brand.logoUrl,
  };
}
