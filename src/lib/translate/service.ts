import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasTelugu, md5, planEntryTranslation, translateToTelugu, type Store, type TranslateResult } from "./core";
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
  has_telugu: "the text already contains Telugu",
  empty: "there is no text to translate",
};

/** Notices: same rules as the diary (reviewed Telugu is never overwritten, numbers protected, same cap). Title and text are translated together. */
export async function translateNotice(noticeId: string): Promise<Outcome> {
  const db = createAdminClient();
  const { data: n } = await db.from("notices").select("id, title, body, title_te, body_te, te_status, te_src_hash, status").eq("id", noticeId).maybeSingle();
  if (!n) return { state: "pending", reason: "missing" };
  const hash = md5(`${n.title.trim()}\n${n.body.trim()}`);
  if (n.te_status === "reviewed") return { state: "kept", reason: "reviewed" };
  if (n.te_status === "auto" && n.body_te && n.te_src_hash === hash) return { state: "kept", reason: "unchanged" };
  if (hasTelugu(n.title) || hasTelugu(n.body)) return { state: "kept", reason: "has_telugu" };
  const deps = { purpose: "notice" as const, provider: getProvider(), store: dbStore() };
  try {
    const t = await translateToTelugu(n.title, deps);
    if (!t.ok) return { state: "pending", reason: t.reason };
    const b = await translateToTelugu(n.body, deps);
    if (!b.ok) return { state: "pending", reason: b.reason };
    const { data: applied } = await db.rpc("apply_notice_translation", { p_notice: n.id, p_title_te: t.te, p_body_te: b.te, p_hash: hash });
    return applied ? { state: "translated" } : { state: "pending", reason: "changed" };
  } catch {
    return { state: "pending", reason: "failed" };
  }
}

/** For the editor's "Translate to Telugu" button: translate unsaved text; the office then reviews it. */
export async function translateNoticeText(title: string, body: string): Promise<{ ok: true; titleTe: string; bodyTe: string } | { ok: false; reason: string }> {
  const deps = { purpose: "notice" as const, provider: getProvider(), store: dbStore() };
  try {
    const t = await translateToTelugu(title, deps);
    if (!t.ok) return { ok: false, reason: t.reason };
    const b = await translateToTelugu(body, deps);
    if (!b.ok) return { ok: false, reason: b.reason };
    return { ok: true, titleTe: t.te, bodyTe: b.te };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
