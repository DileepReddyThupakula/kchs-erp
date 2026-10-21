import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

import { DEMO_MODE } from "@/lib/demo";

export const FALLBACK_LOGO = DEMO_MODE ? "/demo/demo-logo-512.png" : "/brand/logo-512.webp";

export type Branding = { name: string; shortName: string; logoUrl: string; motto: string | null };

/**
 * School name + logo for places that render before sign-in (login page,
 * tab title, PWA manifest). Reads the public_branding() RPC with the anon
 * key; falls back to the bundled logo if Settings has none.
 */
export const getBranding = cache(async (): Promise<Branding> => {
  // the public demo never shows the real school's name or logo, whatever the settings say
  if (DEMO_MODE) return { name: "Sample School", shortName: "Sample", motto: null, logoUrl: FALLBACK_LOGO };
  let row: { name: string; short_name: string | null; logo_path: string | null; motto: string | null } | undefined;
  try {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data } = await supabase.rpc("public_branding");
    row = data?.[0];
  } catch {
    // network/config problem: render with fallbacks rather than failing the page
  }
  const name = row?.name ?? "School ERP";
  return {
    name,
    shortName: row?.short_name || name,
    motto: row?.motto ?? null,
    logoUrl: row?.logo_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${row.logo_path}`
      : FALLBACK_LOGO,
  };
});

