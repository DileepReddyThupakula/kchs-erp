import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export const getSchoolSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
  return data;
});

export function publicStorageUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/** Current academic year, or the one picked via ?year=<id>. */
export const getAcademicYears = cache(async () => {
  // comes with the session call every page already makes (no separate query)
  const ctx = await getSessionContext();
  return ctx?.years ?? [];
});

export async function resolveYear(yearParam?: string) {
  const years = await getAcademicYears();
  return years.find((y) => y.id === yearParam) ?? years.find((y) => y.is_current) ?? years[0] ?? null;
}
