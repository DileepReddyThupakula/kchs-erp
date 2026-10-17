import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { md5, planEntryTranslation, translateToTelugu, type Store, type TranslateResult } from "./core";
import { getProvider } from "./providers";

/** Cache and monthly counter live in the database (service role only). */
export function dbStore(): Store {
  const db = createAdminClient();
  return {
    async cacheGet(hash) {
      const { data } = await db.from("translation_cache").select("text_te").eq("hash", hash).maybeSingle();
      return data?.text_te ?? null;
    },
    async cachePut(hash, te, chars) {
      await db.from("translation_cache").upsert({ hash, text_te: te, chars });
    },
    async reserve(chars) {
      const { data, error } = await db.rpc("translation_reserve", { p_chars: chars });
      return !error && data === true;
    },
  };
}

export type Outcome = { state: "translated" | "kept" | "pending"; reason?: string };

/** Translate one stored diary line if the rules say it needs it. Failure leaves it "pending" (never blocks anything). */
export async function translateDiaryEntry(entryId: string): Promise<Outcome> {
  const db = createAdminClient();
  const { data: e } = await db.from("diary_entries").select("id, body, body_te, te_status, te_src_hash").eq("id", entryId).maybeSingle();
  if (!e) return { state: "pending", reason: "missing" };
  const plan = planEntryTranslation(e);
  if (plan !== "translate") return { state: "kept", reason: plan };
  let r: TranslateResult;
  try {
    r = await translateToTelugu(e.body, { purpose: "diary", provider: getProvider(), store: dbStore() });
  } catch {
    return { state: "pending", reason: "failed" };
  }
  if (!r.ok) return { state: "pending", reason: r.reason };
  const { data: applied } = await db.rpc("apply_diary_translation", { p_entry: e.id, p_te: r.te, p_hash: md5(e.body) });
  return applied ? { state: "translated" } : { state: "pending", reason: "changed" };
}

export const REASON_TEXT: Record<string, string> = {
  not_configured: "the translation service is not set up",
  cap: "this month's translation limit has been reached",
  failed: "the translation service did not answer",
  validation: "the translation changed a number, so it was not used",
  changed: "the text changed meanwhile",
};
